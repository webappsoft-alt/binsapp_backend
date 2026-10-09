import salesKnowledgeService from "./service.js";
import {
  getSalesAgentMetrics,
  exportLeadsAsCSV,
  listSalesLeads,
  updateSalesLead,
} from "./analytics/index.js";
import {
  getSalesAgentSettings,
  updateSalesAgentSettings,
} from "./settings/settings.service.js";

export const createKnowledge = async (req, res, next) => {
  try {
    const data = await salesKnowledgeService.createKnowledgeEntry(req.body);
    return res.status(201).json({
      success: true,
      message: "Knowledge base entry created successfully",
      data,
    });
  } catch (error) {
    next(error);
  }
};

export const listKnowledge = async (req, res, next) => {
  try {
    const result = await salesKnowledgeService.listKnowledgeEntries(req.query);
    return res.status(200).json({
      success: true,
      message: "Knowledge base entries retrieved successfully",
      data: result.data,
      pagination: result.pagination,
    });
  } catch (error) {
    next(error);
  }
};

export const getKnowledgeById = async (req, res, next) => {
  try {
    const data = await salesKnowledgeService.getKnowledgeEntryById(
      req.params.id,
      req.query?.includeEmbedding === "true"
    );
    return res.status(200).json({
      success: true,
      message: "Knowledge base entry retrieved successfully",
      data,
    });
  } catch (error) {
    next(error);
  }
};

export const updateKnowledge = async (req, res, next) => {
  try {
    const data = await salesKnowledgeService.updateKnowledgeEntry(
      req.params.id,
      req.body
    );
    return res.status(200).json({
      success: true,
      message: "Knowledge base entry updated successfully",
      data,
    });
  } catch (error) {
    next(error);
  }
};

export const deleteKnowledge = async (req, res, next) => {
  try {
    const data = await salesKnowledgeService.deleteKnowledgeEntry(req.params.id);
    return res.status(200).json({
      success: true,
      message: "Knowledge base entry deleted successfully",
      data,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Analytics Summary & Performance Metrics
 */
export const getAnalytics = async (req, res, next) => {
  try {
    const data = await getSalesAgentMetrics(req.query);
    return res.status(200).json({
      success: true,
      message: "Sales agent analytics retrieved successfully",
      data,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Streams filtered leads as CSV
 */
export const exportLeadsCSV = async (req, res, next) => {
  try {
    const csvContent = await exportLeadsAsCSV(req.query);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="binsapp_sales_leads_${Date.now()}.csv"`
    );
    return res.status(200).send(csvContent);
  } catch (error) {
    next(error);
  }
};

/**
 * Paginated list of AI Sales Leads with stats
 */
export const listLeads = async (req, res, next) => {
  try {
    const result = await listSalesLeads(req.query);
    return res.status(200).json({
      success: true,
      message: "Sales leads retrieved successfully",
      data: result.leads,
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: result.totalPages,
      },
      stats: result.stats,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Updates lead status or notes
 */
export const updateLeadStatus = async (req, res, next) => {
  try {
    const lead = await updateSalesLead(req.params.id, req.body);
    if (!lead) {
      return res.status(404).json({
        success: false,
        message: "Sales lead not found",
      });
    }
    return res.status(200).json({
      success: true,
      message: "Lead updated successfully",
      data: lead,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Paginated list of conversation transcripts
 */
export const listConversations = async (req, res, next) => {
  try {
    const result = await salesKnowledgeService.listConversations(req.query);
    return res.status(200).json({
      success: true,
      message: "Conversations retrieved successfully",
      data: result.conversations,
      pagination: result.pagination,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Single conversation transcript with lead details
 */
export const getConversationBySession = async (req, res, next) => {
  try {
    const data = await salesKnowledgeService.getConversationBySessionId(
      req.params.sessionId
    );
    return res.status(200).json({
      success: true,
      message: "Conversation retrieved successfully",
      data,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * RLHF Feedback Submission & Self-Correction
 */
export const submitRLHFFeedback = async (req, res, next) => {
  try {
    const data = await salesKnowledgeService.applyRLHFFeedback(req.body);
    return res.status(201).json({
      success: true,
      message: "RLHF feedback applied and knowledge base updated successfully",
      data,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get dynamic runtime settings
 */
export const getSettings = async (req, res, next) => {
  try {
    const data = await getSalesAgentSettings();
    return res.status(200).json({
      success: true,
      message: "Sales agent settings retrieved successfully",
      data,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update dynamic runtime settings
 */
export const updateSettings = async (req, res, next) => {
  try {
    const data = await updateSalesAgentSettings(req.body);
    return res.status(200).json({
      success: true,
      message: "Sales agent settings updated successfully",
      data,
    });
  } catch (error) {
    next(error);
  }
};
