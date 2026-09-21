import SalesLead from "../../../models/SalesLead.js";
import SalesConversation from "../../../models/SalesConversation.js";
import redis from "../../../config/redis.js";
import { logger } from "../../../config/logger.js";

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

export default {
  getSalesAgentMetrics,
  exportLeadsAsCSV,
  resolveStartDate,
};
