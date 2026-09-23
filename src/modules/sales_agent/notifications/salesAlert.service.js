import Notification from "../../../models/Notification.js";
import User from "../../../models/User.js";
import { io } from "../../../socket/socket.js";
import { sendEmail } from "../../../utils/emailHelper.js";
import { logger } from "../../../config/logger.js";
import config from "../../../config/env.js";
import {
  commercialEscalationEmailTemplate,
  abandonedLeadEmailTemplate,
} from "./templates.js";

const DEFAULT_SALES_ALERT_EMAIL = process.env.SALES_ALERT_EMAIL || "sales@binsapp.ai";

/**
 * Builds a structured dossier object from a SalesLead document
 * @param {Object} lead - SalesLead Mongoose document or plain object
 * @returns {Object} Structured dossier
 */
export function buildLeadDossier(lead) {
  const contact = lead.contact || {};
  const serviceDetails = lead.serviceDetails || {};
  const metadata = lead.metadata || {};

  return {
    leadId: lead._id ? lead._id.toString() : "",
    contactName: contact.name || "",
    phone: contact.phone || "",
    email: contact.email || "",
    zipCode: contact.zipCode || "",
    serviceType: serviceDetails.serviceType || "Dumbster",
    sizeOrVolume: serviceDetails.sizeOrVolume || "",
    projectDescription: serviceDetails.projectDescription || "",
    classification: lead.classification || "WARM",
    status: lead.status || "active_chat",
    urgency: metadata.urgency || (lead.classification === "COMMERCIAL" ? "HIGH" : "MEDIUM"),
    companyName: metadata.companyName || "",
    prefilledCheckoutToken: lead.prefilledCheckoutToken || null,
    checkoutUrl: lead.prefilledCheckoutToken
      ? `https://www.binsapp.ai/book/dumpster-rental?ref_token=${lead.prefilledCheckoutToken}`
      : null,
  };
}

/**
 * Dispatches multi-tier notifications for sales leads across Socket.io, Email, and Database.
 *
 * @param {Object} lead - SalesLead record
 * @param {"NEW_LEAD"|"ABANDONED"|"COMMERCIAL_ESCALATION"} [alertType="NEW_LEAD"] - Event type
 * @returns {Promise<{ success: boolean, alertType: string, dossier: Object }>}
 */
export async function dispatchSalesAlert(lead, alertType = "NEW_LEAD") {
  if (!lead) return { success: false };

  const dossier = buildLeadDossier(lead);
  const isHighPriority =
    alertType === "COMMERCIAL_ESCALATION" ||
    lead.classification === "COMMERCIAL" ||
    lead.classification === "HOT";

  logger.info(`📢 Dispatching Sales Alert [${alertType}] for Lead: ${dossier.phone || dossier.contactName || dossier.leadId}`);

  // 1. Real-Time Admin Socket Broadcast
  try {
    if (io) {
      io.emit("admin:sales_lead_alert", {
        alertType,
        priority: isHighPriority ? "HIGH" : "NORMAL",
        dossier,
        timestamp: new Date().toISOString(),
      });
    }
  } catch (socketErr) {
    logger.warn("Socket broadcast for sales alert failed:", socketErr?.message);
  }

  // 2. Persist in Notification Database
  try {
    const adminUser = await User.findOne({ role: "admin" }).select("_id").lean();
    if (adminUser) {
      const notificationTitle =
        alertType === "COMMERCIAL_ESCALATION"
          ? `Commercial Lead: ${dossier.companyName || dossier.contactName}`
          : alertType === "ABANDONED"
          ? `Abandoned Lead: ${dossier.contactName || dossier.phone}`
          : `New Qualified Lead: ${dossier.contactName || dossier.phone}`;

      const notificationDescription =
        `${dossier.sizeOrVolume ? dossier.sizeOrVolume + " " : ""}${dossier.serviceType} in ZIP ${dossier.zipCode || "N/A"} - Contact: ${dossier.phone || dossier.email}`;

      const notification = new Notification({
        user: adminUser._id,
        to_id: adminUser._id,
        type: "lead_received",
        title: notificationTitle,
        description: notificationDescription,
        isImportant: isHighPriority,
      });

      await notification.save();
    }
  } catch (dbErr) {
    logger.warn("Saving notification document failed:", dbErr?.message);
  }

  // 3. Priority Email Notification
  if (isHighPriority || alertType === "ABANDONED") {
    try {
      const template =
        alertType === "COMMERCIAL_ESCALATION"
          ? commercialEscalationEmailTemplate(dossier)
          : abandonedLeadEmailTemplate(dossier);

      await sendEmail({
        to: DEFAULT_SALES_ALERT_EMAIL,
        subject: template.subject,
        html: template.html,
      });
    } catch (emailErr) {
      logger.warn(`Email alert delivery failed to ${DEFAULT_SALES_ALERT_EMAIL}:`, emailErr?.message);
    }
  }

  return {
    success: true,
    alertType,
    dossier,
  };
}

export default {
  dispatchSalesAlert,
  buildLeadDossier,
};
