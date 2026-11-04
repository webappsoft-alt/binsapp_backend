import express from "express";
import {
  submitInquiryController,
  listInquiriesController,
  getInquiryByIdController,
  updateStatusController,
  previewAdminTemplateController,
  previewClientTemplateController,
  cenzoHealthController,
} from "./controller.js";

const router = express.Router();

// Health check
router.get("/health", cenzoHealthController);

// HTML Template Previews (Direct browser rendering for testing & review)
router.get("/preview/admin", previewAdminTemplateController);
router.get("/preview/client", previewClientTemplateController);

// Public Form Submission Endpoints (Multi-route support for frontend convenience)
router.post("/", submitInquiryController);
router.post("/submit", submitInquiryController);
router.post("/inquiry", submitInquiryController);
router.post("/contact", submitInquiryController);

// Inquiry management
router.get("/inquiries", listInquiriesController);
router.get("/inquiries/:id", getInquiryByIdController);
router.patch("/inquiries/:id/status", updateStatusController);

export default router;

