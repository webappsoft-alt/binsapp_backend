import SalesKnowledgeBase from "../../models/SalesKnowledgeBase.js";
import SalesConversation from "../../models/SalesConversation.js";
import { generateEmbedding } from "../../utils/salesEmbedding.js";
import { NotFoundError } from "../../utils/apiError.js";

class SalesKnowledgeService {
  /**
   * Creates a new knowledge base entry and automatically computes its 1536 vector embedding
   * @param {Object} data - Knowledge base entry fields
   * @returns {Promise<Object>} Created document (excluding raw embedding)
   */
  async createKnowledgeEntry(data) {
    const { topic, category, content, metadata } = data;

    // Generate vector embedding from topic and content
    const textToEmbed = `${topic}\n\n${content}`;
    const embedding = await generateEmbedding(textToEmbed);

    const newEntry = new SalesKnowledgeBase({
      topic,
      category,
      content,
      embedding,
      metadata: {
        targetAudience: metadata?.targetAudience || "all",
        active: metadata?.active !== undefined ? metadata.active : true,
      },
    });

    const saved = await newEntry.save();
    const result = saved.toObject();
    delete result.embedding;
    return result;
  }

  /**
   * Retrieves paginated list of knowledge base entries with filtering (excludes embeddings)
   * @param {Object} params - Query filters and pagination
   * @returns {Promise<Object>} Paginated records and metadata
   */
  async listKnowledgeEntries({
    category,
    targetAudience,
    active,
    search,
    page = 1,
    limit = 20,
  } = {}) {
    const query = { isDeleted: false };

    if (category) {
      query.category = category;
    }

    if (targetAudience) {
      query["metadata.targetAudience"] = targetAudience;
    }

    if (active !== undefined) {
      query["metadata.active"] = active === "true" || active === true;
    }

    if (search && String(search).trim() !== "") {
      const searchRegex = { $regex: String(search).trim(), $options: "i" };
      query.$or = [{ topic: searchRegex }, { content: searchRegex }];
    }

    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.min(100, Math.max(1, Number(limit) || 20));
    const skip = (pageNum - 1) * limitNum;

    const [data, total] = await Promise.all([
      SalesKnowledgeBase.find(query)
        .select("-embedding")
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      SalesKnowledgeBase.countDocuments(query),
    ]);

    return {
      data,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        pages: Math.ceil(total / limitNum) || 1,
      },
    };
  }

  /**
   * Fetches single knowledge base entry by ID
   * @param {string} id - MongoDB ObjectId
   * @param {boolean} includeEmbedding - Whether to include raw embedding array
   * @returns {Promise<Object>} Knowledge entry
   */
  async getKnowledgeEntryById(id, includeEmbedding = false) {
    let query = SalesKnowledgeBase.findOne({ _id: id, isDeleted: false });

    if (includeEmbedding) {
      query = query.select("+embedding");
    } else {
      query = query.select("-embedding");
    }

    const entry = await query.lean();

    if (!entry) {
      throw new NotFoundError("Knowledge base entry not found");
    }

    return entry;
  }

  /**
   * Updates an existing knowledge base entry, recalculating vector embedding if topic or content changed
   * @param {string} id - Entry ID
   * @param {Object} updateData - Partial update fields
   * @returns {Promise<Object>} Updated entry
   */
  async updateKnowledgeEntry(id, updateData) {
    const entry = await SalesKnowledgeBase.findOne({ _id: id, isDeleted: false }).select("+embedding");

    if (!entry) {
      throw new NotFoundError("Knowledge base entry not found");
    }

    let shouldRecomputeEmbedding = false;

    if (updateData.topic !== undefined && updateData.topic !== entry.topic) {
      entry.topic = updateData.topic;
      shouldRecomputeEmbedding = true;
    }

    if (updateData.content !== undefined && updateData.content !== entry.content) {
      entry.content = updateData.content;
      shouldRecomputeEmbedding = true;
    }

    if (updateData.category !== undefined) {
      entry.category = updateData.category;
    }

    if (updateData.metadata) {
      if (updateData.metadata.targetAudience !== undefined) {
        entry.metadata.targetAudience = updateData.metadata.targetAudience;
      }
      if (updateData.metadata.active !== undefined) {
        entry.metadata.active = updateData.metadata.active;
      }
    }

    if (shouldRecomputeEmbedding) {
      const textToEmbed = `${entry.topic}\n\n${entry.content}`;
      entry.embedding = await generateEmbedding(textToEmbed);
    }

    const saved = await entry.save();
    const result = saved.toObject();
    delete result.embedding;
    return result;
  }

  /**
   * Soft deletes a knowledge base entry
   * @param {string} id - Entry ID
   * @returns {Promise<Object>} Deletion status confirmation
   */
  async deleteKnowledgeEntry(id) {
    const entry = await SalesKnowledgeBase.findOne({ _id: id, isDeleted: false });

    if (!entry) {
      throw new NotFoundError("Knowledge base entry not found");
    }

    entry.isDeleted = true;
    entry.deletedAt = new Date();
    await entry.save();

    return {
      deleted: true,
      id,
    };
  }

  /**
   * Applies RLHF feedback from admins to correct AI hallucinations and patch knowledge base
   */
  async applyRLHFFeedback({
    question,
    incorrectAnswer,
    correctedAnswer,
    topic,
    category,
    sessionId,
  }) {
    const formattedContent = `Question / Scenario: ${question}\n\nVerified Answer: ${correctedAnswer}`;

    return await this.createKnowledgeEntry({
      topic,
      category,
      content: formattedContent,
      metadata: {
        targetAudience: "all",
        active: true,
      },
    });
  }

  /**
   * Retrieves paginated conversation history transcripts for admin review
   */
  async listConversations({ page = 1, limit = 20, funnel, search, sortBy = "updatedAt", sortOrder = "desc" } = {}) {
    const query = {};

    if (funnel) {
      query.currentFunnel = funnel;
    }

    if (search) {
      query.$or = [
        { sessionId: { $regex: search, $options: "i" } },
        { "messages.content": { $regex: search, $options: "i" } },
      ];
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const sortDir = String(sortOrder).toLowerCase() === "asc" ? 1 : -1;
    const sortField = ["createdAt", "updatedAt", "currentFunnel"].includes(sortBy) ? sortBy : "updatedAt";

    const [conversations, total] = await Promise.all([
      SalesConversation.find(query)
        .populate("leadRef")
        .sort({ [sortField]: sortDir })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      SalesConversation.countDocuments(query),
    ]);

    return {
      conversations,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    };
  }

  /**
   * Retrieves a single conversation transcript by sessionId
   */
  async getConversationBySessionId(sessionId) {
    const conversation = await SalesConversation.findOne({ sessionId })
      .populate("leadRef")
      .lean();

    if (!conversation) {
      throw new NotFoundError("Conversation session not found");
    }

    if (conversation && Array.isArray(conversation.messages)) {
      conversation.messages.sort(
        (a, b) => new Date(a.timestamp || 0) - new Date(b.timestamp || 0)
      );
    }

    return conversation;
  }
}

export default new SalesKnowledgeService();
