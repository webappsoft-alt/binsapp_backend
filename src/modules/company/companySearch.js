import mongoose from "mongoose";
import Order from "../../models/Order.js";
import ProviderLead from "../../models/ProviderLead.js";
import BuilderOffer from "../../models/BuilderOffer.js";
import BillingRecord from "../../models/BillingRecord.js";
import JobSites from "../../models/JobSites.js";
import Company from "../../models/Company.js";
import User from "../../models/User.js";
import Dumbster from "../../models/Dumbster.js";

const LIMIT = 6;
const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const STATUS_WORDS = {
  pending: ["pending", "waiting", "open", "new", "requested"],
  accepted: ["accepted", "active", "in progress", "scheduled", "on site", "onsite"],
  completed: ["completed", "complete", "done", "finished", "closed"],
  cancelled: ["cancelled", "canceled", "declined", "rejected"],
};

function statusIntent(q) {
  const lower = q.toLowerCase();
  return Object.keys(STATUS_WORDS).filter((k) =>
    STATUS_WORDS[k].some((w) => lower === w || lower.includes(w)),
  );
}

/** Resolve the company id + every user id that acts for it. */
async function resolveCompanyScope(user) {
  let companyId = user.company || null;
  if (Array.isArray(companyId)) companyId = companyId[0] || null;
  if (companyId && typeof companyId === "object" && companyId._id) companyId = companyId._id;
  if (!companyId) {
    const comp = await Company.findOne({ user: user._id }).select("_id").lean();
    if (comp) companyId = comp._id;
  }
  return { companyId: companyId ? new mongoose.Types.ObjectId(String(companyId)) : null };
}

/**
 * Commercial portal header search. Every query is scoped to the signed-in
 * company user (orders, quotes) or their company (offers, invoices, jobsites).
 */
