import SalesLead from "../../../models/SalesLead.js";
import SalesConversation from "../../../models/SalesConversation.js";
import User from "../../../models/User.js";
import redis from "../../../config/redis.js";
import { logger } from "../../../config/logger.js";
import { notifyVisitorLeadStatusUpdate } from "../socket/salesAgentSocket.js";

const ANALYTICS_CACHE_TTL_SECONDS = 900; // 15 Minutes
const CACHE_KEY_PREFIX = "sales:cache:analytics:";

/**
 * Calculates start date threshold from timeRange string
 * @param {string} range - 'today' | '7d' | '30d' | 'all'
 * @returns {Date|null}
 */
export function resolveStartDate(range = "30d") {
  const now = Date.now();
  switch (range) {
    case "today":
      return new Date(new Date().setHours(0, 0, 0, 0));
    case "7d":
      return new Date(now - 7 * 24 * 60 * 60 * 1000);
    case "30d":
      return new Date(now - 30 * 24 * 60 * 60 * 1000);
    case "all":
    default:
      return null;
  }
}

/**
 * Retrieves aggregated performance and revenue analytics for the AI Sales Agent
 * with 15-minute Redis caching.
 *
 * @param {Object} [options={}]
 * @param {string} [options.timeRange='30d'] - 'today' | '7d' | '30d' | 'all'
 * @returns {Promise<Object>} Aggregated metrics dossier
 */
export async function getSalesAgentMetrics(options = {}) {
  const timeRange = options.timeRange || "30d";
  const cacheKey = `${CACHE_KEY_PREFIX}${timeRange}`;

  // 1. Check Redis Cache
  try {
    const cached = await redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }
  } catch (err) {
    logger.warn("Analytics Redis cache lookup failed:", err?.message);
  }

  const startDate = resolveStartDate(timeRange);
  const matchFilter = startDate ? { createdAt: { $gte: startDate } } : {};

  // 2. Aggregate over SalesLead
  const [leadAggregation, totalConversations] = await Promise.all([
    SalesLead.aggregate([
      { $match: matchFilter },
      {
        $facet: {
          funnelOverview: [
            {
              $group: {
                _id: null,
                totalLeads: { $sum: 1 },
                convertedLeads: {
                  $sum: { $cond: [{ $eq: ["$status", "converted"] }, 1, 0] },
                },
                abandonedLeads: {
                  $sum: { $cond: [{ $eq: ["$status", "abandoned"] }, 1, 0] },
                },
                handedOffLeads: {
                  $sum: { $cond: [{ $eq: ["$status", "handed_off"] }, 1, 0] },
                },
                activeChatLeads: {
                  $sum: { $cond: [{ $eq: ["$status", "active_chat"] }, 1, 0] },
                },
                checkoutInitiatedCount: {
                  $sum: { $cond: ["$checkoutInitiated", 1, 0] },
                },
                totalAttributedRevenue: {
                  $sum: { $ifNull: ["$attributedRevenue", 0] },
                },
              },
            },
          ],
          byClassification: [
            {
              $group: {
                _id: "$classification",
                count: { $sum: 1 },
                revenue: { $sum: { $ifNull: ["$attributedRevenue", 0] } },
              },
            },
          ],
          byServiceType: [
            {
              $group: {
                _id: "$serviceDetails.serviceType",
                count: { $sum: 1 },
                revenue: { $sum: { $ifNull: ["$attributedRevenue", 0] } },
              },
            },
          ],
          topZipCodes: [
            { $match: { "contact.zipCode": { $exists: true, $ne: "" } } },
            {
              $group: {
                _id: "$contact.zipCode",
                count: { $sum: 1 },
                revenue: { $sum: { $ifNull: ["$attributedRevenue", 0] } },
              },
            },
            { $sort: { count: -1 } },
            { $limit: 10 },
          ],
        },
      },
    ]),
    SalesConversation.countDocuments(matchFilter),
  ]);

  const rawOverview = leadAggregation[0]?.funnelOverview[0] || {};
  const totalLeads = rawOverview.totalLeads || 0;
  const convertedLeads = rawOverview.convertedLeads || 0;
  const abandonedLeads = rawOverview.abandonedLeads || 0;
  const handedOffLeads = rawOverview.handedOffLeads || 0;
  const activeChatLeads = rawOverview.activeChatLeads || 0;
  const checkoutInitiatedCount = rawOverview.checkoutInitiatedCount || 0;
  const totalAttributedRevenue = rawOverview.totalAttributedRevenue || 0;

  const leadConversionRate = totalLeads > 0 ? Number(((convertedLeads / totalLeads) * 100).toFixed(1)) : 0;
  const checkoutConversionRate =
    checkoutInitiatedCount > 0 ? Number(((convertedLeads / checkoutInitiatedCount) * 100).toFixed(1)) : 0;
  const averageOrderValue =
    convertedLeads > 0 ? Math.round(totalAttributedRevenue / convertedLeads) : 0;

  const result = {
    timeRange,
    summary: {
      totalConversations,
      totalLeads,
      convertedLeads,
      abandonedLeads,
      handedOffLeads,
      activeChatLeads,
      checkoutInitiatedCount,
      totalAttributedRevenue,
      leadConversionRate,
      checkoutConversionRate,
      averageOrderValue,
    },
    byClassification: leadAggregation[0]?.byClassification || [],
    byServiceType: leadAggregation[0]?.byServiceType || [],
    topZipCodes: leadAggregation[0]?.topZipCodes || [],
    cachedAt: new Date().toISOString(),
  };

  // 3. Cache in Redis
  try {
    await redis.set(cacheKey, JSON.stringify(result), "EX", ANALYTICS_CACHE_TTL_SECONDS);
  } catch (setErr) {
    logger.warn("Caching analytics summary failed:", setErr?.message);
  }

  return result;
}

