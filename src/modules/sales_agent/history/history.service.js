import SalesConversation from "../../../models/SalesConversation.js";
import SalesLead from "../../../models/SalesLead.js";
import redis from "../../../config/redis.js";
import { getSessionMessagesKey, getSessionMetaKey } from "../rag/sessionBuffer.service.js";
import { logger } from "../../../config/logger.js";

function deriveTitleFromMessages(conv) {
  if (conv.title && conv.title.trim().length > 0) {
    return conv.title;
  }
  if (Array.isArray(conv.messages)) {
    const firstUser = conv.messages.find(
      (m) => m.role === "user" && m.content && m.content.trim().length > 0
    );
    if (firstUser) {
      const text = firstUser.content.trim();
      return text.length <= 42 ? text : text.slice(0, 39) + "…";
    }
  }
  if (conv.currentFunnel && conv.currentFunnel !== "unknown" && conv.currentFunnel !== "initial_intent") {
    return conv.currentFunnel
      .split("_")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  }
  return "Sales Assistant Chat";
}

class SalesHistoryService {
  /**
   * Retrieves paginated list of conversations for a user or visitor sessionId.
   * Enables cross-device sync (Web <-> Mobile).
   *
   * @param {Object} options
   * @param {string} [options.userId] - User ID if authenticated
   * @param {string} [options.sessionId] - Guest session ID if unauthenticated
   * @param {string} [options.search] - Search keyword
   * @param {string} [options.funnel] - Funnel filter
   * @param {string} [options.sortBy='updatedAt'] - Field to sort by
   * @param {string} [options.sortOrder='desc'] - 'desc' or 'asc'
   * @param {number} [options.page=1]
   * @param {number} [options.limit=20]
   */
  async listUserConversations({
    userId = null,
    sessionId = null,
    visitorId = null,
    sessionIds = [],
    search = "",
    funnel = "",
    sortBy = "updatedAt",
    sortOrder = "desc",
    page = 1,
    limit = 20,
  } = {}) {
    const validSessionIds = Array.isArray(sessionIds)
      ? sessionIds.filter((s) => typeof s === "string" && s.trim().length > 0)
      : [];

    if (!userId && !sessionId && !visitorId && validSessionIds.length === 0) {
      return {
        conversations: [],
        pagination: { total: 0, page: 1, limit, totalPages: 0 },
      };
    }

    const query = {
      status: { $ne: "deleted" },
      "messages.0": { $exists: true }, // Only return conversations with at least 1 message
    };

    // Filter by user, device visitorId, or device session list
    const orConditions = [];
    if (userId) {
      orConditions.push({ userId });
    }
    if (visitorId) {
      orConditions.push({ visitorId });
    }
    if (sessionId) {
      orConditions.push({ sessionId });
    }
    if (validSessionIds.length > 0) {
      orConditions.push({ sessionId: { $in: validSessionIds } });
    }

    if (orConditions.length === 1) {
      Object.assign(query, orConditions[0]);
    } else if (orConditions.length > 1) {
      query.$or = orConditions;
    }

    if (funnel) {
      query.currentFunnel = funnel;
    }

    if (search && search.trim().length > 0) {
      const term = search.trim();
      query.$and = query.$and || [];
      query.$and.push({
        $or: [
          { title: { $regex: term, $options: "i" } },
          { "messages.content": { $regex: term, $options: "i" } },
        ],
      });
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const sortDir = String(sortOrder).toLowerCase() === "asc" ? 1 : -1;
    const allowedSortFields = ["updatedAt", "createdAt", "title"];
    const sortField = allowedSortFields.includes(sortBy) ? sortBy : "updatedAt";

    // Auto-claim anonymous sessions for logged in user if applicable
    if (userId) {
      try {
        const claimOrConditions = [];
        if (visitorId) claimOrConditions.push({ visitorId });
        if (sessionId) claimOrConditions.push({ sessionId });
        if (validSessionIds.length > 0) {
          claimOrConditions.push({ sessionId: { $in: validSessionIds } });
        }
        if (claimOrConditions.length > 0) {
          await SalesConversation.updateMany(
            { userId: null, $or: claimOrConditions },
            { $set: { userId } }
          );
        }
      } catch (claimErr) {
        logger.debug("Auto-claim session for userId failed:", claimErr?.message);
      }
    }

    // Safety check: ensure any active Redis sessions with messages are synced to MongoDB
    const checkSessionIds = [sessionId, ...validSessionIds].filter(
      (s) => typeof s === "string" && s.trim().length > 0
    );
    if (checkSessionIds.length > 0) {
      await Promise.all(
        checkSessionIds.map(async (sid) => {
          try {
            const msgKey = getSessionMessagesKey(sid);
            const msgCount = await redis.llen(msgKey);
            if (msgCount > 0) {
              const inDb = await SalesConversation.exists({ sessionId: sid });
              if (!inDb) {
                const rawMsgs = await redis.lrange(msgKey, 0, -1);
                const parsedMsgs = rawMsgs.map((m) => JSON.parse(m));
                const meta = await redis.hgetall(getSessionMetaKey(sid));
                const firstUser = parsedMsgs.find((m) => m.role === "user" && m.content);
                const derivedTitle = firstUser
                  ? firstUser.content.length <= 45
                    ? firstUser.content
                    : firstUser.content.slice(0, 42) + "…"
                  : "Sales Assistant Chat";

                await SalesConversation.findOneAndUpdate(
                  { sessionId: sid },
                  {
                    $set: {
                      sessionId: sid,
                      userId: userId || null,
                      visitorId: meta?.visitorId || visitorId || null,
                      currentFunnel: meta?.currentFunnel || "initial_intent",
                      messages: parsedMsgs,
                      title: derivedTitle,
                      status: "active",
                      updatedAt: new Date(),
                    },
                    $setOnInsert: {
                      createdAt: new Date(),
                    },
                  },
                  { upsert: true, new: true }
                );
              }
            }
          } catch {
            // non-blocking
          }
        })
      );
    }

    const [conversations, total] = await Promise.all([
      SalesConversation.find(query)
        .sort({ [sortField]: sortDir })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      SalesConversation.countDocuments(query),
    ]);

    const formatted = conversations.map((conv) => {
      const msgs = Array.isArray(conv.messages) ? conv.messages : [];
      const lastMsg = msgs.length > 0 ? msgs[msgs.length - 1] : null;
      const previewText = lastMsg?.content
        ? (lastMsg.content.slice(0, 75) + (lastMsg.content.length > 75 ? "…" : ""))
        : "";

      return {
        id: conv.sessionId,
        sessionId: conv.sessionId,
        userId: conv.userId || null,
        title: conv.title || deriveTitleFromMessages(conv),
        funnel: conv.currentFunnel || "initial_intent",
        preview: previewText,
        lastMessage: lastMsg?.content || "",
        lastMessageRole: lastMsg?.role || "",
        lastMessageTime: lastMsg?.timestamp || conv.updatedAt,
        messageCount: msgs.length,
        createdAt: conv.createdAt,
        updatedAt: conv.updatedAt,
      };
    });

    return {
      conversations: formatted,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
      },
    };
  }

