import SalesLead from "../../../models/SalesLead.js";
import SalesConversation from "../../../models/SalesConversation.js";
import redis from "../../../config/redis.js";
import { logger } from "../../../config/logger.js";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Invalidates all cached analytics summary keys in Redis
 */
export async function invalidateAnalyticsCache() {
  try {
    const keys = await redis.keys("sales:cache:analytics:*");
    if (keys && keys.length > 0) {
      await redis.del(...keys);
    }
  } catch (err) {
    logger.debug("Analytics cache invalidation error:", err?.message);
  }
}

/**
 * Records revenue attribution and transitions SalesLead to 'converted'
 * when an order is completed.
 *
 * @param {Object} params
 * @param {string} params.orderId - Unique Order ID
 * @param {string} [params.customerEmail] - Customer email
 * @param {string} [params.customerPhone] - Customer phone
 * @param {string} [params.refToken] - One-time prefilled checkout token
 * @param {number} [params.amount=0] - Revenue amount in USD
 * @returns {Promise<{ attributed: boolean, leadId?: string, amount?: number }>}
 */
export async function recordOrderRevenueAttribution({
  orderId,
  customerEmail = "",
  customerPhone = "",
  refToken = "",
  amount = 0,
}) {
  if (!orderId) return { attributed: false };

  try {
    let lead = null;

    // 1. Primary Match: Match by unique prefilled checkout token
    if (refToken && typeof refToken === "string" && refToken.trim().length > 0) {
      lead = await SalesLead.findOne({ prefilledCheckoutToken: refToken.trim() });
    }

    // 2. Secondary Match: Match by phone or email within last 7 days
    if (!lead && (customerEmail || customerPhone)) {
      const matchConditions = [];
      if (customerEmail && customerEmail.includes("@")) {
        matchConditions.push({ "contact.email": customerEmail.toLowerCase().trim() });
      }
      if (customerPhone && customerPhone.length >= 7) {
        matchConditions.push({ "contact.phone": customerPhone.trim() });
      }

      if (matchConditions.length > 0) {
        lead = await SalesLead.findOne({
          $or: matchConditions,
          createdAt: { $gte: new Date(Date.now() - SEVEN_DAYS_MS) },
          status: { $in: ["active_chat", "abandoned", "handed_off"] },
        }).sort({ createdAt: -1 });
      }
    }

    if (!lead) {
      return { attributed: false };
    }

    // 3. Atomically transition lead to 'converted' with attributed revenue
    const revenueNumber = Math.max(0, Number(amount) || 0);

    lead.status = "converted";
    lead.attributedRevenue = (lead.attributedRevenue || 0) + revenueNumber;
    lead.metadata = {
      ...lead.metadata,
      orderId: String(orderId),
      convertedAt: new Date().toISOString(),
    };

    await lead.save();

    // 4. Update SalesConversation if linked
    if (lead.conversationRef) {
      await SalesConversation.findByIdAndUpdate(lead.conversationRef, {
        currentFunnel: "converted",
      });
    }

    // 5. Invalidate analytics dashboard cache
    await invalidateAnalyticsCache();

    logger.info(
      `💰 Revenue Attributed to AI Sales Agent: Lead ${lead._id} linked to Order ${orderId} ($${revenueNumber})`
    );

    return {
      attributed: true,
      leadId: lead._id.toString(),
      amount: revenueNumber,
    };
  } catch (error) {
    logger.error("Error in recordOrderRevenueAttribution:", error);
    return { attributed: false, error: error.message };
  }
}

export default {
  recordOrderRevenueAttribution,
  invalidateAnalyticsCache,
};
