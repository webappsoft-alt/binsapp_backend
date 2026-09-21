import { servicePendingReviewTemplate } from "../../../utils/emailTemplate.js";

/**
 * Email Templates for AI Sales Agent Internal Alerts
 */

/**
 * High-Priority Commercial Escalation Alert Email Template
 */
export function commercialEscalationEmailTemplate(dossier) {
  const {
    companyName,
    contactName,
    phone,
    email,
    zipCode,
    projectDescription,
    urgency = "HIGH",
    leadId,
  } = dossier;

  const html = `
  <!DOCTYPE html>
  <html>
  <head>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #1f2937; line-height: 1.5; background: #f9fafb; margin: 0; padding: 20px; }
      .container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; border: 1px solid #e5e7eb; padding: 24px; }
      .header { border-bottom: 2px solid #ef4444; padding-bottom: 12px; margin-bottom: 20px; }
      .badge { display: inline-block; padding: 4px 12px; border-radius: 9999px; font-size: 12px; font-weight: 700; text-transform: uppercase; background: #fee2e2; color: #b91c1c; }
      .title { font-size: 20px; font-weight: 700; color: #111827; margin: 8px 0 0 0; }
      .field-group { margin-bottom: 16px; }
      .label { font-size: 12px; font-weight: 600; color: #6b7280; text-transform: uppercase; margin-bottom: 4px; }
      .value { font-size: 15px; font-weight: 500; color: #111827; }
      .cta-button { display: inline-block; background: #16a34a; color: #ffffff !important; font-weight: 600; text-decoration: none; padding: 12px 24px; border-radius: 6px; margin-top: 16px; }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        <span class="badge">🚨 High-Priority Commercial Lead</span>
        <h1 class="title">New Commercial Escalation from AI Sales Agent</h1>
      </div>
      <div class="field-group">
        <div class="label">Company / Contractor Name</div>
        <div class="value">${companyName || "Independent Contractor / Builder"}</div>
      </div>
      <div class="field-group">
        <div class="label">Point of Contact</div>
        <div class="value">${contactName || "Direct Inquiry"} (${phone || "No phone"})</div>
      </div>
      <div class="field-group">
        <div class="label">Email Address</div>
        <div class="value">${email || "Not provided"}</div>
      </div>
      <div class="field-group">
        <div class="label">Location ZIP</div>
        <div class="value">${zipCode || "Not specified"}</div>
      </div>
      <div class="field-group">
        <div class="label">Requirements / Job Logistics</div>
        <div class="value">${projectDescription || "Commercial recurring container inquiry"}</div>
      </div>
      <div class="field-group">
        <div class="label">Priority Level</div>
        <div class="value" style="color: #b91c1c; font-weight: 700;">${urgency}</div>
      </div>
      <a href="tel:${phone}" class="cta-button">📞 Call Customer Now (${phone})</a>
    </div>
  </body>
  </html>
  `.trim();

  return {
    subject: `🚨 [COMMERCIAL LEAD] ${companyName || contactName} - Urgency: ${urgency}`,
    html,
  };
}

/**
 * Abandoned Cart / Inactive Lead Alert Email Template
 */
export function abandonedLeadEmailTemplate(dossier) {
  const {
    contactName,
    phone,
    email,
    zipCode,
    serviceType,
    sizeOrVolume,
    checkoutUrl,
    estimatedPrice,
  } = dossier;

  const html = `
  <!DOCTYPE html>
  <html>
  <head>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #1f2937; line-height: 1.5; background: #f9fafb; margin: 0; padding: 20px; }
      .container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; border: 1px solid #e5e7eb; padding: 24px; }
      .header { border-bottom: 2px solid #f59e0b; padding-bottom: 12px; margin-bottom: 20px; }
      .badge { display: inline-block; padding: 4px 12px; border-radius: 9999px; font-size: 12px; font-weight: 700; text-transform: uppercase; background: #fef3c7; color: #b45309; }
      .title { font-size: 18px; font-weight: 700; color: #111827; margin: 8px 0 0 0; }
      .field-group { margin-bottom: 14px; }
      .label { font-size: 12px; font-weight: 600; color: #6b7280; text-transform: uppercase; }
      .value { font-size: 14px; font-weight: 500; color: #111827; }
      .cta-button { display: inline-block; background: #2563eb; color: #ffffff !important; font-weight: 600; text-decoration: none; padding: 10px 20px; border-radius: 6px; margin-top: 14px; }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        <span class="badge">⚠️ Abandoned Chat Opportunity</span>
        <h2 class="title">Visitor Left Without Completing Booking</h2>
      </div>
      <div class="field-group">
        <div class="label">Customer</div>
        <div class="value">${contactName || "Prospective Renter"} &bull; ${phone || email || "No contact"}</div>
      </div>
      <div class="field-group">
        <div class="label">Requested Service</div>
        <div class="value">${sizeOrVolume ? `${sizeOrVolume} ` : ""}${serviceType || "Dumpster Rental"} (ZIP: ${zipCode || "N/A"})</div>
      </div>
      ${estimatedPrice ? `<div class="field-group"><div class="label">Estimated Quote</div><div class="value">$${estimatedPrice}</div></div>` : ""}
      ${checkoutUrl ? `<a href="${checkoutUrl}" class="cta-button">View Generated Booking Link</a>` : `<a href="tel:${phone}" class="cta-button">📞 Follow Up by Phone</a>`}
    </div>
  </body>
  </html>
  `.trim();

  return {
    subject: `⚠️ [ABANDONED LEAD] ${contactName || phone} (${sizeOrVolume || ""} ${serviceType || "Dumpster"})`,
    html,
  };
}

/**
 * Service Update / Application Pending Review Email Template
 */
export function servicePendingReviewEmailTemplate(data = {}) {
  const {
    userName = "Partner",
    serviceLabel = "Service Offerings",
    name,
    label,
  } = data;

  const safeName = userName || name || "Partner";
  const safeLabel = serviceLabel || label || "Service Offerings";
  const html = servicePendingReviewTemplate(safeName, safeLabel);

  return {
    subject: `⏳ [UNDER REVIEW] Your ${safeLabel} Application is Pending Verification`,
    html,
  };
}

export { servicePendingReviewTemplate };

export default {
  commercialEscalationEmailTemplate,
  abandonedLeadEmailTemplate,
  servicePendingReviewEmailTemplate,
  servicePendingReviewTemplate,
};

