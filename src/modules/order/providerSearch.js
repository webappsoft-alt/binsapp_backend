import mongoose from "mongoose";
import Order from "../../models/Order.js";
import ProviderLead from "../../models/ProviderLead.js";
import User from "../../models/User.js";
import Dustbin from "../../models/Dustbin.js";
import Dumbster from "../../models/Dumbster.js";

const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const LIMIT = 6;

/**
 * Levenshtein distance for fuzzy typo tolerance
 */
function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const row = [];
  for (let i = 0; i <= a.length; i++) row[i] = i;
  for (let i = 1; i <= b.length; i++) {
    let prev = i;
    for (let j = 1; j <= a.length; j++) {
      let val;
      if (b.charAt(i - 1) === a.charAt(j - 1)) val = row[j - 1];
      else val = Math.min(row[j - 1] + 1, prev + 1, row[j] + 1);
      row[j - 1] = prev;
      prev = val;
    }
    row[a.length] = prev;
  }
  return row[a.length];
}

/**
 * Domain Synonyms and Typo Dictionary
 */
const CONCEPTS = {
  pending: [
    'pending', 'waiting', 'wait', 'open', 'new', 'unaccepted', 'requested', 'inbox',
    'pening', 'pendign', 'pnding', 'peding', 'pendig', 'pennig'
  ],
  accepted: [
    'accepted', 'active', 'in progress', 'progress', 'on the way', 'current', 'scheduled', 'route',
    'acepted', 'accpted', 'activ', 'actve', 'progess', 'schedul'
  ],
  completed: [
    'completed', 'complete', 'done', 'finished', 'closed', 'settled', 'fulfilled',
    'complet', 'complted', 'complate', 'cmplete', 'finshed'
  ],
  cancelled: [
    'cancelled', 'canceled', 'declined', 'rejected', 'void', 'stopped',
    'canceld', 'cancld', 'cancled', 'rejectd', 'declin'
  ],
  dumpster: [
    'dumpster', 'dumbster', 'bin', 'can', 'container', 'rolloff', 'roll-off', 'trailer', 'trailor', 'equipment', 'unit', 'fleet', 'yard',
    'dumster', 'dumptr', 'dmpster', 'dunpster', 'rollof', 'rol-off', 'trailar', 'equpment', 'equpmnt'
  ],
  estimate: [
    'estimate', 'quote', 'bid', 'pricing', 'proposal', 'rate',
    'estimat', 'estmate', 'estemate', 'qoute', 'quot'
  ],
  lead: [
    'lead', 'inquiry', 'prospect', 'request', 'opportunity',
    'leed', 'led', 'inqury', 'enquiry'
  ],
  customer: [
    'customer', 'client', 'renter', 'buyer', 'account', 'consumer',
    'custmer', 'costomer', 'costumer', 'custmor', 'clint'
  ],
  driver: [
    'driver', 'chauffeur', 'trucker', 'hauler', 'operator', 'courier',
    'drivr', 'driv', 'draiver', 'drive'
  ],
  payment: [
    'payment', 'payout', 'money', 'invoice', 'wallet', 'earnings', 'settlement', 'revenue', 'receipt',
    'paymnt', 'paymet', 'pymt', 'invoic', 'walet', 'earning', 'reciept'
  ],
};

function matchesConcept(inputQuery, conceptKey) {
  const qLower = String(inputQuery || '').toLowerCase().trim();
  const words = qLower.split(/[^a-z0-9-]+/).filter(Boolean);
  const targets = CONCEPTS[conceptKey] || [];

  for (const t of targets) {
    if (t.includes(' ') && qLower.includes(t)) return true;
    if (words.includes(t)) return true;
  }

  for (const word of words) {
    if (word.length < 3) continue;
    for (const t of targets) {
      if (t.includes(' ')) continue;
      if (t.length <= 3) {
        if (word === t) return true;
        continue;
      }
      const maxDist = word.length <= 4 ? 1 : word.length <= 8 ? 2 : 3;
      if (Math.abs(word.length - t.length) <= maxDist) {
        if (levenshtein(word, t) <= maxDist) return true;
      }
    }
  }
  return false;
}

/**
 * Provider-wide search for the portal header.
 * Only ever returns records that belong to this provider (`to_id` / `provider`).
 * Fully flexible: searches jobs, leads, estimates, customers, and equipment/inventory.
 * Understands dumpster sizes (e.g. "40 yard", "40yd", "20", "10-12"), statuses
 * (e.g. "pending", "active", "completed", "cancelled"), customer names, and addresses.
 * Includes fuzzy typo tolerance (e.g. "pening" -> "pending", "dumster" -> "dumpster").
 */
