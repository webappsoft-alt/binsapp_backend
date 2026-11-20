import ProviderLead from "../models/ProviderLead.js";

/** Mongo filter for who made a lead (old leads have no createdBy, so fall back to source). */
const OWNER_SOURCES = ["from_provider", "referral", "direct", "manual"];
export function originFilter(origin) {
  if (origin === "customer") {
    return { $or: [{ createdBy: "customer" }, { createdBy: null, source: { $in: ["provider_profile", null] } }] };
  }
  if (origin === "owner") {
    return { $or: [{ createdBy: "owner" }, { createdBy: null, source: { $in: OWNER_SOURCES } }] };
  }
  if (origin === "admin") {
    return { $or: [{ createdBy: "admin" }, { createdBy: null, source: "admin_entry" }] };
  }
  return null;
}

export function leadOrigin(lead) {
  if (lead?.createdBy) return lead.createdBy;
  if (lead?.source === "admin_entry") return "admin";
  if (OWNER_SOURCES.includes(lead?.source)) return "owner";
  return "customer";
}

const norm = (v) => String(v || "").toLowerCase().replace(/[^a-z0-9]/g, "");
const customerKeyOf = (l) =>
  l?.customer?._id ? `u:${l.customer._id}` : l?.customer ? `u:${l.customer}` : `e:${String(l?.customerInfo?.email || "").toLowerCase()}`;
const sameJobKeyOf = (l) =>
  [customerKeyOf(l), norm(l?.serviceType), norm(l?.dumpsterSize), norm(l?.customerInfo?.address)].join("|");

/**
 * For each lead: how many times this customer asked for the SAME job (same service,
 * size and address) and how many leads this customer has in total.
 */
export async function attachRepeats(input) {
  if (!input?.length) return input;
  // Works with mongoose documents too (turn them into plain objects first).
  const leads = input.map((l) => (l && typeof l.toObject === "function" ? l.toObject() : l));
  const ids = [...new Set(leads.map((l) => l.customer?._id || l.customer).filter(Boolean).map(String))];
  const emails = [...new Set(leads.map((l) => String(l.customerInfo?.email || "").toLowerCase()).filter(Boolean))];
  const or = [];
  if (ids.length) or.push({ customer: { $in: ids } });
  if (emails.length) or.push({ "customerInfo.email": { $in: emails } });
  if (!or.length) return leads;
  const all = await ProviderLead.find({ $or: or })
    .select("customer customerInfo.email customerInfo.address serviceType dumpsterSize createdAt")
    .lean();
  const sameJob = new Map();
  const perCustomer = new Map();
  for (const l of all) {
    const ck = customerKeyOf(l);
    const ek = `e:${String(l.customerInfo?.email || "").toLowerCase()}`;
    perCustomer.set(ck, (perCustomer.get(ck) || 0) + 1);
    if (ek !== ck) perCustomer.set(ek, (perCustomer.get(ek) || 0) + 1);
    const jk = sameJobKeyOf(l);
    sameJob.set(jk, (sameJob.get(jk) || 0) + 1);
  }
  return leads.map((l) => ({
    ...l,
    origin: leadOrigin(l),
    repeat: {
      sameJob: sameJob.get(sameJobKeyOf(l)) || 1,
      customerTotal: Math.max(perCustomer.get(customerKeyOf(l)) || 0, perCustomer.get(`e:${String(l.customerInfo?.email || "").toLowerCase()}`) || 0, 1),
    },
  }));
}

