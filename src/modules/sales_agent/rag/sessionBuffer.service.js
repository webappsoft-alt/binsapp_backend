import redis from "../../../config/redis.js";
import SalesConversation from "../../../models/SalesConversation.js";
import { logger } from "../../../config/logger.js";
import { getSessionFunnelState } from "../funnel/index.js";

const SESSION_TTL_SECONDS = 7200; // 2 Hours sliding window
const MAX_SLIDING_WINDOW = 10;     // Max messages in in-memory working buffer

/**
 * Generates Redis key for session message list
 * @param {string} sessionId
 * @returns {string}
 */
export function getSessionMessagesKey(sessionId) {
  return `sales:session:${sessionId}:messages`;
}

/**
 * Generates Redis key for session metadata hash
 * @param {string} sessionId
 * @returns {string}
 */
export function getSessionMetaKey(sessionId) {
  return `sales:session:${sessionId}:meta`;
}

/**
 * Appends a message to the Redis sliding window buffer and updates session metadata
 *
 * @param {string} sessionId - Unique session ID
 * @param {Object} message - { role, content, toolCalls, actionCards, timestamp }
 * @param {Object} [meta={}] - Session metadata { currentFunnel, visitorInfo, leadRef, actionCards }
 * @returns {Promise<void>}
 */
export async function appendMessage(sessionId, message, meta = {}) {
  if (!sessionId) return;

  const msgKey = getSessionMessagesKey(sessionId);
  const metaKey = getSessionMetaKey(sessionId);

  const formattedMsg = {
    role: message.role,
    content: message.content || "",
    toolCalls: message.toolCalls || [],
    actionCards: message.actionCards || [],
    timestamp: message.timestamp || new Date().toISOString(),
  };

  try {
    const pipeline = redis.pipeline();

    // Push message to list and trim to maintain sliding window of 10 items
    pipeline.rpush(msgKey, JSON.stringify(formattedMsg));
    pipeline.ltrim(msgKey, -MAX_SLIDING_WINDOW, -1);
    pipeline.expire(msgKey, SESSION_TTL_SECONDS);

    // Update metadata hash if provided
    const hashFields = {
      lastActive: new Date().toISOString(),
    };
    if (meta.currentFunnel) hashFields.currentFunnel = meta.currentFunnel;
    if (meta.leadRef) hashFields.leadRef = String(meta.leadRef);
    if (meta.visitorInfo) hashFields.visitorInfo = JSON.stringify(meta.visitorInfo);
    if (meta.actionCards && Array.isArray(meta.actionCards) && meta.actionCards.length > 0) {
      hashFields.latestActionCards = JSON.stringify(meta.actionCards);
    }

    pipeline.hset(metaKey, hashFields);
    pipeline.expire(metaKey, SESSION_TTL_SECONDS);

    await pipeline.exec();
  } catch (err) {
    logger.warn(`Redis session buffer update failed for sessionId ${sessionId}:`, err?.message || err);
  }

  // Asynchronously flush message to MongoDB without blocking chat response
  syncMessageToMongoAsync(sessionId, formattedMsg, meta);
}

/**
 * Retrieves the sliding window message history for a session from Redis
 * (Falls back to MongoDB if Redis cache is cold)
 *
 * @param {string} sessionId - Unique session ID
 * @param {number} [limit=10] - Number of recent messages to return
 * @returns {Promise<Array<Object>>} Array of message objects
 */
