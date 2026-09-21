import { Router } from "express";
import { authenticate, admin } from "../../middlewares/auth.js";
import { validate } from "../../middlewares/validate.js";
import {
  createKnowledgeSchema,
  updateKnowledgeSchema,
  queryKnowledgeSchema,
  idParamSchema,
  rlhfFeedbackSchema,
  updateSettingsSchema,
} from "./validation.js";
import {
  createKnowledge,
  listKnowledge,
  getKnowledgeById,
  updateKnowledge,
  deleteKnowledge,
  getAnalytics,
  exportLeadsCSV,
  listConversations,
  getConversationBySession,
  submitRLHFFeedback,
  getSettings,
  updateSettings,
} from "./controller.js";

const router = Router();

// Apply auth + admin guard to all sales-agent admin routes
router.use(authenticate, admin);

/**
 * @swagger
 * tags:
 *   name: Sales Agent Admin
 *   description: AI Sales Agent Engine administration, analytics, transcripts, and controls
 */

/* ==========================================================================
   1. Knowledge Base Management
   ========================================================================== */

router.post(
  "/knowledge",
  validate(createKnowledgeSchema, "body"),
  createKnowledge
);

router.get(
  "/knowledge",
  validate(queryKnowledgeSchema, "query"),
  listKnowledge
);

router.get(
  "/knowledge/:id",
  validate(idParamSchema, "params"),
  getKnowledgeById
);

router.put(
  "/knowledge/:id",
  validate(idParamSchema, "params"),
  validate(updateKnowledgeSchema, "body"),
  updateKnowledge
);

router.delete(
  "/knowledge/:id",
  validate(idParamSchema, "params"),
  deleteKnowledge
);

// Backward-compatible root knowledge routes
router.post("/", validate(createKnowledgeSchema, "body"), createKnowledge);
router.get("/", validate(queryKnowledgeSchema, "query"), listKnowledge);
router.get("/:id", validate(idParamSchema, "params"), getKnowledgeById);
router.put(
  "/:id",
  validate(idParamSchema, "params"),
  validate(updateKnowledgeSchema, "body"),
  updateKnowledge
);
router.delete("/:id", validate(idParamSchema, "params"), deleteKnowledge);

/* ==========================================================================
   2. Analytics & Performance
   ========================================================================== */

/**
 * @swagger
 * /api/admin/sales-agent/analytics:
 *   get:
 *     summary: Retrieve AI sales agent performance and revenue metrics
 *     tags: [Sales Agent Admin]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: timeRange
 *         schema:
 *           type: string
 *           enum: [today, 7d, 30d, all]
 *           default: 30d
 *     responses:
 *       200:
 *         description: Analytics summary retrieved successfully
 */
router.get("/analytics", getAnalytics);

/* ==========================================================================
   3. Leads CSV Export
   ========================================================================== */

/**
 * @swagger
 * /api/admin/sales-agent/leads/export:
 *   get:
 *     summary: Export filtered sales leads as CSV
 *     tags: [Sales Agent Admin]
 *     security:
 *       - BearerAuth: []
 */
router.get("/leads/export", exportLeadsCSV);

/* ==========================================================================
   4. Conversation History & Transcripts
   ========================================================================== */

/**
 * @swagger
 * /api/admin/sales-agent/conversations:
 *   get:
 *     summary: Retrieve paginated visitor conversation sessions
 *     tags: [Sales Agent Admin]
 *     security:
 *       - BearerAuth: []
 */
router.get("/conversations", listConversations);

/**
 * @swagger
 * /api/admin/sales-agent/conversations/{sessionId}:
 *   get:
 *     summary: Retrieve full transcript and details for a specific session
 *     tags: [Sales Agent Admin]
 *     security:
 *       - BearerAuth: []
 */
router.get("/conversations/:sessionId", getConversationBySession);

/* ==========================================================================
   5. RLHF Quality Feedback Loop
   ========================================================================== */

/**
 * @swagger
 * /api/admin/sales-agent/feedback:
 *   post:
 *     summary: Submit admin correction/RLHF feedback to patch knowledge base
 *     tags: [Sales Agent Admin]
 *     security:
 *       - BearerAuth: []
 */
router.post(
  "/feedback",
  validate(rlhfFeedbackSchema, "body"),
  submitRLHFFeedback
);

/* ==========================================================================
   6. Dynamic Runtime Settings
   ========================================================================== */

/**
 * @swagger
 * /api/admin/sales-agent/settings:
 *   get:
 *     summary: Retrieve current AI Sales Agent runtime settings
 *     tags: [Sales Agent Admin]
 *     security:
 *       - BearerAuth: []
 *   put:
 *     summary: Update AI Sales Agent runtime settings
 *     tags: [Sales Agent Admin]
 *     security:
 *       - BearerAuth: []
 */
router.get("/settings", getSettings);
router.put(
  "/settings",
  validate(updateSettingsSchema, "body"),
  updateSettings
);

export default router;
