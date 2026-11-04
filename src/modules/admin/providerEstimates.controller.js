import ProviderLead from "../../models/ProviderLead.js";
import User from "../../models/User.js";
import Order from "../../models/Order.js";
import logger from "../../config/logger.js";
import { sendSMS } from "../../utils/sendSMS.js";

/**
 * Get all Provider Leads & Estimates across the platform for Super Admin oversight
 */
export async function getAdminProviderEstimates(req, res) {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit) || 15));
    const skip = (page - 1) * limit;

    const { status, serviceType, search, providerId } = req.query;

    const filter = {};

    if (status && status !== "all") {
      if (status === "accepted" || status === "converted") {
        filter.status = { $in: ["estimate_accepted", "converted", "accepted"] };
      } else {
        filter.status = status;
      }
    }

    if (serviceType && serviceType !== "all") {
      if (/dumpster|dumbster/i.test(serviceType)) {
        filter.serviceType = { $regex: /dumbster|dumpster/i };
      } else if (/porta/i.test(serviceType)) {
        filter.serviceType = { $regex: /porta/i };
      } else if (/junk/i.test(serviceType)) {
        filter.serviceType = { $regex: /junk/i };
      } else if (/tree/i.test(serviceType)) {
        filter.serviceType = { $regex: /tree/i };
      } else {
        filter.serviceType = serviceType;
      }
    }

    if (providerId) {
      filter.provider = providerId;
    }

    if (search && search.trim()) {
      const q = search.trim();
      filter.$or = [
        { leadNumber: { $regex: q, $options: "i" } },
        { "customerInfo.name": { $regex: q, $options: "i" } },
        { "customerInfo.email": { $regex: q, $options: "i" } },
        { "customerInfo.phone": { $regex: q, $options: "i" } },
        { "customerInfo.city": { $regex: q, $options: "i" } },
        { projectType: { $regex: q, $options: "i" } },
      ];
    }

    const [
      leads,
      total,
      totalAll,
      pendingCount,
      sentCount,
      acceptedCount,
      convertedCount,
      dumpsterCount,
      portaPottyCount,
      junkRemovalCount,
      treeRemovalCount,
      sumAccepted,
    ] = await Promise.all([
      ProviderLead.find(filter)
        .populate("provider", "name email phone comp_name profilePicture address city state zip rating avgRating")
        .populate("customer", "name email phone profilePicture address")
        .populate("dumpster", "size title price")
        .populate("order", "order_id status total_price")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      ProviderLead.countDocuments(filter),
      ProviderLead.countDocuments({}),
      ProviderLead.countDocuments({ status: "pending" }),
      ProviderLead.countDocuments({ status: "estimate_sent" }),
      ProviderLead.countDocuments({ status: "estimate_accepted" }),
      ProviderLead.countDocuments({ status: "converted" }),
      ProviderLead.countDocuments({ serviceType: { $regex: /dumbster|dumpster/i } }),
      ProviderLead.countDocuments({ serviceType: { $regex: /porta/i } }),
      ProviderLead.countDocuments({ serviceType: { $regex: /junk/i } }),
      ProviderLead.countDocuments({ serviceType: { $regex: /tree/i } }),
      ProviderLead.aggregate([
        {
          $match: {
            status: { $in: ["estimate_accepted", "converted"] },
          },
        },
        {
          $group: {
            _id: null,
            totalValue: {
              $sum: { $ifNull: ["$estimate.estimatedPrice", 0] },
            },
          },
        },
      ]),
    ]);

    const acceptedTotal = acceptedCount + convertedCount;
    const totalPipelineValue = sumAccepted?.[0]?.totalValue || 0;

    return res.status(200).json({
      success: true,
      data: {
        leads,
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit) || 1,
        },
        stats: {
          totalAll,
          pending: pendingCount,
          estimateSent: sentCount,
          accepted: acceptedTotal,
          dumpster: dumpsterCount,
          portaPotty: portaPottyCount,
          junkRemoval: junkRemovalCount,
          treeRemoval: treeRemovalCount,
          totalRevenue: totalPipelineValue,
        },
      },
    });
  } catch (error) {
    logger.error("getAdminProviderEstimates error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch provider estimates",
    });
  }
}

/**
 * Get single Provider Lead / Estimate detail
 */
export async function getAdminProviderEstimateById(req, res) {
  try {
    const { id } = req.params;
    const lead = await ProviderLead.findById(id)
      .populate("provider", "name email phone comp_name profilePicture address city state zip rating avgRating")
      .populate("customer", "name email phone profilePicture address")
      .populate("dumpster")
      .populate("order")
      .lean();

    if (!lead) {
      return res.status(404).json({
        success: false,
        message: "Estimate / lead not found.",
      });
    }

    return res.status(200).json({
      success: true,
      data: lead,
    });
  } catch (error) {
    logger.error("getAdminProviderEstimateById error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch estimate detail",
    });
  }
}

/**
 * Nudge provider via SMS to respond to a pending lead
 */
export async function nudgeProviderForEstimate(req, res) {
  try {
    const { id } = req.params;
    const lead = await ProviderLead.findById(id).populate("provider");

    if (!lead) {
      return res.status(404).json({ success: false, message: "Lead not found." });
    }

    if (!lead.provider?.phone) {
      return res.status(400).json({
        success: false,
        message: "Assigned provider has no valid phone number on file.",
      });
    }

    const providerPhone = lead.provider.phone;
    const provName = lead.provider.comp_name || lead.provider.name || "Provider";
    const msg = `BINS APP REMINDER: Hi ${provName}, customer ${lead.customerInfo.name} is waiting for an estimate on quote #${lead.leadNumber} (${lead.dumpsterSize} Yard). Please review: https://binsapp.ai/renter/leads`;

    const smsRes = await sendSMS({
      to: providerPhone,
      body: msg,
      type: "lead_alert",
      metadata: { leadId: lead._id.toString(), nudge: true },
    });

    return res.status(200).json({
      success: true,
      message: `Nudge SMS sent to ${lead.provider.name || "provider"} successfully.`,
      sms: smsRes,
    });
  } catch (error) {
    logger.error("nudgeProviderForEstimate error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to nudge provider",
    });
  }
}
