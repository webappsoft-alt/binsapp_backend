import { Router } from "express";
import mongoose from "mongoose";
import { authenticate } from "../../middlewares/auth.js";
import Order from "../../models/Order.js";
import BillingRecord from "../../models/BillingRecord.js";
import { NotFoundError, ForbiddenError, BadRequestError } from "../../utils/apiError.js";
import { sendEmail } from "../../utils/emailHelper.js";
import { sendSMS } from "../../utils/sendSMS.js";
import firebaseAdmin from "../../config/firebase.js";
import logger from "../../config/logger.js";
import {
  buildOrderInvoiceData,
  buildBillingInvoiceData,
  renderInvoice,
} from "../../utils/invoiceRenderer.js";

/**
 * Invoices rendered with the admin-selected default invoice template.
 *
 *   GET  /invoice/order/:id?type=invoice|receipt   → { html, subject, invoiceNumber, template }
 *   GET  /invoice/billing/:id                      → same, for a commercial billing record
 *   POST /invoice/order/:id/email   { to?, type? } → emails the rendered invoice
 *   POST /invoice/billing/:id/email { to? }
 *   POST /invoice/order/:id/send   { type?, imageDataUrl? } → email + SMS to customer AND provider
 *   POST /invoice/billing/:id/send { imageDataUrl? }        → email + SMS to the billed company
 *
 * Access: admins, the order's customer / provider, or members of the billed company.
 */
const router = Router();
router.use(authenticate);

const isAdmin = (u) => ["admin", "superadmin"].includes(String(u?.role || ""));
const same = (a, b) => a && b && String(a._id || a) === String(b._id || b);

const USER_POP = "name comp_name email phone profilePicture";

async function loadOrder(id) {
  if (!mongoose.Types.ObjectId.isValid(id)) throw new BadRequestError("Invalid order id");
  const order = await Order.findById(id)
    .setOptions({ withDeleted: true })
    .populate("user", USER_POP)
    .populate("to_id", USER_POP)
    .populate("company", "companyName legalBusinessName email phone address city state zip")
    .populate("dustbin", "size")
    .lean();
  if (!order) throw new NotFoundError("Order not found");
  return order;
}

function assertOrderAccess(user, order) {
  if (isAdmin(user)) return;
  if (order.isDeleted) throw new NotFoundError("Order not found");
  if (same(user._id, order.user) || same(user._id, order.to_id)) return;
  if (user.company && same(user.company, order.company)) return;
  throw new ForbiddenError("You can't view this invoice");
}

async function loadBilling(id) {
  if (!mongoose.Types.ObjectId.isValid(id)) throw new BadRequestError("Invalid invoice id");
  const record = await BillingRecord.findById(id)
    .populate("company", "companyName legalBusinessName email phone address city state zip")
    .populate("user", USER_POP)
    .populate("order", "orderNumber address")
    .lean();
  if (!record) throw new NotFoundError("Invoice not found");
  return record;
}

function assertBillingAccess(user, record) {
  if (isAdmin(user)) return;
  if (same(user._id, record.user)) return;
  if (user.company && same(user.company, record.company)) return;
  throw new ForbiddenError("You can't view this invoice");
}

const docTypeOf = (v) => (String(v || "").toLowerCase() === "receipt" ? "receipt" : "invoice");

async function orderInvoice(req) {
  const order = await loadOrder(req.params.id);
  assertOrderAccess(req.user, order);
  const docType = docTypeOf(req.query.type || req.body?.type);
  const data = buildOrderInvoiceData(order, { docType });
  return { order, data, rendered: await renderInvoice(data) };
}

async function billingInvoice(req) {
  const record = await loadBilling(req.params.id);
  assertBillingAccess(req.user, record);
  const data = buildBillingInvoiceData(record);
  return { record, data, rendered: await renderInvoice(data) };
}

async function emailRendered(res, { to, rendered }) {
  const email = String(to || "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new BadRequestError("A valid recipient email is required");
  }
  await sendEmail({ to: email, subject: rendered.subject, html: rendered.html });
  res.json({ success: true, message: `Invoice sent to ${email}`, data: { to: email } });
}

router.get("/order/:id", async (req, res, next) => {
  try {
    const { rendered } = await orderInvoice(req);
    res.json({ success: true, message: "Invoice", data: rendered });
  } catch (e) {
    next(e);
  }
});

router.post("/order/:id/email", async (req, res, next) => {
  try {
    const { order, data, rendered } = await orderInvoice(req);
    await emailRendered(res, {
      to: req.body?.to || data.customerEmail || order.user?.email,
      rendered,
    });
  } catch (e) {
    next(e);
  }
});

/* ------------------------------------------------------------------ one-click send */

const bucketFile = async (path, buffer, contentType) => {
  const bucket = firebaseAdmin.storage().bucket();
  const file = bucket.file(path);
  await file.save(buffer, { contentType, resumable: false, metadata: { cacheControl: "public, max-age=300" } });
  await file.makePublic();
  return `https://storage.googleapis.com/${bucket.name}/${path}`;
};

/** Store the rendered invoice (HTML, and the PNG snapshot if the client sent one). */
async function publishInvoice(rendered, imageDataUrl) {
  const stamp = Date.now();
  const slug = String(rendered.invoiceNumber || "invoice").replace(/[^A-Za-z0-9-]/g, "");
  const htmlUrl = await bucketFile(
    `invoices/${slug}-${stamp}.html`,
    Buffer.from(rendered.html, "utf8"),
    "text/html; charset=utf-8",
  );
  let imageUrl = null;
  const m = /^data:image\/png;base64,(.+)$/.exec(String(imageDataUrl || ""));
  if (m) {
    try {
      imageUrl = await bucketFile(`invoices/${slug}-${stamp}.png`, Buffer.from(m[1], "base64"), "image/png");
    } catch (e) {
      logger.warn("invoice png upload failed", { error: e?.message });
    }
  }
  return { htmlUrl, imageUrl };
}

