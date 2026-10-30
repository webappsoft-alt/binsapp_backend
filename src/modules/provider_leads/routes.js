import express from "express";
import {
  createDirectLeadController,
  getProviderLeadsController,
  getCustomerLeadsController,
  getLeadByIdController,
  submitEstimateController,
  acceptEstimateController,
  declineEstimateController,
} from "./controller.js";
import { authenticate, optionalAuthenticate } from "../../middlewares/auth.js";

const router = express.Router();

/**
 * Customer: Submit a new direct lead for a provider (Login required)
 * POST /api/provider-leads
 */
router.post("/", authenticate, createDirectLeadController);

/**
 * Provider: Get leads received by authenticated provider
 * GET /api/provider-leads/provider
 */
router.get("/provider", authenticate, getProviderLeadsController);

/**
 * Customer: Get leads requested by customer
 * GET /api/provider-leads/customer
 */
router.get("/customer", optionalAuthenticate, getCustomerLeadsController);

/**
 * Get lead details by ID or leadNumber
 * GET /api/provider-leads/:id
 */
router.get("/:id", optionalAuthenticate, getLeadByIdController);

/**
 * Provider: Send or update an estimate for a lead
 * POST /api/provider-leads/:id/estimate
 */
router.post("/:id/estimate", authenticate, submitEstimateController);

/**
 * Customer: Accept estimate -> Creates Order assigned EXCLUSIVELY to this provider
 * POST /api/provider-leads/:id/accept-estimate
 */
router.post("/:id/accept-estimate", optionalAuthenticate, acceptEstimateController);

/**
 * Customer: Decline estimate
 * POST /api/provider-leads/:id/decline-estimate
 */
router.post("/:id/decline-estimate", optionalAuthenticate, declineEstimateController);

export default router;
