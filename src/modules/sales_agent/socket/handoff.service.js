import redis from "../../../config/redis.js";
import SalesLead from "../../../models/SalesLead.js";
import SalesConversation from "../../../models/SalesConversation.js";
import { logger } from "../../../config/logger.js";

const HANDOFF_TTL_SECONDS = 3600; // 1 Hour

/**
 * Checks if a session is currently paused for human operator takeover
 * @param {string} sessionId
 * @returns {Promise<boolean>}
 */
export async function isSessionPaused(sessionId) {
  if (!sessionId) return false;
  try {
    const val = await redis.get(`sales:session:${sessionId}:paused`);
    return val === "true";
  } catch (err) {
    logger.warn("Error checking session paused state:", err?.message);
    return false;
  }
}

/**
 * Assigns conversation session to a human operator and pauses AI auto-responses
 *
 * @param {string} sessionId - Visitor session ID
 * @param {string} operatorId - Staff user ID
 * @param {string} [operatorName="Support Specialist"] - Operator display name
 * @returns {Promise<{ success: boolean, sessionId: string }>}
 */
export async function claimSessionByOperator(sessionId, operatorId, operatorName = "Support Specialist") {
  if (!sessionId || !operatorId) {
    return { success: false, error: "sessionId and operatorId are required." };
  }

  try {
    const pipeline = redis.pipeline();
    pipeline.set(`sales:session:${sessionId}:paused`, "true", "EX", HANDOFF_TTL_SECONDS);
    pipeline.set(`sales:session:${sessionId}:operator`, JSON.stringify({ operatorId, operatorName }), "EX", HANDOFF_TTL_SECONDS);
    await pipeline.exec();

    // Update SalesLead to handed_off
    const conv = await SalesConversation.findOne({ sessionId });
    if (conv?.leadRef) {
      await SalesLead.findByIdAndUpdate(conv.leadRef, {
        status: "handed_off",
        "metadata.operatorId": operatorId,
        "metadata.operatorName": operatorName,
        "metadata.handedOffAt": new Date().toISOString(),
      });
    }

    logger.info(`👨‍💼 Live Handoff: Operator ${operatorName} (${operatorId}) claimed session ${sessionId}`);

    return {
      success: true,
      sessionId,
      operatorId,
      operatorName,
    };
  } catch (err) {
    logger.error("Error claiming session by operator:", err);
    return { success: false, error: err.message };
  }
}

/**
 * Releases operator takeover and unpauses AI assistant responses for the session
 *
 * @param {string} sessionId
 * @returns {Promise<{ success: boolean }>}
 */
export async function releaseSessionToAI(sessionId) {
  if (!sessionId) return { success: false };

  try {
    const pipeline = redis.pipeline();
    pipeline.del(`sales:session:${sessionId}:paused`);
    pipeline.del(`sales:session:${sessionId}:operator`);
    await pipeline.exec();

    // Revert lead to active_chat
    const conv = await SalesConversation.findOne({ sessionId });
    if (conv?.leadRef) {
      await SalesLead.findByIdAndUpdate(conv.leadRef, {
        status: "active_chat",
      });
    }

    logger.info(`🤖 Live Handoff Released: Session ${sessionId} returned to AI assistant.`);

    return { success: true, sessionId };
  } catch (err) {
    logger.error("Error releasing session to AI:", err);
    return { success: false, error: err.message };
  }
}

/**
 * Retrieves full handoff status, pause flag, and active operator details for a session
 * @param {string} sessionId
 * @returns {Promise<{ isPaused: boolean, isHandedOff: boolean, operator: Object|null }>}
 */
export async function getSessionHandoffState(sessionId) {
  if (!sessionId) {
    return { isPaused: false, isHandedOff: false, operator: null };
  }

  try {
    const [paused, operatorRaw] = await Promise.all([
      redis.get(`sales:session:${sessionId}:paused`),
      redis.get(`sales:session:${sessionId}:operator`),
    ]);

    const isPaused = paused === "true";
    let operator = null;
    if (operatorRaw) {
      try {
        operator = JSON.parse(operatorRaw);
      } catch {
        operator = { name: "Specialist" };
      }
    }

    return {
      isPaused,
      isHandedOff: isPaused,
      operator,
    };
  } catch (err) {
    logger.warn("Error fetching session handoff state:", err?.message);
    return { isPaused: false, isHandedOff: false, operator: null };
  }
}

/**
 * Records visitor explicit handoff request with contact data
 *
 * @param {string} sessionId
 * @param {Object} contactData
 * @param {string} reason
 * @returns {Promise<Object>}
 */
export async function recordVisitorHandoffRequest(sessionId, contactData = {}, reason = "") {
  if (!sessionId) return { success: false };

  try {
    const name = contactData.name || "";
    const phone = contactData.phone || "";
    const email = contactData.email || "";

    if (phone || email) {
      let lead = await SalesLead.findOne({ "contact.phone": phone });
      if (!lead && email) {
        lead = await SalesLead.findOne({ "contact.email": email.toLowerCase() });
      }

      if (lead) {
        lead.status = "handed_off";
        lead.metadata = {
          ...lead.metadata,
          handoffRequestedAt: new Date().toISOString(),
          handoffReason: reason,
        };
        await lead.save();
      } else {
        await SalesLead.create({
          contact: { name, phone, email },
          serviceDetails: { projectDescription: `Handoff request: ${reason}` },
          status: "handed_off",
          classification: "HOT",
          metadata: {
            sessionId,
            handoffRequestedAt: new Date().toISOString(),
            handoffReason: reason,
          },
        });
      }
    }

    return { success: true };
  } catch (err) {
    logger.error("Error recording visitor handoff request:", err);
    return { success: false, error: err.message };
  }
}

export default {
  isSessionPaused,
  getSessionHandoffState,
  claimSessionByOperator,
  releaseSessionToAI,
  recordVisitorHandoffRequest,
};