/**
 * Streams filtered leads formatted as standard CSV
 *
 * @param {Object} [filters={}]
 * @returns {Promise<string>} CSV string
 */
export async function exportLeadsAsCSV(filters = {}) {
  const query = {};

  if (filters.classification) {
    query.classification = filters.classification;
  }
  if (filters.status) {
    query.status = filters.status;
  }
  if (filters.timeRange) {
    const startDate = resolveStartDate(filters.timeRange);
    if (startDate) query.createdAt = { $gte: startDate };
  }

  const leads = await SalesLead.find(query).sort({ createdAt: -1 }).lean();

  const headers = [
    "Lead ID",
    "Created Date",
    "Customer Name",
    "Phone",
    "Email",
    "ZIP Code",
    "Service Type",
    "Size / Units",
    "Project Description",
    "Classification",
    "Status",
    "Checkout Generated",
    "Attributed Revenue ($)",
    "Linked Order ID",
  ];

  const escapeCSV = (val) => {
    if (val == null) return '""';
    const str = String(val).replace(/"/g, '""');
    return `"${str}"`;
  };

  const rows = leads.map((lead) => {
    return [
      escapeCSV(lead._id),
      escapeCSV(lead.createdAt ? new Date(lead.createdAt).toISOString() : ""),
      escapeCSV(lead.contact?.name || ""),
      escapeCSV(lead.contact?.phone || ""),
      escapeCSV(lead.contact?.email || ""),
      escapeCSV(lead.contact?.zipCode || ""),
      escapeCSV(lead.serviceDetails?.serviceType || ""),
      escapeCSV(lead.serviceDetails?.sizeOrVolume || ""),
      escapeCSV(lead.serviceDetails?.projectDescription || ""),
      escapeCSV(lead.classification || "WARM"),
      escapeCSV(lead.status || "active_chat"),
      escapeCSV(lead.checkoutInitiated ? "YES" : "NO"),
      escapeCSV(lead.attributedRevenue || 0),
      escapeCSV(lead.metadata?.orderId || ""),
    ].join(",");
  });

  return [headers.join(","), ...rows].join("\n");
}

/**
 * Paginated query for SalesLead records with filtering and summary stats
 * @param {Object} [filters={}]
 * @returns {Promise<Object>}
 */
export async function listSalesLeads(filters = {}) {
  const query = {};

  if (filters.classification && filters.classification !== "all") {
    query.classification = String(filters.classification).toUpperCase();
  }
  if (filters.status && filters.status !== "all") {
    query.status = filters.status;
  }
  if (filters.timeRange && filters.timeRange !== "all") {
    const startDate = resolveStartDate(filters.timeRange);
    if (startDate) query.createdAt = { $gte: startDate };
  }

  if (filters.search && filters.search.trim()) {
    const searchRegex = new RegExp(filters.search.trim(), "i");
    query.$or = [
      { "contact.name": searchRegex },
      { "contact.phone": searchRegex },
      { "contact.email": searchRegex },
      { "contact.zipCode": searchRegex },
      { "serviceDetails.serviceType": searchRegex },
      { "serviceDetails.sizeOrVolume": searchRegex },
      { "serviceDetails.projectDescription": searchRegex },
    ];
  }

  const page = Math.max(1, Number(filters.page) || 1);
  const limit = Math.max(1, Number(filters.limit) || 10);
  const skip = (page - 1) * limit;

  const [leads, total, statsArray] = await Promise.all([
    SalesLead.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("conversationRef", "sessionId channel messages")
      .lean(),
    SalesLead.countDocuments(query),
    SalesLead.aggregate([
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          hot: { $sum: { $cond: [{ $eq: ["$classification", "HOT"] }, 1, 0] } },
          warm: { $sum: { $cond: [{ $eq: ["$classification", "WARM"] }, 1, 0] } },
          commercial: { $sum: { $cond: [{ $eq: ["$classification", "COMMERCIAL"] }, 1, 0] } },
          new: { $sum: { $cond: [{ $eq: ["$status", "new"] }, 1, 0] } },
          active: { $sum: { $cond: [{ $eq: ["$status", "active_chat"] }, 1, 0] } },
          converted: { $sum: { $cond: [{ $eq: ["$status", "converted"] }, 1, 0] } },
          abandoned: { $sum: { $cond: [{ $eq: ["$status", "abandoned"] }, 1, 0] } },
          handedOff: { $sum: { $cond: [{ $eq: ["$status", "handed_off"] }, 1, 0] } },
          rejected: { $sum: { $cond: [{ $eq: ["$status", "rejected"] }, 1, 0] } },
          totalRevenue: { $sum: "$attributedRevenue" },
        },
      },
    ]),
  ]);

  const stats = statsArray[0] || {
    total: 0,
    hot: 0,
    warm: 0,
    commercial: 0,
    new: 0,
    active: 0,
    converted: 0,
    abandoned: 0,
    handedOff: 0,
    rejected: 0,
    totalRevenue: 0,
  };

  // Attach matching registered user (if already created in User collection)
  let leadsWithUsers = leads;
  try {
    const phoneList = leads
      .map((l) => (l.contact?.phone || "").replace(/[^\d]/g, ""))
      .filter((p) => p.length >= 7);
    const emailList = leads
      .map((l) => (l.contact?.email || "").toLowerCase().trim())
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

      leadsWithUsers = leads.map((lead) => {
        const lPhone = (lead.contact?.phone || "").replace(/[^\d]/g, "");
        const lEmail = (lead.contact?.email || "").toLowerCase().trim();
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
                name: user.name || lead.contact?.name || "User",
                phone: user.phone || lead.contact?.phone,
                email: user.email || lead.contact?.email,
                role: user.role || "renter",
                profilePicture: user.profilePicture || "",
              }
            : null,
        };
      });
    } else {
      leadsWithUsers = leads.map((lead) => ({ ...lead, existingUser: null }));
    }
  } catch (err) {
    logger.warn("Failed to attach matching users to sales leads:", err);
    leadsWithUsers = leads.map((lead) => ({ ...lead, existingUser: null }));
  }

  return {
    leads: leadsWithUsers,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit) || 1,
    stats,
  };
}

