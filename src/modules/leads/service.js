import Lead from "../../models/Lead.js";
import User from "../../models/User.js";
import { NotFoundError, BadRequestError } from "../../utils/apiError.js";
import { notifyCommercialParties } from "../../utils/commercialNotify.js";
import logger from "../../config/logger.js";

class LeadService {
  async createDemoRequest(data) {
    const {
      companyName,
      contactName,
      email,
      phone,
      serviceArea,
      estimatedMonthlyVolume,
      numberOfLocations,
      notes,
    } = data;

    if (!companyName || !contactName || !email || !phone) {
      throw new BadRequestError(
        "companyName, contactName, email, and phone are required",
      );
    }

    const lead = await Lead.create({
      companyName,
      contactName,
      email,
      phone,
      serviceArea: serviceArea || "",
      estimatedMonthlyVolume: Number(estimatedMonthlyVolume) || 0,
      numberOfLocations: Number(numberOfLocations) || 1,
      notes: notes || "",
      status: "new",
    });

    // Admin-only notify (no customer user yet). actorId resolved to admin inside.
    notifyCommercialParties({
      actorId: null,
      customer: null,
      type: "lead_received",
      title: "New commercial demo request",
      description: `${companyName} (${contactName}) requested a demo. Volume: ${lead.estimatedMonthlyVolume}/mo, locations: ${lead.numberOfLocations}.`,
      notifyAdmin: true,
      metadata: {
        action: "lead_received",
        leadId: lead._id.toString(),
        email,
        phone,
        companyName,
        contactName,
      },
    }).catch((err) => logger.error("lead notify failed", err));

    return lead;
  }

  async listLeads({ status, page = 1, limit = 20 } = {}) {
    const query = {};
    if (status) query.status = status;
    const skip = (Math.max(1, Number(page)) - 1) * Number(limit);
    const [data, total, statsArray] = await Promise.all([
      Lead.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit) || 20)
        .lean(),
      Lead.countDocuments(query),
      Lead.aggregate([
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            new: { $sum: { $cond: [{ $eq: ["$status", "new"] }, 1, 0] } },
            contacted: {
              $sum: { $cond: [{ $eq: ["$status", "contacted"] }, 1, 0] },
            },
            converted: {
              $sum: { $cond: [{ $eq: ["$status", "converted"] }, 1, 0] },
            },
            rejected: {
              $sum: { $cond: [{ $eq: ["$status", "rejected"] }, 1, 0] },
            },
          },
        },
      ]),
    ]);
    const stats = statsArray[0] || {
      total: 0,
      new: 0,
      contacted: 0,
      converted: 0,
      rejected: 0,
    };

    // Attach matching registered user (if already created in User collection)
    let dataWithUsers = data;
    try {
      const phoneList = data
        .map((l) => (l.phone || "").replace(/[^\d]/g, ""))
        .filter((p) => p.length >= 7);
      const emailList = data
        .map((l) => (l.email || "").toLowerCase().trim())
        .filter(Boolean);

      const orConds = [];
      if (phoneList.length > 0) {
        phoneList.forEach((digits) => {
          const sub = digits.slice(-10);
          orConds.push({ phone: { $regex: sub } });
        });
      }
      if (emailList.length > 0) {
        orConds.push({ email: { $in: emailList } });
      }

      if (orConds.length > 0) {
        const matchedUsers = await User.find({ $or: orConds })
          .select("_id name phone email role profilePicture status")
          .lean();

        dataWithUsers = data.map((lead) => {
          const lPhone = (lead.phone || "").replace(/[^\d]/g, "");
          const lEmail = (lead.email || "").toLowerCase().trim();
          const user = matchedUsers.find((u) => {
            if (u.status === "deleted") return false;
            const uPhone = (u.phone || "").replace(/[^\d]/g, "");
            const uEmail = (u.email || "").toLowerCase().trim();
            return (
              (lPhone && lPhone.length >= 7 && (uPhone.includes(lPhone) || lPhone.includes(uPhone))) ||
              (lEmail && lEmail === uEmail)
            );
          });
          return {
            ...lead,
            existingUser: user
              ? {
                  _id: user._id,
                  name: user.name || lead.contactPerson || lead.contactName || "User",
                  phone: user.phone || lead.phone,
                  email: user.email || lead.email,
                  role: user.role || "renter",
                  profilePicture: user.profilePicture || "",
                }
              : null,
          };
        });
      } else {
        dataWithUsers = data.map((lead) => ({ ...lead, existingUser: null }));
      }
    } catch (err) {
      logger.warn("Failed to attach matching users to commercial leads:", err);
      dataWithUsers = data.map((lead) => ({ ...lead, existingUser: null }));
    }

    return {
      data: dataWithUsers,
      page: Number(page) || 1,
      limit: Number(limit) || 20,
      total,
      totalPages: Math.ceil(total / (Number(limit) || 20)),
      stats,
    };
  }

  async updateLead(id, data) {
    const allowed = {};
    if (data.status != null) {
      if (!["new", "contacted", "converted", "rejected"].includes(data.status)) {
        throw new BadRequestError("Invalid lead status");
      }
      allowed.status = data.status;
    }
    if (data.notes != null) allowed.notes = data.notes;
    if (data.convertedCompany != null) {
      allowed.convertedCompany = data.convertedCompany;
    }

    const lead = await Lead.findByIdAndUpdate(
      id,
      { $set: allowed },
      { new: true, runValidators: true },
    );
    if (!lead) throw new NotFoundError("Lead not found");
    return lead;
  }
}

export default new LeadService();