export async function searchProviderRecords(providerId, rawQuery) {
  const q = String(rawQuery || "").trim().slice(0, 80);
  if (q.length < 2) {
    return { query: q, orders: [], leads: [], estimates: [], customers: [], equipment: [] };
  }

  const rx = new RegExp(escapeRegex(q), "i");
  const pid = new mongoose.Types.ObjectId(String(providerId));
  const isObjectId = mongoose.Types.ObjectId.isValid(q) && String(q).length === 24;

  // 1. Detect dumpster size keywords (e.g. "40 yard", "40", "40yd", "10-12", "30", "20")
  const sizeCandidate = q.replace(/(?:yards?|yds?|ton|tons?|-|\s+)/gi, "").trim();
  const isSizeSearch = /^\d+$/.test(sizeCandidate) || /\d+-\d+/.test(q);

  // 2. Detect concept & status keywords with typo-tolerance and full synonyms
  const isPendingQuery = matchesConcept(q, 'pending');
  const isAcceptedQuery = matchesConcept(q, 'accepted');
  const isCompletedQuery = matchesConcept(q, 'completed');
  const isCancelledQuery = matchesConcept(q, 'cancelled');
  const isEquipmentQuery = matchesConcept(q, 'dumpster');
  const isEstimateQuery = matchesConcept(q, 'estimate');
  const isLeadQuery = matchesConcept(q, 'lead');
  const isCustomerQuery = matchesConcept(q, 'customer');
  const isPaymentQuery = matchesConcept(q, 'payment');

  // Find matching catalog dumbsters (e.g. 40 Yard, 30 Yard, 10-12 Yard, etc.)
  const dumbsterOr = [{ description: rx }, { usage: rx }];
  if (sizeCandidate) {
    dumbsterOr.push({ size: new RegExp(`^${escapeRegex(sizeCandidate)}$`, "i") });
    dumbsterOr.push({ size: new RegExp(escapeRegex(sizeCandidate), "i") });
  }
  if (isSizeSearch) {
    dumbsterOr.push({ size: rx });
  }
  const matchingDumbsters = await Dumbster.find({ $or: dumbsterOr })
    .select("_id size description tons")
    .lean();
  const matchingDumbsterIds = matchingDumbsters.map((d) => d._id);

  // 3. Customers that match by name / email / phone / company
  const matchedUsers = await User.find({
    $or: [{ name: rx }, { email: rx }, { phone: rx }, { comp_name: rx }],
  })
    .select("_id name email phone comp_name company access_types profilePicture")
    .limit(50)
    .lean();
  const matchedUserIds = matchedUsers.map((u) => u._id);

  // 4. Build Orders Search Condition
  const orderOr = [
    { address: rx },
    { orderNumber: rx },
    { service_type: rx },
    { status: rx },
    { category: rx },
    { subCategory: rx },
    { leadNumber: rx },
    { instructions: rx },
    { notes: rx },
  ];
  if (isPendingQuery) orderOr.push({ status: "pending" });
  if (isAcceptedQuery) orderOr.push({ status: { $in: ["accepted", "active"] } });
  if (isCompletedQuery) orderOr.push({ status: "completed" });
  if (isCancelledQuery) orderOr.push({ status: { $in: ["cancelled", "canceled"] } });
  if (matchedUserIds.length) orderOr.push({ user: { $in: matchedUserIds } });
  if (matchingDumbsterIds.length) orderOr.push({ dumbster: { $in: matchingDumbsterIds } });
  if (isObjectId) orderOr.push({ _id: new mongoose.Types.ObjectId(q) });

  // 5. Build Leads Search Condition
  const leadOr = [
    { leadNumber: rx },
    { "customerInfo.name": rx },
    { "customerInfo.email": rx },
    { "customerInfo.phone": rx },
    { "customerInfo.address": rx },
    { "customerInfo.city": rx },
    { serviceType: rx },
    { status: rx },
    { projectType: rx },
    { dumpsterSize: rx },
  ];
  if (sizeCandidate) {
    leadOr.push({ dumpsterSize: new RegExp(`^${escapeRegex(sizeCandidate)}$`, "i") });
    leadOr.push({ dumpsterSize: new RegExp(escapeRegex(sizeCandidate), "i") });
  }
  if (isPendingQuery) leadOr.push({ status: "pending" });
  if (isAcceptedQuery) leadOr.push({ status: { $in: ["converted", "estimate_accepted"] } });
  if (matchedUserIds.length) leadOr.push({ customer: { $in: matchedUserIds } });
  if (matchingDumbsterIds.length) leadOr.push({ dumpster: { $in: matchingDumbsterIds } });
  if (isObjectId) leadOr.push({ _id: new mongoose.Types.ObjectId(q) });

  // 6. Build Equipment (Dustbin) Search Condition
  const dustbinOr = [
    { address: rx },
    { description: rx },
    { type: rx },
    { "locationObject.address": rx },
    { "locationObject.city": rx },
  ];
  if (matchingDumbsterIds.length) {
    dustbinOr.push({ dumbster: { $in: matchingDumbsterIds } });
  }
  if (isPendingQuery) {
    dustbinOr.push({ verify: false });
  }
  if (/^(active|inactive|deactive)$/i.test(q)) {
    dustbinOr.push({ status: rx });
  }
  if (/^(equipment|units?|dumpsters?|fleet|inventory)$/i.test(q) || (isEquipmentQuery && !isSizeSearch)) {
    dustbinOr.push({ status: "active" });
  }

  const [orders, leads, estimates, dustbins, orderCustomerIds, leadCustomerIds] = await Promise.all([
    Order.find({ to_id: pid, $or: orderOr })
      .select("_id orderNumber status service_type address price amount user dumbster createdAt")
      .populate({ path: "user", select: "name phone" })
      .populate({ path: "dumbster", select: "size description" })
      .sort({ createdAt: -1 })
      .limit(LIMIT)
      .lean(),
    ProviderLead.find({
      provider: pid,
      status: isAcceptedQuery || isCompletedQuery ? { $in: ["converted", "estimate_accepted"] } : "pending",
      $or: leadOr,
    })
      .select("_id leadNumber status serviceType dumpsterSize customerInfo.name customerInfo.phone createdAt")
      .populate({ path: "dumpster", select: "size" })
      .sort({ createdAt: -1 })
      .limit(LIMIT)
      .lean(),
    ProviderLead.find({
      provider: pid,
      status: isPendingQuery ? "pending" : { $ne: "pending" },
      $or: leadOr,
    })
      .select("_id leadNumber status serviceType dumpsterSize customerInfo.name estimate.estimatedPrice createdAt")
      .populate({ path: "dumpster", select: "size" })
      .sort({ createdAt: -1 })
      .limit(LIMIT)
      .lean(),
    Dustbin.find({ user: pid, $or: dustbinOr })
      .select("_id type status address description availableQuantity quantity dumbster portaPotty locationObject")
      .populate({ path: "dumbster", select: "size description tons" })
      .populate({ path: "portaPotty", select: "name type" })
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

  const equipment = dustbins.map((d) => {
    const size = d.dumbster?.size || "";
    const typeLabel = d.type === "trailor" ? "Dumpster Trailer" : "Roll-off Dumpster";
    const name = size ? `${size} Yard ${typeLabel}` : d.portaPotty?.name || typeLabel;
    const subParts = [
      d.status === "active" ? "Active Unit" : "Inactive",
      d.availableQuantity !== undefined ? `${d.availableQuantity} available` : null,
      d.address || d.locationObject?.city || "Yard Inventory",
    ].filter(Boolean);

    return {
      id: d._id,
      title: name,
      sub: subParts.join(" · "),
      size,
      type: d.type,
      status: d.status,
      href: "/renter/dumpsters",
    };
  });

  return {
    query: q,
    orders: orders.map((o) => {
      const size = o.dumbster?.size ? `${o.dumbster.size} Yard` : "";
      return {
        id: o._id,
        orderNumber: o.orderNumber || String(o._id).slice(-5).toUpperCase(),
        status: o.status,
        serviceType: o.service_type,
        size,
        address: o.address || "",
        customerName: o.user?.name || "",
        amount: Number(o.price || o.amount || 0),
      };
    }),
    leads: leads.map((l) => {
      const size = l.dumpsterSize || l.dumpster?.size ? `${l.dumpsterSize || l.dumpster?.size} Yard` : "";
      return {
        id: l._id,
        leadNumber: l.leadNumber,
        status: l.status,
        serviceType: l.serviceType,
        size,
        customerName: l.customerInfo?.name || "",
      };
    }),
    estimates: estimates.map((e) => {
      const size = e.dumpsterSize || e.dumpster?.size ? `${e.dumpsterSize || e.dumpster?.size} Yard` : "";
      return {
        id: e._id,
        leadNumber: e.leadNumber,
        status: e.status,
        serviceType: e.serviceType,
        size,
        customerName: e.customerInfo?.name || "",
        estimatedPrice: Number(e.estimate?.estimatedPrice || 0),
      };
    }),
    customers,
    equipment,
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
