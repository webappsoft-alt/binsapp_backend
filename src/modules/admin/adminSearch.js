import mongoose from "mongoose";
import Order from "../../models/Order.js";
import User from "../../models/User.js";
import Dumbster from "../../models/Dumbster.js";
import Company from "../../models/Company.js";
import ProviderLead from "../../models/ProviderLead.js";
import AdminManualReviewRequests from "../../models/AdminManualReviewRequests.js";
import Conversation from "../../models/Conversation.js";
import Message from "../../models/Message.js";
import Support from "../../models/Support.js";
import BillingRecord from "../../models/BillingRecord.js";
import Transaction from "../../models/Transaction.js";

const LIMIT = 6;
const RELATED_LIMIT = 8;
const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const oid = (v) => new mongoose.Types.ObjectId(String(v));
const idOf = (v) => (v && typeof v === "object" ? v._id : v);
const settled = (r) => (r.status === "fulfilled" ? r.value || [] : []);

const USER_FIELDS = "_id name comp_name email phone role profilePicture status city state createdAt company";
const USER_POP = "name comp_name email phone role profilePicture status";

const ORDER_SELECT =
  "_id orderNumber leadNumber status service_type price amount address start_date end_date createdAt user to_id company payment_type gateAccessCode";

/** Merge record lists, keep first occurrence of each _id. */
function mergeById(...lists) {
  const seen = new Set();
  const out = [];
  for (const list of lists) {
    for (const item of list || []) {
      const key = String(item?._id || "");
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(item);
    }
  }
  return out;
}

/** Phone regex that ignores formatting: "923096811835" matches "+92 309-6811835". */
function phoneRegex(q) {
  const digits = String(q).replace(/\D/g, "");
  if (digits.length < 7) return null;
  // Allow optional separators between digits; tolerate a leading 0 vs country code.
  const core = digits.replace(/^0+/, "");
  return new RegExp(core.split("").map(escapeRegex).join("[\\s\\-().]*"));
}

/** Orders, chats, tickets, invoices & payments linked to a set of users. */
async function relatedForUsers(userIds, users) {
  if (!userIds.length) return {};
  const ids = userIds.map(oid);
  const emails = users.map((u) => u.email).filter((e) => e && !/deleted/i.test(e));
  const phones = users.map((u) => String(u.phone || "").replace(/deleted.*$/i, "")).filter(Boolean);

  const [orders, chats, tickets, invoices, transactions, companies] = await Promise.allSettled([
    Order.find({ $or: [{ user: { $in: ids } }, { to_id: { $in: ids } }] })
      .select(ORDER_SELECT)
      .populate("user", USER_POP)
      .populate("to_id", USER_POP)
      .sort({ createdAt: -1 })
      .limit(RELATED_LIMIT)
      .lean(),
    Conversation.find({ participants: { $in: ids } })
      .populate("participants", USER_POP)
      .populate("lastMessage", "content type timestamp senderId")
      .sort({ lastActivity: -1 })
      .limit(RELATED_LIMIT)
      .lean(),
    Support.find({
      $or: [
        { user: { $in: ids } },
        ...(emails.length ? [{ email: { $in: emails } }] : []),
        ...(phones.length ? [{ phone: { $in: phones } }] : []),
      ],
    })
      .select("_id supportId name email phone msg attended createdAt user")
      .sort({ createdAt: -1 })
      .limit(RELATED_LIMIT)
      .lean(),
    BillingRecord.find({ user: { $in: ids } })
      .select("_id invoiceNumber status amount paidAmount dueDate createdAt company user order")
      .populate("company", "companyName")
      .sort({ createdAt: -1 })
      .limit(RELATED_LIMIT)
      .lean(),
    Transaction.find({ user: { $in: ids } })
      .select("_id amount type stripePaymentIntentId createdAt user order metadata")
      .populate("user", USER_POP)
      .sort({ createdAt: -1 })
      .limit(RELATED_LIMIT)
      .lean(),
    Company.find({ user: { $in: ids } })
      .select("_id companyName legalBusinessName dba EIN email phone status city state createdAt user")
      .limit(RELATED_LIMIT)
      .lean(),
  ]);

  return {
    orders: settled(orders),
    chats: settled(chats),
    tickets: settled(tickets),
    invoices: settled(invoices),
    transactions: settled(transactions),
    companies: settled(companies),
  };
}