  /**
   * Retrieves a full single conversation transcript by sessionId.
   * Auto-links to userId if user is authenticated and conversation has no owner.
   *
   * @param {Object} options
   * @param {string} options.sessionId
   * @param {string} [options.userId]
   */
  async getConversationBySessionId({ sessionId, userId = null }) {
    if (!sessionId) {
      return null;
    }

    const conversation = await SalesConversation.findOne({
      sessionId,
      status: { $ne: "deleted" },
    }).lean();

    if (!conversation) {
      return null;
    }

    // Auto-link session to user if user logged in
    if (userId && !conversation.userId) {
      await SalesConversation.updateOne({ sessionId }, { $set: { userId } });
      conversation.userId = userId;
    }

    // Sort messages chronologically by timestamp
    if (Array.isArray(conversation.messages)) {
      conversation.messages.sort(
        (a, b) => new Date(a.timestamp || 0) - new Date(b.timestamp || 0)
      );
    }

    let leadInfo = null;
    try {
      let lead = null;
      if (conversation.leadRef) {
        lead = await SalesLead.findById(conversation.leadRef).lean();
      }
      if (!lead) {
        lead = await SalesLead.findOne({
          $or: [
            { "metadata.sessionId": sessionId },
            { conversationRef: conversation._id },
          ],
        })
          .sort({ updatedAt: -1 })
          .lean();
      }
      if (lead) {
        leadInfo = {
          id: String(lead._id),
          status: lead.status || "new",
          classification: lead.classification || "WARM",
          serviceType: lead.serviceDetails?.serviceType || "Dumbster",
          updatedAt: lead.updatedAt || lead.createdAt,
        };
      }
    } catch (err) {
      logger.warn("Failed attaching leadInfo to session transcript:", err?.message);
    }

    return {
      sessionId: conversation.sessionId,
      userId: conversation.userId || null,
      title: conversation.title || deriveTitleFromMessages(conversation),
      currentFunnel: conversation.currentFunnel,
      messages: conversation.messages || [],
      messageCount: (conversation.messages || []).length,
      visitorInfo: conversation.visitorInfo || {},
      metadata: conversation.metadata || {},
      leadInfo,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
    };
  }

  /**
   * Creates or updates a conversation title / metadata
   */
  async updateSessionTitle({ sessionId, userId = null, title = "" }) {
    if (!sessionId) return null;

    const updateDoc = {
      $set: {
        title: title.trim(),
        updatedAt: new Date(),
      },
    };

    if (userId) {
      updateDoc.$set.userId = userId;
    }

    return await SalesConversation.findOneAndUpdate(
      { sessionId, status: { $ne: "deleted" } },
      updateDoc,
      { new: true }
    ).lean();
  }

  /**
   * Soft-deletes a conversation session
   */
  async deleteConversation({ sessionId, userId = null }) {
    if (!sessionId) return false;

    const query = { sessionId };
    if (userId) {
      query.$or = [{ userId }, { sessionId }];
    }

    const result = await SalesConversation.updateOne(query, {
      $set: { status: "deleted", updatedAt: new Date() },
    });

    // Clean up Redis key
    try {
      await redis.del(getSessionMessagesKey(sessionId));
    } catch (err) {
      logger.debug("Redis session deletion error:", err?.message);
    }

    return result.modifiedCount > 0;
  }

  /**
   * Clears all conversations for a user, visitor, or session list
   */
  async clearAllConversations({
    userId = null,
    sessionId = null,
    visitorId = null,
    sessionIds = [],
  } = {}) {
    const query = { status: { $ne: "deleted" } };
    const orConditions = [];

    if (userId) orConditions.push({ userId });
    if (visitorId) orConditions.push({ visitorId });
    if (sessionId) orConditions.push({ sessionId });
    if (Array.isArray(sessionIds) && sessionIds.length > 0) {
      orConditions.push({ sessionId: { $in: sessionIds } });
    }

    if (orConditions.length === 0) {
      return { deletedCount: 0 };
    }

    if (orConditions.length === 1) {
      Object.assign(query, orConditions[0]);
    } else {
      query.$or = orConditions;
    }

    const result = await SalesConversation.updateMany(query, {
      $set: { status: "deleted", updatedAt: new Date() },
    });

    return { deletedCount: result.modifiedCount };
  }
}

export default new SalesHistoryService();
