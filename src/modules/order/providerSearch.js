import mongoose from "mongoose";
import Order from "../../models/Order.js";
import ProviderLead from "../../models/ProviderLead.js";
import User from "../../models/User.js";

const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const LIMIT = 5;

/**
 * Provider-wide search for the portal header.
 * Only ever returns records that belong to this provider (`to_id` / `provider`).
 * Customers are the users who have ordered from, or sent leads to, this provider.
 */
export async function searchProviderRecords(providerId, rawQuery) {
  const q = String(rawQuery || "").trim().slice(0, 80);
  if (q.length < 2) return { query: q, orders: [], leads: [], estimates: [], customers: [] };

  const rx = new RegExp(escapeRegex(q), "i");
  const pid = new mongoose.Types.ObjectId(String(providerId));
  const isObjectId = mongoose.Types.ObjectId.isValid(q) && String(q).length === 24;

  // Customers that match by name / email / phone / company — used to find their records too.
  const matchedUsers = await User.find({
    $or: [{ name: rx }, { email: rx }, { phone: rx }, { comp_name: rx }],
  })
    .select("_id name email phone comp_name company access_types profilePicture")
    .limit(50)
    .lean();
  const matchedUserIds = matchedUsers.map((u) => u._id);

  const orderOr = [{ address: rx }, { orderNumber: rx }, { service_type: rx }];
  if (matchedUserIds.length) orderOr.push({ user: { $in: matchedUserIds } });
  if (isObjectId) orderOr.push({ _id: new mongoose.Types.ObjectId(q) });

  const leadOr = [
    { leadNumber: rx },
    { "customerInfo.name": rx },
    { "customerInfo.email": rx },
    { "customerInfo.phone": rx },
    { "customerInfo.address": rx },
    { serviceType: rx },
  ];
  if (matchedUserIds.length) leadOr.push({ customer: { $in: matchedUserIds } });
  if (isObjectId) leadOr.push({ _id: new mongoose.Types.ObjectId(q) });

  const [orders, leads, estimates, orderCustomerIds, leadCustomerIds] = await Promise.all([
    Order.find({ to_id: pid, $or: orderOr })
      .select("_id orderNumber status service_type address price amount user createdAt")
      .populate({ path: "user", select: "name" })
      .sort({ createdAt: -1 })
      .limit(LIMIT)
      .lean(),
    ProviderLead.find({ provider: pid, status: "pending", $or: leadOr })
      .select("_id leadNumber status serviceType customerInfo.name createdAt")
      .sort({ createdAt: -1 })
      .limit(LIMIT)
      .lean(),
    ProviderLead.find({ provider: pid, status: { $ne: "pending" }, $or: leadOr })
      .select("_id leadNumber status serviceType customerInfo.name estimate.estimatedPrice createdAt")
      .sort({ createdAt: -1 })
      .limit(LIMIT)
      .lean(),
    matchedUserIds.length
      ? Order.distinct("user", { to_id: pid, user: { $in: matchedUserIds } })
      : [],
    matchedUserIds.length
      ? ProviderLead.distinct("customer", { provider: pid, customer: { $in: matchedUserIds } })
      : [],
  ]);

  const myCustomerIds = new Set([...orderCustomerIds, ...leadCustomerIds].map(String));
  const customers = matchedUsers
    .filter((u) => myCustomerIds.has(String(u._id)))
    .slice(0, LIMIT)
    .map((u) => ({
      id: u._id,
      name: u.name || u.comp_name || "Customer",
      email: u.email || "",
      phone: u.phone || "",
      isCommercial: Boolean(u.company) || u.access_types === "company",
    }));

  return {
    query: q,
    orders: orders.map((o) => ({
      id: o._id,
      orderNumber: o.orderNumber || String(o._id).slice(-5).toUpperCase(),
      status: o.status,
      serviceType: o.service_type,
      address: o.address || "",
      customerName: o.user?.name || "",
      amount: Number(o.price || o.amount || 0),
    })),
    leads: leads.map((l) => ({
      id: l._id,
      leadNumber: l.leadNumber,
      status: l.status,
      serviceType: l.serviceType,
      customerName: l.customerInfo?.name || "",
    })),
    estimates: estimates.map((l) => ({
      id: l._id,
      leadNumber: l.leadNumber,
      status: l.status,
      serviceType: l.serviceType,
      customerName: l.customerInfo?.name || "",
      estimatedPrice: Number(l.estimate?.estimatedPrice || 0),
    })),
    customers,
  };
}

/**
 * Dispatch board stage counts for the provider, using the same lane rules as
 * the frontend (lib/renter/renterDispatchLanes.js → getDispatchLane):
 * cancelled → completed → pickup_ready → in_progress → new(pending) → scheduled → accepted.
 */