const cleanPhone = (p) => String(p || "").replace(/deleted.*$/i, "").trim();
const cleanEmail = (e) => (/deleted/i.test(String(e || "")) ? "" : String(e || "").trim());

/**
 * Send one rendered invoice to every party: email (full invoice) + SMS (link).
 * recipients: [{ role, name, email, phone }]
 */
async function dispatchInvoice({ rendered, data, recipients, links, smsMeta }) {
  const viewUrl = links.imageUrl || links.htmlUrl;
  const results = [];
  const emailHtml = links.imageUrl
    ? rendered.html.replace(
        /<body([^>]*)>/i,
        `<body$1><p style="text-align:center;font-family:Arial,sans-serif;font-size:12px;margin:0 0 12px"><a href="${links.htmlUrl}">View or print this invoice online</a></p>`,
      )
    : rendered.html;

  const seenEmail = new Set();
  const seenPhone = new Set();
  for (const r of recipients) {
    const email = cleanEmail(r.email);
    if (email && !seenEmail.has(email.toLowerCase())) {
      seenEmail.add(email.toLowerCase());
      try {
        await sendEmail({ to: email, subject: rendered.subject, html: emailHtml });
        results.push({ channel: "email", role: r.role, to: email, ok: true });
      } catch (e) {
        results.push({ channel: "email", role: r.role, to: email, ok: false, error: e?.message });
      }
    }
    const phone = cleanPhone(r.phone);
    if (phone && !seenPhone.has(phone)) {
      seenPhone.add(phone);
      const body =
        r.role === "provider"
          ? `BINS APP: Invoice ${data.invoiceNumber} (${data.total}, ${data.status}) for order ${data.orderNumber || ""} was issued to ${data.customerName}. View: ${viewUrl}`
          : `BINS APP: Hi ${r.name || "there"}, your invoice ${data.invoiceNumber} for ${data.total} (${data.status}) is ready. View: ${viewUrl}`;
      const sms = await sendSMS({ to: phone, body, type: "invoice", metadata: { ...smsMeta, role: r.role } }).catch(
        (e) => ({ success: false, message: e?.message }),
      );
      results.push({ channel: "sms", role: r.role, to: phone, ok: Boolean(sms?.success), error: sms?.success ? undefined : sms?.message });
    }
  }
  return results;
}

const summarize = (results) => {
  const ok = results.filter((r) => r.ok);
  if (!results.length) return "No email or phone on file for the customer or provider";
  const part = (ch) => {
    const all = results.filter((r) => r.channel === ch);
    return all.length ? `${ok.filter((r) => r.channel === ch).length}/${all.length} ${ch === "sms" ? "SMS" : "emails"}` : null;
  };
  return `Invoice sent — ${[part("email"), part("sms")].filter(Boolean).join(", ")}`;
};

router.post("/order/:id/send", async (req, res, next) => {
  try {
    const { order, data, rendered } = await orderInvoice(req);
    const links = await publishInvoice(rendered, req.body?.imageDataUrl);
    const customer = order.user && typeof order.user === "object" ? order.user : {};
    const provider = order.to_id && typeof order.to_id === "object" ? order.to_id : {};
    const recipients = [
      { role: "customer", name: customer.name, email: data.customerEmail || customer.email, phone: customer.phone || data.customerPhone },
      ...(order.company?.email && order.company.email !== data.customerEmail
        ? [{ role: "customer", name: data.customerName, email: order.company.email, phone: order.company.phone }]
        : []),
      { role: "provider", name: provider.comp_name || provider.name, email: provider.email, phone: provider.phone },
    ];
    const results = await dispatchInvoice({
      rendered,
      data,
      recipients,
      links,
      smsMeta: { orderId: String(order._id), invoiceNumber: data.invoiceNumber },
    });
    const anyOk = results.some((r) => r.ok);
    res.status(anyOk ? 200 : 400).json({
      success: anyOk,
      message: summarize(results),
      data: { results, ...links },
    });
  } catch (e) {
    next(e);
  }
});

router.post("/billing/:id/send", async (req, res, next) => {
  try {
    const { record, data, rendered } = await billingInvoice(req);
    const links = await publishInvoice(rendered, req.body?.imageDataUrl);
    const user = record.user && typeof record.user === "object" ? record.user : {};
    const recipients = [
      { role: "customer", name: data.customerName, email: data.customerEmail, phone: data.customerPhone },
      { role: "customer", name: user.name, email: user.email, phone: user.phone },
    ];
    const results = await dispatchInvoice({
      rendered,
      data,
      recipients,
      links,
      smsMeta: { billingId: String(record._id), invoiceNumber: data.invoiceNumber },
    });
    const anyOk = results.some((r) => r.ok);
    res.status(anyOk ? 200 : 400).json({ success: anyOk, message: summarize(results), data: { results, ...links } });
  } catch (e) {
    next(e);
  }
});

router.get("/billing/:id", async (req, res, next) => {
  try {
    const { rendered } = await billingInvoice(req);
    res.json({ success: true, message: "Invoice", data: rendered });
  } catch (e) {
    next(e);
  }
});

router.post("/billing/:id/email", async (req, res, next) => {
  try {
    const { data, rendered } = await billingInvoice(req);
    await emailRendered(res, { to: req.body?.to || data.customerEmail, rendered });
  } catch (e) {
    next(e);
  }
});

export default router;
