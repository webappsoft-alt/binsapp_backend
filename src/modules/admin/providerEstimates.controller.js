import ProviderLead from "../../models/ProviderLead.js";
import User from "../../models/User.js";
import Order from "../../models/Order.js";
import logger from "../../config/logger.js";
import { sendSMS } from "../../utils/sendSMS.js";
import providerLeadsService from "../provider_leads/service.js";
import { originFilter, attachRepeats, leadOrigin } from "../../utils/leadOrigin.js";
export { attachRepeats, leadOrigin };

/**
 * Get all Provider Leads & Estimates across the platform for Super Admin oversight
 */
export async function getAdminProviderEstimates(req, res) {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit) || 15));
    const skip = (page - 1) * limit;

    const { status, serviceType, search, providerId, origin } = req.query;

    const filter = {};
    const and = [];
    const byOrigin = originFilter(origin);
    if (byOrigin) and.push(byOrigin);

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
      and.push({ $or: [
        { leadNumber: { $regex: q, $options: "i" } },
        { "customerInfo.name": { $regex: q, $options: "i" } },
        { "customerInfo.email": { $regex: q, $options: "i" } },
        { "customerInfo.phone": { $regex: q, $options: "i" } },
        { "customerInfo.city": { $regex: q, $options: "i" } },
        { projectType: { $regex: q, $options: "i" } },
      ] });
    }
    if (and.length) filter.$and = and;

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
      byCustomerCount,
      byOwnerCount,
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
      ProviderLead.countDocuments(originFilter("customer")),
      ProviderLead.countDocuments(originFilter("owner")),
    ]);

    const acceptedTotal = acceptedCount + convertedCount;
    const totalPipelineValue = sumAccepted?.[0]?.totalValue || 0;

    return res.status(200).json({
      success: true,
      data: {
        leads: await attachRepeats(leads),
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
          byCustomer: byCustomerCount,
          byOwner: byOwnerCount,
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

    const [withRepeat] = await attachRepeats([lead]);
    return res.status(200).json({
      success: true,
      data: withRepeat,
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

/**
 * Super Admin: Create a new Lead and/or Estimate directly
 */
export async function createAdminEstimate(req, res) {
  try {
    let {
      providerId,
      customerId,
      customerInfo,
      serviceType,
      dumpsterSize,
      projectType,
      startDate,
      numDays,
      placementNotes,
      drivewayProtection,
      initialEstimate,
      autoCreateCustomer,
      unitId,
    } = req.body;

    // If providerId not explicitly given, try to find an active provider
    if (!providerId) {
      const defaultProvider = await User.findOne({ role: "renter" }).select("_id").lean();
      if (!defaultProvider) {
        return res.status(400).json({
          success: false,
          message: "No registered providers found. Please create or register a provider first.",
        });
      }
      providerId = defaultProvider._id;
    }

    const lead = await providerLeadsService.createProviderManualLead({
      providerId,
      customerId,
      customerInfo,
      serviceType: serviceType || "Dumbster",
      dumpsterSize: dumpsterSize || "20",
      projectType: projectType || "General Cleanout",
      startDate: startDate || null,
      numDays: Number(numDays || 3),
      placementNotes: placementNotes || "",
      drivewayProtection: drivewayProtection !== false,
      source: "admin_entry",
      createdBy: "admin",
      initialEstimate: initialEstimate || null,
      autoCreateCustomer: autoCreateCustomer !== false,
      unitId: unitId || null,
    });

    return res.status(201).json({
      success: true,
      message: "Lead & estimate created successfully by Admin.",
      data: lead,
    });
  } catch (error) {
    logger.error("createAdminEstimate error:", error);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Failed to create estimate",
    });
  }
}

/**
 * Super Admin: Get list of active providers for estimate assignment
 */
export async function getAdminProvidersList(req, res) {
  try {
    const providers = await User.find({ role: "renter" })
      .select("_id name email phone comp_name address city state zip")
      .sort({ comp_name: 1, name: 1 })
      .lean();

    return res.status(200).json({
      success: true,
      data: providers,
    });
  } catch (error) {
    logger.error("getAdminProvidersList error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch providers list",
    });
  }
}

/**
 * Super Admin: Submit or update estimate pricing on an existing lead
 */
export async function submitAdminEstimate(req, res) {
  try {
    const { id } = req.params;
    const lead = await ProviderLead.findById(id);
    if (!lead) {
      return res.status(404).json({ success: false, message: "Lead record not found." });
    }

    const {
      estimatedPrice,
      includedTons,
      rentalDays,
      extraDayPrice,
      overagePerTon,
      deliveryFee,
      validDays,
      providerNotes,
    } = req.body;

    const updatedLead = await providerLeadsService.createOrUpdateEstimate(
      id,
      lead.provider,
      {
        estimatedPrice,
        includedTons,
        rentalDays,
        extraDayPrice,
        overagePerTon,
        deliveryFee,
        validDays,
        providerNotes,
      }
    );

    return res.status(200).json({
      success: true,
      message: "Estimate updated and dispatched successfully.",
      data: updatedLead,
    });
  } catch (error) {
    logger.error("submitAdminEstimate error:", error);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Failed to update estimate",
    });
  }
}