export async function searchCompanyRecords(user, rawQuery) {
  const q = String(rawQuery || "").trim().slice(0, 80);
  const empty = { query: q, orders: [], quotes: [], offers: [], jobsites: [], invoices: [], providers: [] };
  if (q.length < 2) return empty;

  const uid = new mongoose.Types.ObjectId(String(user._id));
  const { companyId } = await resolveCompanyScope(user);
  const rx = new RegExp(escapeRegex(q), "i");
  const isObjectId = mongoose.Types.ObjectId.isValid(q) && q.length === 24;
  const intents = statusIntent(q);
  const sizeCandidate = q.replace(/(?:yards?|yds?|\s+)/gi, "").trim();
  const isSize = /^\d+$/.test(sizeCandidate);

  const [matchingDumbsters, matchingProviders] = await Promise.all([
    isSize
      ? Dumbster.find({ size: new RegExp(escapeRegex(sizeCandidate), "i") }).select("_id").lean()
      : [],
    User.find({ $or: [{ name: rx }, { comp_name: rx }, { email: rx }, { phone: rx }] })
      .select("_id name comp_name phone email profilePicture")
      .limit(50)
      .lean(),
  ]);
  const dumbsterIds = matchingDumbsters.map((d) => d._id);
  const providerIds = matchingProviders.map((p) => p._id);

  const jobsiteScope = companyId ? { $or: [{ user: uid }, { company: companyId }] } : { user: uid };
  const matchingSites = await JobSites.find({
    ...jobsiteScope,
    $and: [
      {
        $or: [
          { siteName: rx },
          { projectName: rx },
          { address: rx },
          { city: rx },
          { jobNumber: rx },
          { poNumber: rx },
          { costCode: rx },
          { communityName: rx },
        ],
      },
    ],
  })
    .select("_id siteName projectName address city jobNumber serviceType")
    .sort({ createdAt: -1 })
    .limit(20)
    .lean();
  const siteIds = matchingSites.map((s) => s._id);

  // Orders
  const orderOr = [
    { orderNumber: rx },
    { address: rx },
    { service_type: rx },
    { status: rx },
    { leadNumber: rx },
  ];
  if (intents.includes("pending")) orderOr.push({ status: "pending" });
  if (intents.includes("accepted")) orderOr.push({ status: "accepted" });
  if (intents.includes("completed")) orderOr.push({ status: "completed" });
  if (intents.includes("cancelled")) orderOr.push({ status: "cancelled" });
  if (siteIds.length) orderOr.push({ jobSite: { $in: siteIds } });
  if (providerIds.length) orderOr.push({ to_id: { $in: providerIds } });
  if (dumbsterIds.length) orderOr.push({ dumbster: { $in: dumbsterIds } });
  if (isObjectId) orderOr.push({ _id: new mongoose.Types.ObjectId(q) });

  // Quotes (direct provider leads the company sent)
  const quoteOr = [
    { leadNumber: rx },
    { serviceType: rx },
    { status: rx },
    { dumpsterSize: rx },
    { "customerInfo.address": rx },
    { "customerInfo.city": rx },
  ];
  if (providerIds.length) quoteOr.push({ provider: { $in: providerIds } });
  if (intents.includes("pending")) quoteOr.push({ status: "pending" });
  if (isObjectId) quoteOr.push({ _id: new mongoose.Types.ObjectId(q) });

  const offerOr = [
    { title: rx },
    { regionLabel: rx },
    { status: rx },
    { serviceType: rx },
    { "lines.siteName": rx },
    { "lines.projectName": rx },
    { "lines.address": rx },
    { "lines.jobNumber": rx },
  ];
  if (isObjectId) offerOr.push({ _id: new mongoose.Types.ObjectId(q) });

  const invoiceOr = [{ invoiceNumber: rx }, { status: rx }, { "lineItems.description": rx }];
  if (isObjectId) invoiceOr.push({ _id: new mongoose.Types.ObjectId(q) });

  const [orders, quotes, offers, invoices, providerOrderIds] = await Promise.all([
    Order.find({ $and: [companyId ? { $or: [{ user: uid }, { company: companyId }] } : { user: uid }, { $or: orderOr }] })
      .select("_id orderNumber status service_type address total_price price jobSite to_id dumbster createdAt")
      .populate({ path: "to_id", select: "name comp_name" })
      .populate({ path: "jobSite", select: "siteName" })
      .populate({ path: "dumbster", select: "size" })
      .sort({ createdAt: -1 })
      .limit(LIMIT)
      .lean(),
    ProviderLead.find({
      $and: [
        { $or: [{ customer: uid }, ...(user.email ? [{ "customerInfo.email": String(user.email).toLowerCase() }] : [])] },
        { $or: quoteOr },
      ],
    })
      .select("_id leadNumber status serviceType dumpsterSize estimate.estimatedPrice provider createdAt")
      .populate({ path: "provider", select: "name comp_name" })
      .sort({ createdAt: -1 })
      .limit(LIMIT)
      .lean(),
    companyId
      ? BuilderOffer.find({ company: companyId, $or: offerOr })
          .select("_id title status serviceType builderTotal lines.siteName createdAt")
          .sort({ createdAt: -1 })
          .limit(LIMIT)
          .lean()
      : [],
    companyId
      ? BillingRecord.find({ company: companyId, $or: invoiceOr })
          .select("_id invoiceNumber status amount paidAmount dueDate createdAt")
          .sort({ createdAt: -1 })
          .limit(LIMIT)
          .lean()
      : [],
    providerIds.length
      ? Order.distinct("to_id", { user: uid, to_id: { $in: providerIds } })
      : [],
  ]);

  const usedProviders = new Set(providerOrderIds.map(String));
  const providers = matchingProviders
    .filter((p) => usedProviders.has(String(p._id)))
    .slice(0, LIMIT)
    .map((p) => ({
      id: p._id,
      name: p.comp_name || p.name || "Provider",
      phone: p.phone || "",
    }));

  return {
    query: q,
    orders: orders.map((o) => ({
      id: o._id,
      orderNumber: o.orderNumber || String(o._id).slice(-6).toUpperCase(),
      status: o.status,
      serviceType: o.service_type,
      size: o.dumbster?.size || "",
      address: o.address || "",
      siteName: o.jobSite?.siteName || "",
      providerName: o.to_id?.comp_name || o.to_id?.name || "",
      total: o.total_price || o.price || 0,
    })),
    quotes: quotes.map((l) => ({
      id: l._id,
      leadNumber: l.leadNumber,
      status: l.status,
      serviceType: l.serviceType,
      size: l.dumpsterSize || "",
      providerName: l.provider?.comp_name || l.provider?.name || "",
      estimatedPrice: l.estimate?.estimatedPrice || 0,
    })),
    offers: offers.map((o) => ({
      id: o._id,
      title: o.title || "Commercial Offer",
      status: o.status,
      serviceType: o.serviceType,
      total: o.builderTotal || 0,
      siteName: o.lines?.[0]?.siteName || "",
    })),
    jobsites: matchingSites.slice(0, LIMIT).map((s) => ({
      id: s._id,
      siteName: s.siteName,
      projectName: s.projectName || "",
      address: [s.address, s.city].filter(Boolean).join(", "),
      jobNumber: s.jobNumber || "",
    })),
    invoices: invoices.map((r) => ({
      id: r._id,
      invoiceNumber: r.invoiceNumber || String(r._id).slice(-6).toUpperCase(),
      status: r.status,
      amount: r.amount || 0,
      paidAmount: r.paidAmount || 0,
      dueDate: r.dueDate,
    })),
    providers,
  };
}

