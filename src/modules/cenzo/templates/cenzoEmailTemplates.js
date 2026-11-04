/**
 * HTML email templates — Cenzo R.E. Developments
 *
 * Design: clean, light executive layout (navy + emerald brand accents),
 * table-based with inline styles for Gmail, Apple Mail, Outlook (incl. MSO)
 * and mobile clients. No CSS gradients, floats or flex — those break in
 * Outlook and Gmail. A small <style> block only adds mobile stacking.
 *
 * Exports (same API as before):
 *   buildCenzoAdminNotificationEmail(inquiry)  → internal lead notification
 *   buildCenzoConfirmationEmail(inquiry)       → confirmation to the submitter
 */

/* ───────────────────────── Brand tokens ───────────────────────── */

const C = {
  navy: "#0c2340",
  navySoft: "#173559",
  ink: "#0f172a",
  body: "#334155",
  muted: "#64748b",
  faint: "#94a3b8",
  line: "#e5e9f0",
  canvas: "#eef2f6",
  soft: "#f7f9fc",
  white: "#ffffff",
  emerald: "#059669",
  emeraldSoft: "#ecfdf5",
  emeraldLine: "#a7f3d0",
  sky: "#0284c7",
};

const FONT =
  "'Rubik', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

const CONTACT = {
  developer: "John Zaloum",
  email: "john@cenzoredev.com",
  office: "(407) 258-5860",
  officeTel: "+14072585860",
  cell: "(989) 578-0202",
  cellTel: "+19895780202",
  site: "cenzoredev.com",
  siteUrl: "https://cenzoredev.com",
  city: "Orlando, Florida",
};

/* ───────────────────────── Helpers ───────────────────────── */

function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/** Escape and keep the submitter's line breaks. */
function nl2br(str) {
  return escapeHtml(String(str || "").trim()).replace(/\r?\n/g, "<br>");
}

