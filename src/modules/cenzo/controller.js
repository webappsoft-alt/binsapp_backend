import cenzoService from "./service.js";
import {
  buildCenzoAdminNotificationEmail,
  buildCenzoConfirmationEmail,
} from "./templates/cenzoEmailTemplates.js";

/**
 * Handle form submission from Cenzo website
 * POST /api/cenzo/inquiry or POST /api/cenzo/submit
 */
export async function submitInquiryController(req, res, next) {
  try {
    const reqMeta = {
      ip: req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "",
      userAgent: req.headers["user-agent"] || "",
      origin: req.headers["origin"] || "",
      referer: req.headers["referer"] || "",
    };

    const inquiry = await cenzoService.submitInquiry(req.body, reqMeta);

    return res.status(201).json({
      success: true,
      message:
        "Thank you! Your opportunity inquiry has been submitted directly to Developer John Zaloum. We will be in touch shortly.",
      data: {
        id: inquiry._id,
        fullName: inquiry.fullName,
        company: inquiry.company,
        email: inquiry.email,
        phone: inquiry.phone,
        inquiryType: inquiry.inquiryType,
        projectLocation: inquiry.projectLocation,
        adminEmailSent: inquiry.adminEmailSent,
        clientEmailSent: inquiry.clientEmailSent,
        createdAt: inquiry.createdAt,
      },
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message || "Failed to submit inquiry. Please check your inputs.",
      error: error.message,
    });
  }
}

/**
 * List inquiries (supports filtering & pagination)
 * GET /api/cenzo/inquiries
 */
export async function listInquiriesController(req, res, next) {
  try {
    const { page, limit, status, search } = req.query;
    const result = await cenzoService.listInquiries({
      page,
      limit,
      status,
      search,
    });

    return res.status(200).json({
      success: true,
      message: "Inquiries fetched successfully",
      ...result,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get inquiry by ID
 * GET /api/cenzo/inquiries/:id
 */
export async function getInquiryByIdController(req, res, next) {
  try {
    const inquiry = await cenzoService.getInquiryById(req.params.id);
    return res.status(200).json({
      success: true,
      data: inquiry,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Update inquiry status
 * PATCH /api/cenzo/inquiries/:id/status
 */
export async function updateStatusController(req, res, next) {
  try {
    const { status } = req.body;
    const inquiry = await cenzoService.updateStatus(req.params.id, status);
    return res.status(200).json({
      success: true,
      message: `Inquiry status updated to ${status}`,
      data: inquiry,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Live HTML Template Preview - Admin / Developer notification
 * GET /api/cenzo/preview/admin
 */
export function previewAdminTemplateController(req, res) {
  const sampleInquiry = {
    fullName: req.query.name || "Michael Smith",
    company: req.query.company || "Smith Capital & Partners LLC",
    email: req.query.email || "michael@example.com",
    phone: req.query.phone || "(407) 555-0199",
    inquiryType: req.query.type || "Investor / Capital Partner",
    projectLocation: req.query.location || "Downtown Orlando, Orange County, FL",
    heardAbout: req.query.source || "Direct Referral",
    message:
      req.query.message ||
      "We own a 14-acre commercial parcel zoned for mixed-use development near Lake Nona. Looking for an experienced developer partner for site assembly, entitlements, and equity participation.",
    createdAt: new Date(),
  };

  const html = buildCenzoAdminNotificationEmail(sampleInquiry);
  res.setHeader("Content-Type", "text/html");
  return res.send(html);
}

/**
 * Live HTML Template Preview - Submitter Auto-Responder
 * GET /api/cenzo/preview/client
 */
export function previewClientTemplateController(req, res) {
  const sampleInquiry = {
    fullName: req.query.name || "Michael Smith",
    company: req.query.company || "Smith Capital & Partners LLC",
    email: req.query.email || "michael@example.com",
    phone: req.query.phone || "(407) 555-0199",
    inquiryType: req.query.type || "Investor / Capital Partner",
    projectLocation: req.query.location || "Downtown Orlando, Orange County, FL",
    message:
      req.query.message ||
      "We own a 14-acre commercial parcel zoned for mixed-use development near Lake Nona.",
    createdAt: new Date(),
  };

  const html = buildCenzoConfirmationEmail(sampleInquiry);
  res.setHeader("Content-Type", "text/html");
  return res.send(html);
}

/**
 * Quick Health Check
 * GET /api/cenzo/health
 */
export function cenzoHealthController(req, res) {
  return res.status(200).json({
    status: "ok",
    service: "Cenzo Opportunity Intake API",
    adminEmail: process.env.CENZO_ADMIN_EMAIL || "john@cenzoredev.com",
    timestamp: new Date().toISOString(),
  });
}

