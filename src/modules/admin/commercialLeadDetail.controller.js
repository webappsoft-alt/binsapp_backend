import mongoose from "mongoose";
import Lead from "../../models/Lead.js";
import SalesLead from "../../models/SalesLead.js";
import SalesConversation from "../../models/SalesConversation.js";
import User from "../../models/User.js";
import Company from "../../models/Company.js";
import { BadRequestError, NotFoundError } from "../../utils/apiError.js";

/**
 * Commercial lead record pages in the admin.
 *   type "sales" → SalesLead (AI-qualified chat leads)
 *   type "demo"  → Lead (commercial demo / builder requests)
 */

const digits = (v) => String(v || "").replace(/\D/g, "").slice(-10);
const rx = (v) => new RegExp(`^${String(v).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i");

function contactFilters({ email, phone }, type) {
  const or = [];
  const e = String(email || "").trim().toLowerCase();
  const p = digits(phone);
  if (type === "sales") {
    if (e) or.push({ "contact.email": e });
    if (p.length >= 7) or.push({ "contact.phone": { $regex: `${p}$` } });
  } else {
    if (e) or.push({ email: e });
    if (p.length >= 7) or.push({ phone: { $regex: `${p}$` } });
  }
  return or;
}

async function findUserFor({ email, phone }) {
  const or = [];
  if (email) or.push({ email: rx(String(email).trim()) });
  const p = digits(phone);
  if (p.length >= 7) or.push({ phone: { $regex: `${p}$` } });
  if (!or.length) return null;
  return User.findOne({ $or: or, status: { $ne: "deleted" } })
    .select("name email phone role type status profilePicture company createdAt")
    .lean();
}

/** GET /api/admin/commercial-leads/lookup?userId=|email=|phone= — every commercial lead for one person. */
export async function lookupCommercialLeads(req, res, next) {
  try {
    let { email, phone, userId } = req.query;
    if (userId && mongoose.isValidObjectId(userId)) {
      const u = await User.findById(userId).select("email phone").lean();
      email = email || u?.email;
      phone = phone || u?.phone;
    }
    if (!email && !phone) throw new BadRequestError("email, phone or userId is required");

    const salesOr = contactFilters({ email, phone }, "sales");
    const demoOr = contactFilters({ email, phone }, "demo");
    const [sales, demo] = await Promise.all([
      salesOr.length ? SalesLead.find({ $or: salesOr }).sort({ createdAt: -1 }).limit(50).lean() : [],
      demoOr.length ? Lead.find({ $or: demoOr }).sort({ createdAt: -1 }).limit(50).lean() : [],
    ]);
    const leads = [
      ...sales.map((l) => ({ ...l, leadType: "sales" })),
      ...demo.map((l) => ({ ...l, leadType: "demo" })),
    ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json({ success: true, data: { leads, total: leads.length } });
  } catch (error) {
    next(error);
  }
}

/** GET /api/admin/commercial-leads/:type/:id — one lead with everything linked to it. */
export async function getCommercialLeadDetail(req, res, next) {
  try {
    const { type, id } = req.params;
    if (!["sales", "demo"].includes(type)) throw new BadRequestError("type must be sales or demo");
    if (!mongoose.isValidObjectId(id)) throw new BadRequestError("Invalid lead id");

    if (type === "sales") {
      const lead = await SalesLead.findById(id).lean();
      if (!lead) throw new NotFoundError("Lead not found");
      const conversation = lead.conversationRef
        ? await SalesConversation.findById(lead.conversationRef)
            .select("sessionId title status currentFunnel visitorInfo messages createdAt updatedAt userId")
            .lean()
        : await SalesConversation.findOne({ leadRef: lead._id })
            .select("sessionId title status currentFunnel visitorInfo messages createdAt updatedAt userId")
            .lean();
      const contact = lead.contact || {};
      const [user, related] = await Promise.all([
        findUserFor(contact),
        SalesLead.find({ _id: { $ne: lead._id }, $or: contactFilters(contact, "sales").length ? contactFilters(contact, "sales") : [{ _id: null }] })
          .select("classification status serviceDetails createdAt contact")
          .sort({ createdAt: -1 })
          .limit(10)
          .lean(),
      ]);
      if (conversation?.messages) {
        conversation.messages = conversation.messages.filter((m) => m.role === "user" || m.role === "assistant" || m.role === "operator");
      }
      return res.json({ success: true, data: { type, lead, conversation, user, related } });
    }

    const lead = await Lead.findById(id).lean();
    if (!lead) throw new NotFoundError("Lead not found");
    const [user, company, related] = await Promise.all([
      findUserFor(lead),
      lead.convertedCompany ? Company.findById(lead.convertedCompany).select("name status email phone createdAt").lean() : null,
      Lead.find({ _id: { $ne: lead._id }, $or: contactFilters(lead, "demo").length ? contactFilters(lead, "demo") : [{ _id: null }] })
        .select("companyName status createdAt estimatedMonthlyVolume")
        .sort({ createdAt: -1 })
        .limit(10)
        .lean(),
    ]);
    res.json({ success: true, data: { type, lead, company, user, related } });
  } catch (error) {
    next(error);
  }
}