function toDate(date) {
  const d = date instanceof Date ? date : new Date(date);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

function formatDate(date) {
  try {
    return new Intl.DateTimeFormat("en-US", {
      dateStyle: "full",
      timeStyle: "short",
      timeZone: "America/New_York",
    }).format(toDate(date));
  } catch {
    return new Date().toLocaleString("en-US");
  }
}

function formatShortDate(date) {
  try {
    return new Intl.DateTimeFormat("en-US", {
      dateStyle: "medium",
      timeZone: "America/New_York",
    }).format(toDate(date));
  } catch {
    return new Date().toLocaleDateString("en-US");
  }
}

function getRefCode(inquiry) {
  if (inquiry?._id) {
    return "CENZO-" + inquiry._id.toString().slice(-6).toUpperCase();
  }
  return "CENZO-" + Math.floor(100000 + Math.random() * 900000);
}

/* ───────────────────────── Building blocks ───────────────────────── */

function shell({ title, preheader, content }) {
  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="x-apple-disable-message-reformatting">
<meta name="format-detection" content="telephone=no, date=no, address=no, email=no">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${escapeHtml(title)}</title>
<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
<style>
  body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
  table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
  a { text-decoration: none; }
  a[x-apple-data-detectors] { color: inherit !important; text-decoration: none !important; }
  @media only screen and (max-width: 620px) {
    .container { width: 100% !important; }
    .px { padding-left: 22px !important; padding-right: 22px !important; }
    .h1 { font-size: 24px !important; line-height: 31px !important; }
    .stack { display: block !important; width: 100% !important; }
    .stack-gap { padding-left: 0 !important; padding-top: 10px !important; }
    .kv-label { display: block !important; width: 100% !important; padding: 12px 0 2px 0 !important; border-bottom: 0 !important; }
    .kv-value { display: block !important; width: 100% !important; padding: 0 0 12px 0 !important; }
    .btn, .btn a { display: block !important; width: 100% !important; box-sizing: border-box; }
    .hide-sm { display: none !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background-color:${C.canvas};">
<div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;mso-hide:all;font-size:1px;line-height:1px;color:${C.canvas};">${escapeHtml(preheader)}&nbsp;&#8204;&nbsp;&#8204;&nbsp;&#8204;&nbsp;&#8204;&nbsp;&#8204;&nbsp;&#8204;&nbsp;&#8204;&nbsp;&#8204;&nbsp;&#8204;&nbsp;&#8204;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${C.canvas};">
  <tr>
    <td align="center" style="padding:32px 12px 40px 12px;">
      <!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
      <table role="presentation" class="container" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;">
${content}
      </table>
      <!--[if mso]></td></tr></table><![endif]-->
    </td>
  </tr>
</table>
</body>
</html>`;
}

/** Navy brand bar with wordmark and a right-side label. */
function header(label) {
  return `
        <tr>
          <td class="px" bgcolor="${C.navy}" style="background-color:${C.navy};padding:22px 36px;border-radius:12px 12px 0 0;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td valign="middle" style="font-family:${FONT};">
                  <span style="font-size:19px;line-height:22px;font-weight:700;letter-spacing:3px;color:${C.white};">CENZO</span>
                  <span style="font-size:11px;line-height:22px;font-weight:500;letter-spacing:2px;color:#9fb3cc;padding-left:6px;">R.E. DEVELOPMENTS</span>
                </td>
                <td class="hide-sm" align="right" valign="middle" style="font-family:${FONT};font-size:11px;line-height:16px;font-weight:600;letter-spacing:1.5px;text-transform:uppercase;color:#6ee7b7;">
                  ${escapeHtml(label)}
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr><td height="3" bgcolor="${C.emerald}" style="height:3px;line-height:3px;font-size:0;background-color:${C.emerald};">&nbsp;</td></tr>`;
}

/** White card body row. */
function section(inner, { padding = "32px 36px", bg = C.white, last = false } = {}) {
  const radius = last ? "border-radius:0 0 12px 12px;" : "";
  return `
        <tr>
          <td class="px" bgcolor="${bg}" style="background-color:${bg};padding:${padding};${radius}">
${inner}
          </td>
        </tr>`;
}

function divider() {
  return `
        <tr>
          <td class="px" bgcolor="${C.white}" style="background-color:${C.white};padding:0 36px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td height="1" style="height:1px;line-height:1px;font-size:0;background-color:${C.line};">&nbsp;</td></tr></table>
          </td>
        </tr>`;
}

function eyebrow(text, color = C.emerald) {
  return `<p style="margin:0 0 10px 0;font-family:${FONT};font-size:12px;line-height:16px;font-weight:600;letter-spacing:1.4px;text-transform:uppercase;color:${color};">${text}</p>`;
}

function sectionTitle(text) {
  return `<p style="margin:0 0 6px 0;font-family:${FONT};font-size:13px;line-height:18px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:${C.ink};">${text}</p>`;
}

function paragraph(html, { size = 15, color = C.body, margin = "0 0 16px 0" } = {}) {
  return `<p style="margin:${margin};font-family:${FONT};font-size:${size}px;line-height:${Math.round(size * 1.65)}px;color:${color};">${html}</p>`;
}

function muted(text) {
  return `<span style="color:${C.faint};font-weight:400;">${text}</span>`;
}

/** Label / value row. Collapses to stacked layout on mobile. */
function kvRow(label, valueHtml, last = false) {
  const border = last ? "" : `border-bottom:1px solid ${C.line};`;
  return `
              <tr>
                <td class="kv-label" width="168" valign="top" style="width:168px;padding:13px 16px 13px 0;${border}font-family:${FONT};font-size:12px;line-height:20px;font-weight:600;letter-spacing:0.6px;text-transform:uppercase;color:${C.muted};">${label}</td>
                <td class="kv-value" valign="top" style="padding:13px 0;${border}font-family:${FONT};font-size:15px;line-height:21px;font-weight:500;color:${C.ink};word-break:break-word;">${valueHtml}</td>
              </tr>`;
}

function kvTable(rows) {
  const list = rows.filter(Boolean);
  return `
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${list
      .map(([label, value], i) => kvRow(label, value, i === list.length - 1))
      .join("")}
            </table>`;
}

/** Bulletproof button (solid or outline). */
function button(href, label, variant = "solid") {
  const solid = variant === "solid";
  const bg = solid ? C.navy : C.white;
  const color = solid ? C.white : C.navy;
  const border = solid ? C.navy : "#c7d2e0";
  return `<table role="presentation" class="btn" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" bgcolor="${bg}" style="background-color:${bg};border:1px solid ${border};border-radius:8px;">
                    <a href="${href}" target="_blank" style="display:inline-block;padding:12px 22px;font-family:${FONT};font-size:14px;line-height:18px;font-weight:600;color:${color};text-decoration:none;border-radius:8px;mso-padding-alt:0;">${label}</a>
                  </td>
                </tr>
              </table>`;
}

function buttonRow(buttons) {
  const cells = buttons
    .filter(Boolean)
    .map(
      (btn, i) =>
        `<td class="stack${i > 0 ? " stack-gap" : ""}" valign="top" style="${i > 0 ? "padding-left:10px;" : ""}">${btn}</td>`
    )
    .join("");
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>${cells}</tr></table>`;
}

/** Quoted message block — keeps line breaks, no stray indentation. */
function messageBlock(message, emptyText) {
  const content = message
    ? nl2br(message)
    : `<span style="color:${C.faint};font-style:italic;">${emptyText}</span>`;
  return `
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td width="3" bgcolor="${C.emerald}" style="width:3px;background-color:${C.emerald};border-radius:3px 0 0 3px;font-size:0;line-height:0;">&nbsp;</td>
                <td bgcolor="${C.soft}" style="background-color:${C.soft};padding:18px 20px;border-radius:0 8px 8px 0;font-family:${FONT};font-size:15px;line-height:24px;color:${C.ink};word-break:break-word;">${content}</td>
              </tr>
            </table>`;
}

function footer(note) {
  return `
        <tr>
          <td class="px" align="center" style="padding:28px 36px 0 36px;font-family:${FONT};">
            <p style="margin:0 0 6px 0;font-size:12px;line-height:18px;font-weight:700;letter-spacing:2px;color:${C.navy};">CENZO R.E. DEVELOPMENTS</p>
            <p style="margin:0 0 12px 0;font-size:12px;line-height:20px;color:${C.muted};">
              ${CONTACT.city} &nbsp;&middot;&nbsp; <a href="tel:${CONTACT.officeTel}" style="color:${C.muted};text-decoration:none;">${CONTACT.office}</a> &nbsp;&middot;&nbsp; <a href="mailto:${CONTACT.email}" style="color:${C.muted};text-decoration:none;">${CONTACT.email}</a>
            </p>
            <p style="margin:0;font-size:11px;line-height:18px;color:${C.faint};">
              ${note}<br>
              &copy; ${new Date().getFullYear()} Cenzo R.E. Developments. All rights reserved.
            </p>
          </td>
        </tr>`;
}

/* ═════════════════════════════════════════════════════════════════════
 * 1. ADMIN / DEVELOPER NOTIFICATION
 *    Sent to John Zaloum & the Cenzo team when a new inquiry arrives.
 * ═════════════════════════════════════════════════════════════════════ */
export function buildCenzoAdminNotificationEmail(inquiry = {}) {
  const {
    fullName = "",
    company = "",
    email = "",
    phone = "",
    inquiryType = "",
    projectLocation = "",
    heardAbout = "",
    message = "",
    createdAt = new Date(),
    metadata = {},
  } = inquiry;

  const refCode = getRefCode(inquiry);
  const received = formatDate(createdAt);
  const notProvided = muted("Not provided");

  const name = escapeHtml(fullName) || "New submitter";
  const type = escapeHtml(inquiryType) || "General inquiry";
  const phoneDigits = String(phone || "").replace(/[^0-9+]/g, "");

  const mailto = email
    ? `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(
      `Re: Your Cenzo R.E. Developments inquiry [${refCode}]`
    )}`
    : "";
  const tel = phoneDigits ? `tel:${phoneDigits}` : "";

  const subline = [escapeHtml(company), type].filter(Boolean).join(" &nbsp;&middot;&nbsp; ");

  const hero = `
            ${eyebrow("New opportunity inquiry")}
            <h1 class="h1" style="margin:0 0 6px 0;font-family:${FONT};font-size:28px;line-height:36px;font-weight:700;color:${C.ink};">${name}</h1>
            <p style="margin:0 0 22px 0;font-family:${FONT};font-size:15px;line-height:22px;color:${C.muted};">${subline}</p>
            ${buttonRow([
    mailto && button(mailto, "Reply by email", "solid"),
    tel && button(tel, `Call ${escapeHtml(phone)}`, "outline"),
  ])}
            <p style="margin:18px 0 0 0;font-family:${FONT};font-size:13px;line-height:20px;color:${C.faint};">Received ${escapeHtml(received)} (ET) &nbsp;&middot;&nbsp; Ref ${refCode}</p>`;

  const details = `
            ${sectionTitle("Contact &amp; project details")}
            ${kvTable([
    ["Email", email ? `<a href="${mailto}" style="color:${C.sky};text-decoration:none;">${escapeHtml(email)}</a>` : notProvided],
    ["Phone", tel ? `<a href="${tel}" style="color:${C.ink};text-decoration:none;">${escapeHtml(phone)}</a>` : notProvided],
    ["Company", escapeHtml(company) || notProvided],
    ["Inquiry type", `<span style="display:inline-block;padding:3px 10px;border-radius:999px;background-color:${C.emeraldSoft};border:1px solid ${C.emeraldLine};color:#047857;font-size:13px;line-height:18px;font-weight:600;">${type}</span>`],
    ["Project location", escapeHtml(projectLocation) || notProvided],
    ["Heard about us", escapeHtml(heardAbout) || notProvided],
  ])}`;

  const messageSection = `
            ${sectionTitle("Message")}
            <div style="height:8px;line-height:8px;font-size:0;">&nbsp;</div>
            ${messageBlock(message, "No message was included with this inquiry.")}`;

  const audit = `
            <p style="margin:0;font-family:${FONT};font-size:12px;line-height:19px;color:${C.muted};">
              <strong style="color:${C.body};">Reference</strong> ${refCode} &nbsp;&middot;&nbsp;
              <strong style="color:${C.body};">Source</strong> ${CONTACT.site}${metadata?.ip ? ` &nbsp;&middot;&nbsp; <strong style="color:${C.body};">IP</strong> ${escapeHtml(metadata.ip)}` : ""
    }
            </p>`;

  return shell({
    title: `New inquiry from ${fullName || "website"} | Cenzo R.E. Developments`,
    preheader: `${fullName || "Someone"} submitted a ${inquiryType || "new"} inquiry${projectLocation ? ` for ${projectLocation}` : ""}.`,
    content: [
      header(`New inquiry · ${refCode}`),
      section(hero, { padding: "34px 36px 30px 36px" }),
      divider(),
      section(details, { padding: "28px 36px 12px 36px" }),
      section(messageSection, { padding: "18px 36px 30px 36px" }),
      section(audit, { padding: "16px 36px", bg: C.soft, last: true }),
      footer("Internal notification &middot; Confidential"),
    ].join(""),
  });
}

/* ═════════════════════════════════════════════════════════════════════
 * 2. SUBMITTER CONFIRMATION
 *    Sent to the person who filled out the form.
 * ═════════════════════════════════════════════════════════════════════ */
export function buildCenzoConfirmationEmail(inquiry = {}) {
  const {
    fullName = "",
    company = "",
    email = "",
    phone = "",
    inquiryType = "",
    projectLocation = "",
    heardAbout = "",
    message = "",
    createdAt = new Date(),
  } = inquiry;

  const refCode = getRefCode(inquiry);
  const firstName = escapeHtml(String(fullName || "").trim().split(/\s+/)[0] || "");
  const type = escapeHtml(inquiryType) || "General inquiry";

  const hero = `
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:20px;">
              <tr>
                <td width="44" height="44" align="center" valign="middle" bgcolor="${C.emeraldSoft}" style="width:44px;height:44px;border-radius:22px;background-color:${C.emeraldSoft};border:1px solid ${C.emeraldLine};font-family:${FONT};font-size:20px;line-height:44px;font-weight:700;color:${C.emerald};">&#10003;</td>
              </tr>
            </table>
            ${eyebrow("Inquiry received")}
            <h1 class="h1" style="margin:0 0 14px 0;font-family:${FONT};font-size:28px;line-height:36px;font-weight:700;color:${C.ink};">${firstName ? `Thank you, ${firstName}.` : "Thank you for reaching out."}</h1>
            ${paragraph(
    `Your inquiry has been delivered to developer <strong style="color:${C.ink};">${CONTACT.developer}</strong>, who personally reviews every submission. You&rsquo;ll hear from us within <strong style="color:${C.ink};">24&ndash;48 business hours</strong>.`,
    { margin: "0 0 24px 0" }
  )}
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.soft}" style="background-color:${C.soft};border:1px solid ${C.line};border-radius:10px;">
              <tr>
                <td class="stack" width="33%" valign="top" style="padding:16px 18px;font-family:${FONT};">
                  <p style="margin:0 0 4px 0;font-size:11px;line-height:14px;font-weight:600;letter-spacing:1px;text-transform:uppercase;color:${C.muted};">Reference</p>
                  <p style="margin:0;font-size:15px;line-height:20px;font-weight:700;color:${C.ink};">${refCode}</p>
                </td>
                <td class="stack" width="34%" valign="top" style="padding:16px 18px;font-family:${FONT};">
                  <p style="margin:0 0 4px 0;font-size:11px;line-height:14px;font-weight:600;letter-spacing:1px;text-transform:uppercase;color:${C.muted};">Inquiry type</p>
                  <p style="margin:0;font-size:15px;line-height:20px;font-weight:600;color:${C.ink};">${type}</p>
                </td>
                <td class="stack" width="33%" valign="top" style="padding:16px 18px;font-family:${FONT};">
                  <p style="margin:0 0 4px 0;font-size:11px;line-height:14px;font-weight:600;letter-spacing:1px;text-transform:uppercase;color:${C.muted};">Submitted</p>
                  <p style="margin:0;font-size:15px;line-height:20px;font-weight:600;color:${C.ink};">${escapeHtml(formatShortDate(createdAt))}</p>
                </td>
              </tr>
            </table>`;

  const step = (num, title, text, last = false) => `
              <tr>
                <td width="40" valign="top" style="width:40px;padding:0 0 ${last ? 0 : 20}px 0;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
                    <td width="28" height="28" align="center" valign="middle" bgcolor="${C.navy}" style="width:28px;height:28px;border-radius:14px;background-color:${C.navy};font-family:${FONT};font-size:13px;line-height:28px;font-weight:700;color:${C.white};">${num}</td>
                  </tr></table>
                </td>
                <td valign="top" style="padding:3px 0 ${last ? 0 : 20}px 0;font-family:${FONT};">
                  <p style="margin:0 0 3px 0;font-size:15px;line-height:21px;font-weight:600;color:${C.ink};">${title}</p>
                  <p style="margin:0;font-size:14px;line-height:21px;color:${C.muted};">${text}</p>
                </td>
              </tr>`;

  const nextSteps = `
            ${sectionTitle("What happens next")}
            <div style="height:12px;line-height:12px;font-size:0;">&nbsp;</div>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              ${step("1", "Personal review", `${CONTACT.developer} reviews your project scope, location and goals for site and development feasibility.`)}
              ${step("2", "Direct follow-up", "We&rsquo;ll contact you by phone or email within 24&ndash;48 business hours to discuss the details.")}
              ${step("3", "Next steps", "Where there&rsquo;s a fit, we move to confidential planning &mdash; NDAs, partnership structuring or project execution.", true)}
            </table>`;

  const summary = `
            ${sectionTitle("Your submission")}
            ${kvTable([
    fullName && ["Name", escapeHtml(fullName)],
    company && ["Company", escapeHtml(company)],
    email && ["Email", escapeHtml(email)],
    phone && ["Phone", escapeHtml(phone)],
    ["Inquiry type", type],
    projectLocation && ["Project location", escapeHtml(projectLocation)],
    heardAbout && ["Heard about us", escapeHtml(heardAbout)],
  ])}
            ${message
      ? `<div style="height:18px;line-height:18px;font-size:0;">&nbsp;</div>
            <p style="margin:0 0 8px 0;font-family:${FONT};font-size:12px;line-height:20px;font-weight:600;letter-spacing:0.6px;text-transform:uppercase;color:${C.muted};">Your message</p>
            ${messageBlock(message, "")}`
      : ""
    }`;

  const contactCard = `
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.navy}" style="background-color:${C.navy};border-radius:10px;">
              <tr>
                <td style="padding:24px 24px 22px 24px;font-family:${FONT};">
                  <p style="margin:0 0 4px 0;font-size:11px;line-height:16px;font-weight:600;letter-spacing:1.4px;text-transform:uppercase;color:#6ee7b7;">Need to reach us sooner?</p>
                  <p style="margin:0 0 6px 0;font-size:18px;line-height:24px;font-weight:700;color:${C.white};">${CONTACT.developer}, Developer</p>
                  <p style="margin:0 0 18px 0;font-size:14px;line-height:22px;color:#b8c6d9;">For time-sensitive matters &mdash; an off-market parcel, a contract deadline or a partnership question &mdash; contact John directly.</p>
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
                    <td class="stack" valign="top">
                      <table role="presentation" class="btn" cellpadding="0" cellspacing="0" border="0"><tr>
                        <td align="center" bgcolor="${C.emerald}" style="background-color:${C.emerald};border-radius:8px;">
                          <a href="tel:${CONTACT.cellTel}" style="display:inline-block;padding:12px 20px;font-family:${FONT};font-size:14px;line-height:18px;font-weight:600;color:${C.white};text-decoration:none;">Call ${CONTACT.cell}</a>
                        </td>
                      </tr></table>
                    </td>
                    <td class="stack stack-gap" valign="top" style="padding-left:10px;">
                      <table role="presentation" class="btn" cellpadding="0" cellspacing="0" border="0"><tr>
                        <td align="center" style="border:1px solid #3b5779;border-radius:8px;">
                          <a href="mailto:${CONTACT.email}" style="display:inline-block;padding:11px 20px;font-family:${FONT};font-size:14px;line-height:18px;font-weight:600;color:${C.white};text-decoration:none;">Email John</a>
                        </td>
                      </tr></table>
                    </td>
                  </tr></table>
                  <p style="margin:16px 0 0 0;font-size:13px;line-height:20px;color:#8ea2bd;">Office <a href="tel:${CONTACT.officeTel}" style="color:#d6e0ec;text-decoration:none;">${CONTACT.office}</a> &nbsp;&middot;&nbsp; <a href="mailto:${CONTACT.email}" style="color:#d6e0ec;text-decoration:none;">${CONTACT.email}</a></p>
                </td>
              </tr>
            </table>`;

  return shell({
    title: "We received your inquiry | Cenzo R.E. Developments",
    preheader: `Thanks${firstName ? `, ${fullName.trim().split(/\s+/)[0]}` : ""} — your inquiry (${refCode}) is with developer John Zaloum. Expect a reply within 24–48 business hours.`,
    content: [
      header("Inquiry received"),
      section(hero, { padding: "36px 36px 32px 36px" }),
      divider(),
      section(nextSteps, { padding: "28px 36px 28px 36px" }),
      divider(),
      section(summary, { padding: "28px 36px 30px 36px" }),
      section(contactCard, { padding: "0 36px 36px 36px", last: true }),
      footer(
        `All inquiries, plans and landowner discussions are kept confidential. &nbsp;<a href="${CONTACT.siteUrl}" style="color:${C.emerald};text-decoration:none;font-weight:600;">${CONTACT.site}</a>`
      ),
    ].join(""),
  });
}