/** Customer, provider, chat, invoices & payments linked to a set of orders. */
async function relatedForOrders(orders) {
  if (!orders.length) return {};
  const orderIds = orders.map((o) => oid(o._id));
  const people = new Map();
  for (const o of orders) {
    for (const p of [o.user, o.to_id]) {
      if (p && typeof p === "object" && p._id) people.set(String(p._id), p);
    }
  }
  const peopleIds = [...people.keys()].map(oid);
  const numbers = orders.map((o) => o.orderNumber).filter(Boolean).map(escapeRegex);

  const pairFilters = orders
    .filter((o) => idOf(o.user) && idOf(o.to_id))
    .map((o) => ({ participants: { $all: [oid(idOf(o.user)), oid(idOf(o.to_id))] } }));

  const [chats, invoices, transactions, tickets] = await Promise.allSettled([
    pairFilters.length
      ? Conversation.find({ $or: pairFilters })
          .populate("participants", USER_POP)
          .populate("lastMessage", "content type timestamp senderId")
          .sort({ lastActivity: -1 })
          .limit(RELATED_LIMIT)
          .lean()
      : [],
    BillingRecord.find({ $or: [{ order: { $in: orderIds } }, { "lineItems.order": { $in: orderIds } }] })
      .select("_id invoiceNumber status amount paidAmount dueDate createdAt company user order")
      .populate("company", "companyName")
      .sort({ createdAt: -1 })
      .limit(RELATED_LIMIT)
      .lean(),
    Transaction.find({ order: { $in: orderIds } })
      .select("_id amount type stripePaymentIntentId createdAt user order metadata")
      .populate("user", USER_POP)
      .sort({ createdAt: -1 })
      .limit(RELATED_LIMIT)
      .lean(),
    numbers.length
      ? Support.find({ msg: new RegExp(numbers.join("|"), "i") })
          .select("_id supportId name email phone msg attended createdAt user")
          .sort({ createdAt: -1 })
          .limit(RELATED_LIMIT)
          .lean()
      : [],
  ]);

  let users = [...people.values()];
  if (peopleIds.length) {
    users = await User.find({ _id: { $in: peopleIds } }).select(USER_FIELDS).lean().catch(() => users);
  }

  return {
    users,
    chats: settled(chats),
    invoices: settled(invoices),
    transactions: settled(transactions),
    tickets: settled(tickets),
  };
}

/**
 * Global Admin search.
 *
 * Direct matches across every admin area (users, orders, chats, tickets, invoices,
 * payments, companies, equipment, leads, manual requests). When the query pins down a
 * person (name / email / phone) or an order code, everything linked to it is pulled in
 * too — so searching a phone number shows that user's orders, chats, tickets & invoices.
 */
