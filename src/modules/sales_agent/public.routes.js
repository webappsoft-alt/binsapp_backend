import { Router } from "express";
import { getCheckoutSession } from "./tools/checkoutToken.js";
import SalesLead from "../../models/SalesLead.js";
import { evaluateLeadScore } from "./scoring/leadScoring.service.js";
import { dispatchSalesAlert } from "./notifications/salesAlert.service.js";
import { logger } from "../../config/logger.js";

const router = Router();

/**
 * @swagger
 * /api/sales-agent/checkout-session/{token}:
 *   get:
 *     summary: Resolve prefilled checkout session data for zero double-entry handoff
 *     tags: [Sales Agent Public]
 *     parameters:
 *       - in: path
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 *         description: 32-character hex checkout token
 *     responses:
 *       200:
 *         description: Prefilled session data
 *       404:
 *         description: Checkout session expired or invalid
 */
router.get("/checkout-session/:token", async (req, res, next) => {
  try {
    const sessionData = await getCheckoutSession(req.params.token);

    if (!sessionData) {
      return res.status(404).json({
        success: false,
        code: "CHECKOUT_SESSION_EXPIRED",
        message: "Checkout session has expired or does not exist. Please restart booking.",
      });
    }

    return res.status(200).json({
      success: true,
      data: sessionData,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/sales-agent/lead-capture:
 *   post:
 *     summary: Offline fallback lead capture and callback request
 *     tags: [Sales Agent Public]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [phone]
 *             properties:
 *               name: { type: string }
 *               phone: { type: string }
 *               email: { type: string }
 *               zipCode: { type: string }
 *               serviceType: { type: string }
 *               notes: { type: string }
 *               sessionId: { type: string }
 *     responses:
 *       201:
 *         description: Lead captured and sales alert dispatched
 */
router.post("/lead-capture", async (req, res, next) => {
  try {
    const {
      name,
      phone,
      email,
      zipCode,
      serviceType,
      notes,
      sessionId,
      customerType,
      projectDescription,
      timing,
      sourcePage,
      conversationSummary,
      collectedData = {},
      photos = [],
      leadScore,
      currentFunnel,
    } = req.body;

    const contactPhone = phone || collectedData.customerPhone || "";
    const contactEmail = email || collectedData.customerEmail || "";

    if (!contactPhone && !contactEmail) {
      return res.status(400).json({
        success: false,
        message: "Phone number or email is required for callback request.",
      });
    }

    const { score, classification } = evaluateLeadScore(
      {
        contact: {
          name: name || collectedData.customerName || "",
          phone: contactPhone,
          email: contactEmail,
          zipCode: zipCode || collectedData.zipCode || "",
        },
        serviceDetails: {
          serviceType: serviceType || collectedData.serviceType || "Dumbster",
          projectDescription: notes || projectDescription || collectedData.projectDescription || "",
          photos: Array.isArray(photos) ? photos : [],
        },
      },
      [{ role: "user", content: notes || conversationSummary || "Callback request" }]
    );

    const lead = await SalesLead.create({
      contact: {
        name: name || collectedData.customerName || "",
        phone: contactPhone,
        email: contactEmail,
        zipCode: zipCode || collectedData.zipCode || "",
      },
      serviceDetails: {
        serviceType: serviceType || collectedData.serviceType || "Dumbster",
        sizeOrVolume: collectedData.sizeOrVolume || "",
        projectDescription: notes || projectDescription || collectedData.projectDescription || "",
        photos: Array.isArray(photos) ? photos : (Array.isArray(collectedData.photos) ? collectedData.photos : []),
      },
      classification,
      qualificationScore: leadScore || score,
      status: "active_chat",
      metadata: {
        sessionId: sessionId || `web_offline_${Date.now()}`,
        source: sourcePage || "offline_lead_form",
        customerType: customerType || "residential",
        timing: timing || collectedData.deliveryDate || "",
        conversationSummary: conversationSummary || "",
        currentFunnel: currentFunnel || collectedData.currentFunnel || "initial_intent",
        collectedData,
      },
    });

    // Dispatch instant notifications (Socket + Email)
    dispatchSalesAlert(lead, "NEW_LEAD").catch((err) =>
      logger.warn("Offline lead alert failed:", err?.message)
    );

    return res.status(201).json({
      success: true,
      message: "Your request has been received. A specialist will call you shortly!",
      data: {
        leadId: lead._id,
        classification: lead.classification,
        qualificationScore: lead.qualificationScore,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/sales-agent/analytics/track:
 *   post:
 *     summary: Track frontend AI Sales Agent telemetry interaction events
 *     tags: [Sales Agent Public]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [sessionId, eventType]
 *             properties:
 *               sessionId: { type: string }
 *               eventType: { type: string }
 *               metadata: { type: object }
 *     responses:
 *       200:
 *         description: Event tracked
 */
router.post("/analytics/track", async (req, res, next) => {
  try {
    const body = req.body || {};
    const sessionId =
      body.sessionId ||
      body.session_id ||
      body.visitorSessionId ||
      body.visitor_session_id ||
      body.visitorId ||
      body.id ||
      req.headers["x-session-id"] ||
      req.query?.sessionId ||
      "anonymous";

    const eventType =
      body.eventType ||
      body.event ||
      body.eventName ||
      body.event_type ||
      body.action ||
      body.type ||
      body.name ||
      (typeof body === "string" ? body : null);

    if (!eventType) {
      logger.warn("Analytics track request received without recognized eventType:", body);
      return res.status(400).json({
        success: false,
        message: "eventType or event is required.",
      });
    }

    const metadata = body.metadata || body.properties || body.data || body.payload || {};

    logger.info(`📊 Frontend Telemetry Event [${sessionId}]: ${eventType}`, metadata);

    return res.status(200).json({
      success: true,
      message: "Event recorded successfully.",
      data: { sessionId, eventType },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