/**
 * Lightweight sidebar badge counts for the commercial shell — one round trip
 * of `countDocuments` instead of downloading full order / offer / lead lists.
 */
export async function getCompanySidebarCounts(user) {
  const uid = new mongoose.Types.ObjectId(String(user._id));
  const { companyId } = await resolveCompanyScope(user);
  const company = companyId ? await Company.findById(companyId).select("status").lean() : null;
  const approved = company?.status === "approved";

  const orderScope = companyId ? { $or: [{ user: uid }, { company: companyId }] } : { user: uid };
  const leadScope = {
    $or: [{ customer: uid }, ...(user.email ? [{ "customerInfo.email": String(user.email).toLowerCase() }] : [])],
  };
  const jobsiteScope = companyId ? { $or: [{ user: uid }, { company: companyId }] } : { user: uid };
  const rentalTypes = ["Dumbster", "Porta Potty"];

  const [
    ordersByStatus,
    onSiteUnits,
    quotesByStatus,
    offersByStatus,
    jobsitesCount,
    invoicesByStatus,
    providerIds,
  ] = await Promise.all([
    Order.aggregate([{ $match: orderScope }, { $group: { _id: "$status", n: { $sum: 1 } } }]),
    Order.countDocuments({ ...orderScope, status: "accepted", service_type: { $in: rentalTypes } }),
    ProviderLead.aggregate([{ $match: leadScope }, { $group: { _id: "$status", n: { $sum: 1 } } }]),
    approved
      ? BuilderOffer.aggregate([{ $match: { company: companyId } }, { $group: { _id: "$status", n: { $sum: 1 } } }])
      : [],
    JobSites.countDocuments(jobsiteScope),
    companyId
      ? BillingRecord.aggregate([{ $match: { company: companyId } }, { $group: { _id: "$status", n: { $sum: 1 } } }])
      : [],
    Order.distinct("to_id", { ...orderScope, to_id: { $ne: null } }),
  ]);

  const toMap = (rows) => rows.reduce((acc, r) => ({ ...acc, [r._id || "unknown"]: r.n }), {});
  const sum = (m) => Object.values(m).reduce((a, b) => a + b, 0);
  const orders = toMap(ordersByStatus);
  const quotes = toMap(quotesByStatus);
  const offers = toMap(offersByStatus);
  const invoices = toMap(invoicesByStatus);

  return {
    orders: { ...orders, all: sum(orders) },
    activeOrders: orders.accepted || 0,
    pendingOrders: orders.pending || 0,
    onSiteUnits,
    quotes: quotes.estimate_sent || 0,
    totalQuotes: sum(quotes),
    quotesByStatus: { ...quotes, all: sum(quotes) },
    builderOffers: (offers.needs_adjustment || 0) + (offers.open || 0) + (offers.partially_fulfilled || 0),
    offersByStatus: { ...offers, all: sum(offers) },
    jobsitesCount,
    openInvoices: (invoices.open || 0) + (invoices.due || 0) + (invoices.partial || 0),
    invoicesByStatus: { ...invoices, all: sum(invoices) },
    providersCount: providerIds.length,
  };
}