export async function searchAdminRecords(rawQuery) {
  const q = String(rawQuery || "").trim().slice(0, 80);
  const empty = {
    query: q,
    focus: null,
    orders: [],
    users: [],
    dumpsters: [],
    companies: [],
    leads: [],
    requests: [],
    chats: [],
    tickets: [],
    invoices: [],
    transactions: [],
  };

  if (q.length < 2) return empty;

  const rx = new RegExp(escapeRegex(q), "i");
  const prx = phoneRegex(q);
  const isObjectId = mongoose.Types.ObjectId.isValid(q) && q.length === 24;
  const byId = isObjectId ? [{ _id: oid(q) }] : [];
  // "ORD-10293" / "#10293" / "10293" should all hit the same order.
  const codeCore = q.replace(/^#/, "").replace(/^(ord|inv|rec|lead)[-\s#]*/i, "");
  const codeRx = codeCore && codeCore !== q ? new RegExp(escapeRegex(codeCore), "i") : null;

  const [
    ordersR,
    usersR,
    dumpstersR,
    companiesR,
    leadsR,
    requestsR,
    ticketsR,
    invoicesR,
    transactionsR,
    messagesR,
    chatsByIdR,
  ] = await Promise.allSettled([
    Order.find({
      $or: [
        ...byId,
        { orderNumber: rx },
        ...(codeRx ? [{ orderNumber: codeRx }] : []),
        { leadNumber: rx },
        { gateAccessCode: rx },
        { address: rx },
        { paymentId: rx },
        { transferId: rx },
      ],
    })
      .select(ORDER_SELECT)
      .populate("user", USER_POP)
      .populate("to_id", USER_POP)
      .sort({ createdAt: -1 })
      .limit(LIMIT)
      .lean(),

    User.find({
      $or: [
        ...byId,
        { name: rx },
        { comp_name: rx },
        { email: rx },
        { phone: rx },
        ...(prx ? [{ phone: prx }] : []),
        { city: rx },
      ],
    })
      .select(USER_FIELDS)
      .sort({ createdAt: -1 })
      .limit(LIMIT)
      .lean(),

    Dumbster.find({
      $or: [...byId, { name: rx }, { size: rx }, { address: rx }, { city: rx }, { zip: rx }],
    })
      .select("_id name size service_type price verify rejected address city state zip user createdAt")
      .populate("user", "name comp_name email phone profilePicture")
      .sort({ createdAt: -1 })
      .limit(LIMIT)
      .lean(),

    Company.find({
      $or: [
        ...byId,
        { companyName: rx },
        { legalBusinessName: rx },
        { dba: rx },
        { EIN: rx },
        { email: rx },
        { phone: rx },
        ...(prx ? [{ phone: prx }] : []),
        { address: rx },
        { city: rx },
      ],
    })
      .select("_id companyName legalBusinessName dba EIN email phone status city state createdAt user")
      .populate("user", USER_POP)
      .sort({ createdAt: -1 })
      .limit(LIMIT)
      .lean(),

    ProviderLead.find({
      $or: [...byId, { leadNumber: rx }, ...(codeRx ? [{ leadNumber: codeRx }] : []), { city: rx }, { zip: rx }],
    })
      .select("_id leadNumber serviceType city state zip status estimatedPrice createdAt renter")
      .populate("renter", "name comp_name email")
      .sort({ createdAt: -1 })
      .limit(LIMIT)
      .lean(),

    AdminManualReviewRequests.find({ $or: [...byId, { address: rx }] })
      .select("_id service_type status address createdAt userId userAcceptedStatus")
      .populate("userId", USER_POP)
      .sort({ createdAt: -1 })
      .limit(LIMIT)
      .lean(),

    Support.find({
      $or: [
        ...byId,
        { supportId: rx },
        { name: rx },
        { email: rx },
        { phone: rx },
        ...(prx ? [{ phone: prx }] : []),
        { msg: rx },
      ],
    })
      .select("_id supportId name email phone msg attended createdAt user")
      .sort({ createdAt: -1 })
      .limit(LIMIT)
      .lean(),

    BillingRecord.find({
      $or: [...byId, { invoiceNumber: rx }, ...(codeRx ? [{ invoiceNumber: codeRx }] : []), { notes: rx }],
    })
      .select("_id invoiceNumber status amount paidAmount dueDate createdAt company user order")
      .populate("company", "companyName")
      .sort({ createdAt: -1 })
      .limit(LIMIT)
      .lean(),

    Transaction.find({ $or: [...byId, { stripePaymentIntentId: rx }] })
      .select("_id amount type stripePaymentIntentId createdAt user order metadata")
      .populate("user", USER_POP)
      .sort({ createdAt: -1 })
      .limit(LIMIT)
      .lean(),

    // Chats whose messages mention the query (only for word-ish queries, it's a scan).
    q.length >= 3
      ? Message.find({ content: rx, isDeleted: { $ne: true } })
          .select("conversationId content timestamp")
          .sort({ timestamp: -1 })
          .limit(LIMIT)
          .lean()
      : [],

    isObjectId
      ? Conversation.find({ _id: oid(q) })
          .populate("participants", USER_POP)
          .populate("lastMessage", "content type timestamp senderId")
          .lean()
      : [],
  ]);

  let orders = settled(ordersR);
  let users = settled(usersR);
  let companies = settled(companiesR);
  let tickets = settled(ticketsR);
  let invoices = settled(invoicesR);
  let transactions = settled(transactionsR);
  let chats = settled(chatsByIdR);

  // Chats found through message text.
  const hitMessages = settled(messagesR);
  if (hitMessages.length) {
    const snippetByConv = new Map();
    for (const m of hitMessages) {
      const k = String(m.conversationId);
      if (!snippetByConv.has(k)) snippetByConv.set(k, m.content);
    }
    const convs = await Conversation.find({ _id: { $in: [...snippetByConv.keys()].map(oid) } })
      .populate("participants", USER_POP)
      .populate("lastMessage", "content type timestamp senderId")
      .lean()
      .catch(() => []);
    chats = mergeById(
      chats,
      convs.map((c) => ({ ...c, matchedText: snippetByConv.get(String(c._id)) })),
    );
  }

  // Decide what the query is "about" and pull in everything linked to it.
  // Exact person hit (phone / email / id, or a single name match) → that person's data.
  // Order code hit → that order's people, chat, invoices, payments.
  let focus = null;
  const exactPeople = users.filter(
    (u) =>
      (prx && prx.test(String(u.phone || ""))) ||
      String(u.email || "").toLowerCase() === q.toLowerCase() ||
      String(u._id) === q,
  );
  const focusUsers = exactPeople.length ? exactPeople : users.length && users.length <= 2 ? users : [];

  if (focusUsers.length) {
    const rel = await relatedForUsers(
      focusUsers.map((u) => String(u._id)),
      focusUsers,
    ).catch(() => ({}));
    orders = mergeById(orders, rel.orders);
    chats = mergeById(chats, rel.chats);
    tickets = mergeById(tickets, rel.tickets);
    invoices = mergeById(invoices, rel.invoices);
    transactions = mergeById(transactions, rel.transactions);
    companies = mergeById(companies, rel.companies);
    focus = {
      type: "user",
      label: focusUsers.map((u) => u.name || u.comp_name || u.email || u.phone).filter(Boolean).join(", "),
    };
  } else if (orders.length && orders.length <= 3) {
    const rel = await relatedForOrders(orders).catch(() => ({}));
    users = mergeById(users, rel.users);
    chats = mergeById(chats, rel.chats);
    tickets = mergeById(tickets, rel.tickets);
    invoices = mergeById(invoices, rel.invoices);
    transactions = mergeById(transactions, rel.transactions);
    focus = {
      type: "order",
      label: orders.map((o) => o.orderNumber || `#${String(o._id).slice(-6)}`).join(", "),
    };
  }

  return {
    query: q,
    focus,
    orders,
    users,
    dumpsters: settled(dumpstersR),
    companies,
    leads: settled(leadsR),
    requests: settled(requestsR),
    chats,
    tickets,
    invoices,
    transactions,
  };
}
