import mongoose from "mongoose";
import Dustbin from "../../models/Dustbin.js";
import Order from "../../models/Order.js";
import { RENTER_ACTIVE_STATUSES } from "../order/renterStatusGroups.js";

/**
 * Provider equipment inventory for ONE kind of equipment (dumpsters OR porta
 * potties — never mixed), grouped by unit type.
 *
 * - total        approved listings, counted by `quantity` (physical units)
 * - maintenance  units in listings the provider switched off (status "deactive")
 * - onService    units out right now = sum of `quantity` on active jobs
 *                (accepted / dispatched / on the way / on site)
 * - available    total - maintenance - onService (never below 0)
 * - bookings     number of jobs ever booked on that type (cancelled excluded)
 *
 * kind: "dumpster" | "porta-potty"
 */
export async function getProviderInventory(providerId, kind = "dumpster") {
  const pid = new mongoose.Types.ObjectId(String(providerId));
  const wantPorta = kind === "porta-potty" || kind === "porta" || kind === "portapatty";

  const bins = await Dustbin.find({
    user: pid,
    verify: true,
    rejected: { $ne: true },
    ...(wantPorta ? { portaPotty: { $ne: null } } : { $or: [{ portaPotty: null }, { portaPotty: { $exists: false } }] }),
  })
    .select("_id quantity status dumbster portaPotty type")
    .populate("dumbster", "size size_label")
    .populate("portaPotty", "unit_type name title size_label")
    .lean();

  const binIds = bins.map((b) => b._id);
  const orders = binIds.length
    ? await Order.find({ to_id: pid, dustbin: { $in: binIds } })
        .select("dustbin status quantity dumbster")
        .populate("dumbster", "size size_label")
        .lean()
    : [];

  // Listings whose catalog size is missing: borrow the size from their past jobs.
  const sizeFromOrders = new Map();
  orders.forEach((o) => {
    const size = Number(o.dumbster?.size) || 0;
    if (size && !sizeFromOrders.has(String(o.dustbin))) sizeFromOrders.set(String(o.dustbin), size);
  });

  const groupOf = (bin) => {
    if (bin.portaPotty) {
      const c = bin.portaPotty || {};
      const label = c.unit_type || c.name || c.title || c.size_label || "Porta Potty";
      return { key: `porta:${label}`, label, sort: 0, sizeMissing: false };
    }
    const c = bin.dumbster || {};
    const size = Number(c.size) || sizeFromOrders.get(String(bin._id)) || 0;
    if (c.size_label) return { key: `dumpster:${c.size_label}`, label: c.size_label, sort: size || 999, sizeMissing: false };
    if (size) return { key: `dumpster:${size}`, label: `${size} Yard Dumpster`, sort: size, sizeMissing: false };
    return { key: "dumpster:unknown", label: "Dumpster (size not set)", sort: 9999, sizeMissing: true };
  };

  const rows = new Map();
  const groupByBin = new Map();
  bins.forEach((bin) => {
    const g = groupOf(bin);
    groupByBin.set(String(bin._id), g.key);
    if (!rows.has(g.key)) {
      rows.set(g.key, { ...g, kind: wantPorta ? "porta-potty" : "dumpster", total: 0, maintenance: 0, onService: 0, available: 0, bookings: 0, listings: 0 });
    }
    const row = rows.get(g.key);
    const qty = Math.max(0, Number(bin.quantity ?? 1));
    row.total += qty;
    row.listings += 1;
    if (bin.status === "deactive") row.maintenance += qty;
  });

  orders.forEach((o) => {
    const key = groupByBin.get(String(o.dustbin));
    if (!key) return;
    const row = rows.get(key);
    const status = String(o.status || "").toLowerCase();
    if (status !== "cancelled" && status !== "canceled") row.bookings += 1;
    if (RENTER_ACTIVE_STATUSES.includes(status)) row.onService += Math.max(1, Number(o.quantity) || 1);
  });

  const list = Array.from(rows.values())
    .map((r) => {
      const onService = Math.min(r.onService, Math.max(0, r.total - r.maintenance));
      return { ...r, onService, available: Math.max(0, r.total - r.maintenance - onService) };
    })
    .sort((a, b) => a.sort - b.sort || a.label.localeCompare(b.label))
    .map(({ sort, ...r }) => r);

  const summary = list.reduce(
    (acc, r) => ({
      total: acc.total + r.total,
      available: acc.available + r.available,
      onService: acc.onService + r.onService,
      maintenance: acc.maintenance + r.maintenance,
      bookings: acc.bookings + r.bookings,
    }),
    { total: 0, available: 0, onService: 0, maintenance: 0, bookings: 0 },
  );

  const mostBooked = list.reduce((best, r) => (r.bookings > (best?.bookings || 0) ? r : best), null);

  return {
    kind: wantPorta ? "porta-potty" : "dumpster",
    summary,
    rows: list,
    mostBooked: mostBooked ? { label: mostBooked.label, bookings: mostBooked.bookings } : null,
  };
}
