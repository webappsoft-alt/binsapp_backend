import mongoose from "mongoose";
import ProviderLead from "../../models/ProviderLead.js";
import BuilderOfferAllocation from "../../models/BuilderOfferAllocation.js";
import { BadRequestError } from "../../utils/apiError.js";
import { attachRepeats } from "./providerEstimates.controller.js";

/**
 * GET /api/admin/owners/:id/leads
 * Every job lead that reached one dumpster owner, in one list:
 *   - "quote"   → a customer asked this owner for a price (ProviderLead)
 *   - "builder" → this owner took bins from a builder (company) job (BuilderOfferAllocation)
 * Rows are already in plain words so the admin table can show them as-is.
 */

const QUOTE_STATUS = {
  pending: "Waiting for price",
  estimate_sent: "Price sent",
  estimate_accepted: "Customer said yes",
  converted: "Became an order",
  declined: "Owner said no",
  cancelled: "Cancelled",
};

const SERVICE_WORDS = {
  Dumbster: "Dumpster rental",
  dumpster: "Dumpster rental",
  "Porta Potty": "Porta potty rental",
  "Junk Removal": "Junk removal",
  "Tree Removal": "Tree removal",
};

const money = (n) => (Number.isFinite(Number(n)) ? Math.round(Number(n) * 100) / 100 : 0);

export const getOwnerLeads = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) throw new BadRequestError("Invalid owner id");
    const ownerId = new mongoose.Types.ObjectId(id);

    const [rawQuotes, builderJobs] = await Promise.all([
      ProviderLead.find({ provider: ownerId })
        .sort({ createdAt: -1 })
        .limit(300)
        .populate("customer", "name email phone profilePicture")
        .lean(),
      BuilderOfferAllocation.find({ provider: ownerId })
        .sort({ createdAt: -1 })
        .limit(300)
        .populate("company", "companyName name")
        .populate("offer", "title regionLabel status")
        .lean(),
    ]);

    const quotes = await attachRepeats(rawQuotes);
    const ORIGIN = { customer: "Customer asked", owner: "Owner sent", admin: "Admin made" };
    const rows = [
      ...quotes.map((q) => ({
        _id: String(q._id),
        kind: "quote",
        kindLabel: q.origin === "owner" ? "Owner sent a price" : "Customer asked for a price",
        origin: q.origin,
        originLabel: ORIGIN[q.origin] || ORIGIN.customer,
        repeat: q.repeat,
        whoPerson: q.customer ? { _id: String(q.customer._id), name: q.customer.name, email: q.customer.email, phone: q.customer.phone, profilePicture: q.customer.profilePicture } : null,
        ref: q.leadNumber ? `#${q.leadNumber}` : `#${String(q._id).slice(-6)}`,
        who: q.customer?.name || q.customerInfo?.name || "Customer",
        whoId: q.customer?._id ? String(q.customer._id) : null,
        whoKind: "customer",
        service: SERVICE_WORDS[q.serviceType] || q.serviceType || "Dumpster rental",
        size: q.dumpsterSize ? `${q.dumpsterSize} yard` : "",
        place: [q.customerInfo?.city, q.customerInfo?.state].filter(Boolean).join(", ") || q.customerInfo?.address || "",
        amount: money(q.estimate?.estimatedPrice),
        status: q.status || "pending",
        statusLabel: QUOTE_STATUS[q.status] || q.status || "Waiting for price",
        date: q.createdAt,
        startDate: q.startDate || null,
        orderId: q.order ? String(q.order) : null,
        href: `/provider-estimates/${q._id}`,
      })),
      ...builderJobs.map((a) => ({
        _id: String(a._id),
        kind: "builder",
        kindLabel: "Builder job",
        origin: "builder",
        originLabel: "Builder company",
        ref: `#${String(a._id).slice(-6)}`,
        who: a.company?.companyName || a.company?.name || "Builder company",
        whoId: a.company?._id ? String(a.company._id) : null,
        whoKind: "company",
        service: "Dumpster rental",
        size: [...new Set((a.lines || []).map((l) => l.size).filter(Boolean))].map((s) => `${s} yard`).join(", "),
        place: a.offer?.regionLabel || "",
        bins: a.binsAccepted || 0,
        amount: money(a.providerPayout),
        status: a.status || "accepted",
        statusLabel: a.status === "cancelled" ? "Cancelled" : "Owner took it",
        date: a.acceptedAt || a.createdAt,
        orderId: a.order ? String(a.order) : null,
        href: a.offer?._id ? `/commercial-portal/offers/${a.offer._id}` : null,
      })),
    ].sort((x, y) => new Date(y.date || 0) - new Date(x.date || 0));

    const counts = {
      all: rows.length,
      quote: rows.filter((r) => r.kind === "quote").length,
      builder: rows.filter((r) => r.kind === "builder").length,
      open: rows.filter((r) => ["pending", "estimate_sent"].includes(r.status)).length,
    };

    res.json({ success: true, data: { rows, counts } });
  } catch (err) {
    next(err);
  }
};
