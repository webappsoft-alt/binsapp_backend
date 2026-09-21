import express from "express";
import { createDemoRequest, listLeads, updateLead } from "./controller.js";
import { authenticate, admin } from "../../middlewares/auth.js";

const router = express.Router();

/**
 * Public demo-request intake for the commercial landing page.
 * POST /api/leads/demo-request
 */
router.post("/demo-request", createDemoRequest);

router.get("/", authenticate, admin, listLeads);
router.put("/:id", authenticate, admin, updateLead);

export default router;
