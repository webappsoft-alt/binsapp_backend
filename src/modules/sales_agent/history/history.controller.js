import salesHistoryService from "./history.service.js";
import { logger } from "../../../config/logger.js";

/**
 * GET /api/sales-agent/history
 * Retrieves paginated conversation history for the current user or visitor session.
 * Supports cross-device sync (Web & Mobile).
 */
export const getChatHistory = async (req, res, next) => {
  try {
    const userId = req.user?._id ? String(req.user._id) : null;
    const sessionId =
      req.query?.sessionId ||
      req.headers["x-session-id"] ||
      null;
    const visitorId =
      req.query?.visitorId ||
      req.headers["x-visitor-id"] ||
      null;
    const sessionIdsParam = req.query?.sessionIds;
    const sessionIds = sessionIdsParam
      ? (Array.isArray(sessionIdsParam) ? sessionIdsParam : String(sessionIdsParam).split(","))
          .map((s) => s.trim())
          .filter(Boolean)
      : [];

    const {
      search,
      funnel,
      sortBy = "updatedAt",
      sortOrder = "desc",
      page = 1,
      limit = 20,
    } = req.query;

    const result = await salesHistoryService.listUserConversations({
      userId,
      sessionId,
      visitorId,
      sessionIds,
      search,
      funnel,
      sortBy,
      sortOrder,
      page,
      limit,
    });

    return res.status(200).json({
      success: true,
      message: "Chat history retrieved successfully",
      data: result.conversations,
      pagination: result.pagination,
    });
  } catch (error) {
    logger.error("Error in getChatHistory:", error);
    next(error);
  }
};

/**
 * GET /api/sales-agent/history/:sessionId
 * Retrieves full single conversation transcript with chronologically sorted messages.
 */
export const getSessionTranscript = async (req, res, next) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user?._id ? String(req.user._id) : null;

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        message: "sessionId parameter is required.",
      });
    }

    const conversation = await salesHistoryService.getConversationBySessionId({
      sessionId,
      userId,
    });

    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: "Conversation session not found.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Conversation transcript retrieved successfully",
      data: conversation,
    });
  } catch (error) {
    logger.error(`Error in getSessionTranscript for ${req.params.sessionId}:`, error);
    next(error);
  }
};

/**
 * PUT /api/sales-agent/history/:sessionId
 * Updates conversation title or attaches user to session
 */
export const updateSessionDetails = async (req, res, next) => {
  try {
    const { sessionId } = req.params;
    const { title } = req.body;
    const userId = req.user?._id ? String(req.user._id) : null;

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        message: "sessionId is required.",
      });
    }

    const updated = await salesHistoryService.updateSessionTitle({
      sessionId,
      userId,
      title: title || "",
    });

    return res.status(200).json({
      success: true,
      message: "Session updated successfully",
      data: updated,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/sales-agent/history/:sessionId
 * Deletes a single conversation session
 */
export const deleteSession = async (req, res, next) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user?._id ? String(req.user._id) : null;

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        message: "sessionId is required.",
      });
    }

    const deleted = await salesHistoryService.deleteConversation({
      sessionId,
      userId,
    });

    return res.status(200).json({
      success: true,
      message: deleted ? "Conversation deleted successfully." : "Conversation not found or already deleted.",
    });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/sales-agent/history
 * Clears all conversation history for the current user or visitor session
 */
export const clearAllChatHistory = async (req, res, next) => {
  try {
    const userId = req.user?._id ? String(req.user._id) : null;
    const sessionId =
      req.query?.sessionId ||
      req.headers["x-session-id"] ||
      null;
    const visitorId =
      req.query?.visitorId ||
      req.headers["x-visitor-id"] ||
      null;
    const sessionIdsParam = req.query?.sessionIds;
    const sessionIds = sessionIdsParam
      ? (Array.isArray(sessionIdsParam) ? sessionIdsParam : String(sessionIdsParam).split(","))
          .map((s) => s.trim())
          .filter(Boolean)
      : [];

    const result = await salesHistoryService.clearAllConversations({
      userId,
      sessionId,
      visitorId,
      sessionIds,
    });

    return res.status(200).json({
      success: true,
      message: "All conversation history cleared successfully.",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};