/**
 * Updates a SalesLead status or metadata
 * @param {string} id - Lead ID
 * @param {Object} updates - Fields to update
 * @returns {Promise<Object>}
 */
export async function updateSalesLead(id, updates = {}) {
  const allowed = ["status", "classification", "attributedRevenue"];
  const updateDoc = {};
  for (const key of allowed) {
    if (updates[key] !== undefined) {
      updateDoc[key] = updates[key];
    }
  }
  if (updates.notes !== undefined) {
    updateDoc["metadata.adminNotes"] = updates.notes;
  }
  if (updates.metadata && typeof updates.metadata === "object") {
    for (const [k, v] of Object.entries(updates.metadata)) {
      updateDoc[`metadata.${k}`] = v;
    }
  }

  const lead = await SalesLead.findByIdAndUpdate(
    id,
    { $set: updateDoc },
    { new: true, runValidators: true }
  ).lean();

  if (lead) {
    try {
      let targetSessionId = lead.metadata?.sessionId || null;
      if (!targetSessionId && lead.conversationRef) {
        const conv = await SalesConversation.findById(lead.conversationRef).select("sessionId").lean();
        targetSessionId = conv?.sessionId || null;
      }
      if (!targetSessionId) {
        const conv = await SalesConversation.findOne({ leadRef: lead._id }).select("sessionId").lean();
        targetSessionId = conv?.sessionId || null;
      }
      if (targetSessionId) {
        notifyVisitorLeadStatusUpdate(targetSessionId, {
          id: String(lead._id),
          status: lead.status,
          classification: lead.classification,
          serviceType: lead.serviceDetails?.serviceType || "Dumbster",
          updatedAt: lead.updatedAt,
        });
      }
    } catch (notifyErr) {
      logger.warn("Failed to notify visitor socket about lead status update:", notifyErr?.message);
    }
  }

  return lead;
}

export default {
  getSalesAgentMetrics,
  exportLeadsAsCSV,
  resolveStartDate,
  listSalesLeads,
  updateSalesLead,
};
