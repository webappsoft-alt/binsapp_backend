import SalesLead from "../../../models/SalesLead.js";
import SalesConversation from "../../../models/SalesConversation.js";
import { evaluateLeadScore } from "./leadScoring.service.js";
import { logger } from "../../../config/logger.js";

/**
 * Handles visitor session resumption when an abandoned lead returns to chat.
 * Atomically transitions status back to 'active_chat' and updates lead scoring.
 *
 * @param {string} sessionId - Active visitor session ID
 * @param {string} [incomingMessage=""] - New incoming message text
 * @param {Array<Object>} [conversationHistory=[]] - Historical messages
 * @returns {Promise<{ resumed: boolean, lead?: Object, score?: number }>}
 */
export async function handleSessionResumption(
  sessionId,
  incomingMessage = "",
  conversationHistory = []
) {
  if (!sessionId) return { resumed: false };

  try {
    const conversation = await SalesConversation.findOne({ sessionId });
    if (!conversation || !conversation.leadRef) {
      return { resumed: false };
    }

    const lead = await SalesLead.findById(conversation.leadRef);
    if (!lead) {
      return { resumed: false };
    }

    // Only transition if currently marked as abandoned
    if (lead.status === "abandoned") {
      const evaluation = evaluateLeadScore(
        lead,
        [...conversationHistory, { role: "user", content: incomingMessage }]
      );

      lead.status = "active_chat";
      lead.classification = evaluation.classification;
      lead.metadata = {
        ...lead.metadata,
        resumedAt: new Date().toISOString(),
        score: evaluation.score,
        signals: evaluation.signals,
      };

      await lead.save();

      logger.info(
        `🔄 Abandoned Lead Resumed Chat: ${lead.contact.phone || lead.contact.name || lead._id} (New Score: ${evaluation.score}, Class: ${evaluation.classification})`
      );

      return {
        resumed: true,
        leadId: lead._id.toString(),
        score: evaluation.score,
        classification: lead.classification,
      };
    }

    return {
      resumed: false,
      leadId: lead._id.toString(),
      classification: lead.classification,
    };
  } catch (error) {
    logger.warn(`Error in handleSessionResumption for session ${sessionId}:`, error);
    return { resumed: false };
  }
}

export default {
  handleSessionResumption,
};