export async function getSessionHistory(sessionId, limit = MAX_SLIDING_WINDOW) {
  if (!sessionId) return [];

  const msgKey = getSessionMessagesKey(sessionId);

  try {
    const cachedMessages = await redis.lrange(msgKey, -limit, -1);
    if (cachedMessages && cachedMessages.length > 0) {
      return cachedMessages.map((m) => JSON.parse(m));
    }
  } catch (err) {
    logger.warn(`Redis session history fetch failed for sessionId ${sessionId}:`, err?.message || err);
  }

  // Cold cache fallback: Fetch from MongoDB and repopulate Redis
  try {
    const conversation = await SalesConversation.findOne({ sessionId }).lean();
    if (conversation && Array.isArray(conversation.messages) && conversation.messages.length > 0) {
      const recent = conversation.messages.slice(-limit);

      // Repopulate Redis in background
      try {
        const pipeline = redis.pipeline();
        for (const msg of recent) {
          pipeline.rpush(msgKey, JSON.stringify(msg));
        }
        pipeline.ltrim(msgKey, -MAX_SLIDING_WINDOW, -1);
        pipeline.expire(msgKey, SESSION_TTL_SECONDS);
        await pipeline.exec();
      } catch (repErr) {
        logger.debug("Repopulating Redis session cache failed:", repErr?.message);
      }

      return recent;
    }
  } catch (dbErr) {
    logger.error(`MongoDB fallback fetch failed for sessionId ${sessionId}:`, dbErr);
  }

  return [];
}

/**
 * Retrieves session metadata including full funnel state, step indicators, and action cards
 * @param {string} sessionId
 * @returns {Promise<Object>}
 */
export async function getSessionMeta(sessionId) {
  if (!sessionId) return {};

  const metaKey = getSessionMetaKey(sessionId);
  let rawMeta = {};

  try {
    const meta = await redis.hgetall(metaKey);
    if (meta && Object.keys(meta).length > 0) {
      rawMeta = { ...meta };
      if (rawMeta.visitorInfo) {
        try {
          rawMeta.visitorInfo = JSON.parse(rawMeta.visitorInfo);
        } catch {
          // Keep as string
        }
      }
      if (rawMeta.latestActionCards) {
        try {
          rawMeta.latestActionCards = JSON.parse(rawMeta.latestActionCards);
        } catch {
          rawMeta.latestActionCards = [];
        }
      }
    }
  } catch (err) {
    logger.warn(`Redis session meta fetch failed for ${sessionId}:`, err?.message || err);
  }

  // Fetch structured funnel state
  const funnelState = await getSessionFunnelState(sessionId);

  return {
    currentFunnel: funnelState.currentFunnel || rawMeta.currentFunnel || "initial_intent",
    currentStep: funnelState.currentStep || "intent_selection",
    nextStep: funnelState.nextStep || "service_selection",
    missingFields: funnelState.missingFields || [],
    collectedData: funnelState.collectedData || {},
    leadRef: rawMeta.leadRef || null,
    visitorInfo: rawMeta.visitorInfo || {},
    actionCards: rawMeta.latestActionCards || [],
    lastActive: rawMeta.lastActive || new Date().toISOString(),
  };
}

/**
 * Asynchronously persists conversation message to MongoDB in the background
 */
function syncMessageToMongoAsync(sessionId, formattedMsg, meta) {
  setImmediate(async () => {
    try {
      const updateDoc = {
        $push: { messages: formattedMsg },
      };

      const setFields = {};
      if (meta?.currentFunnel) setFields.currentFunnel = meta.currentFunnel;
      if (meta?.leadRef) setFields.leadRef = meta.leadRef;
      if (Object.keys(setFields).length > 0) {
        updateDoc.$set = setFields;
      }

      const setOnInsert = {
        sessionId,
        visitorInfo: meta?.visitorInfo || {},
      };
      updateDoc.$setOnInsert = setOnInsert;

      await SalesConversation.findOneAndUpdate({ sessionId }, updateDoc, {
        upsert: true,
        new: true,
      });
    } catch (dbError) {
      logger.error(`Failed to asynchronously persist message to MongoDB for sessionId ${sessionId}:`, dbError);
    }
  });
}

export default {
  appendMessage,
  getSessionHistory,
  getSessionMeta,
  getSessionMessagesKey,
  getSessionMetaKey,
};