export async function providerDispatchStats(providerId, filters = {}) {
  const pid = new mongoose.Types.ObjectId(String(providerId));
  const extra = await dispatchFilterConditions(filters);
  const orders = await Order.find(extra.length ? { to_id: pid, $and: extra } : { to_id: pid })
    .select("status onway dropoffimage proofOfWorkDone readyToPickup start_date")
    .lean();

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const counts = {
    new: 0,
    accepted: 0,
    scheduled: 0,
    in_progress: 0,
    pickup_ready: 0,
    completed: 0,
    cancelled: 0,
  };

  orders.forEach((o) => {
    const st = String(o.status || "").toLowerCase();
    let lane;
    if (st === "cancelled" || st === "canceled") lane = "cancelled";
    else if (st === "completed") lane = "completed";
    else if (o.readyToPickup || st === "ready_for_pickup") lane = "pickup_ready";
    else if (o.onway || o.dropoffimage || (o.proofOfWorkDone || []).length > 0) lane = "in_progress";
    else if (st === "pending") lane = "new";
    else {
      const start = o.start_date ? new Date(o.start_date) : null;
      if (start) start.setHours(0, 0, 0, 0);
      lane = start && start.getTime() > today.getTime() ? "scheduled" : "accepted";
    }
    counts[lane] += 1;
  });

  // "Active" = everything still being worked (not completed / cancelled).
  const active = counts.new + counts.accepted + counts.scheduled + counts.in_progress + counts.pickup_ready;
  return { counts, active, total: orders.length };
}

/**
 * Mongo filter for one dispatch lane — same precedence as providerDispatchStats()
 * and the frontend getDispatchLane(): cancelled → completed → pickup_ready →
 * in_progress → new → scheduled → accepted.
 */
export function dispatchLaneQuery(providerId, lane) {
  const to_id = new mongoose.Types.ObjectId(String(providerId));
  const notClosed = { status: { $nin: ["cancelled", "canceled", "completed"] } };
  const ready = { $or: [{ readyToPickup: true }, { status: "ready_for_pickup" }] };
  const moving = {
    $or: [
      { onway: true },
      { dropoffimage: { $nin: [null, ""] } },
      { "proofOfWorkDone.0": { $exists: true } },
    ],
  };
  const tomorrow = new Date();
  tomorrow.setHours(0, 0, 0, 0);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const waiting = [notClosed, { status: { $ne: "pending" } }, { $nor: [ready] }, { $nor: [moving] }];

  switch (lane) {
    case "cancelled":
      return { to_id, status: { $in: ["cancelled", "canceled"] } };
    case "completed":
      return { to_id, status: "completed" };
    case "pickup_ready":
      return { to_id, $and: [notClosed, ready] };
    case "in_progress":
      return { to_id, $and: [notClosed, { $nor: [ready] }, moving] };
    case "new":
      return { to_id, $and: [{ status: "pending" }, { $nor: [ready] }, { $nor: [moving] }] };
    case "scheduled":
      return { to_id, $and: [...waiting, { start_date: { $gte: tomorrow } }] };
    case "accepted":
      return {
        to_id,
        $and: [...waiting, { $or: [{ start_date: { $lt: tomorrow } }, { start_date: null }, { start_date: { $exists: false } }] }],
      };
    default:
      return null;
  }
}

/**
 * Extra Mongo conditions for the dispatch board's service chips + search box,
 * shared by the lane list and the stage counts so both always agree.
 *   service: all | dumpster | junk | tree | porta
 */
export async function dispatchFilterConditions({ service, search } = {}) {
  const conditions = [];
  const svc = String(service || "all").toLowerCase();
  if (svc === "dumpster") {
    conditions.push({ service_type: { $regex: /^(dumb|dump)/i } });
    conditions.push({ $or: [{ portaPotty: null }, { portaPotty: { $exists: false } }] });
  } else if (svc === "junk") {
    conditions.push({ service_type: { $regex: /junk/i } });
  } else if (svc === "tree") {
    conditions.push({ service_type: { $regex: /tree/i } });
  } else if (svc === "porta") {
    conditions.push({ $or: [{ service_type: { $regex: /porta/i } }, { portaPotty: { $nin: [null] } }] });
  }

  const term = String(search || "").trim().slice(0, 80);
  if (term) {
    const rx = new RegExp(escapeRegex(term), "i");
    const users = await User.find({ $or: [{ name: rx }, { phone: rx }, { email: rx }, { comp_name: rx }] })
      .select("_id")
      .limit(200)
      .lean();
    conditions.push({
      $or: [
        { orderNumber: rx },
        { address: rx },
        { service_type: rx },
        ...(users.length ? [{ user: { $in: users.map((u) => u._id) } }] : []),
      ],
    });
  }
  return conditions;
}
