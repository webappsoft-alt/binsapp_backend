import Lead from "../../models/Lead.js";
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
          },
        },
      ]),
    ]);
    const stats = statsArray[0] || {
      total: 0,
      new: 0,
      contacted: 0,
      converted: 0,
    };
    return {
      data,
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
      if (!["new", "contacted", "converted"].includes(data.status)) {
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
