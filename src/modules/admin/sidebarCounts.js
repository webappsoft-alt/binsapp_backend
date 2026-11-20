/**
 * Admin sidebar counts — one request instead of ~20.
 *
 * GET /api/admin/sidebar-counts returns every badge the admin sidebar shows.
 * It runs the existing count endpoints in-process (localhost, same auth), so
 * the numbers are exactly what each list page reports — no duplicated query logic.
 *
 * Real time: after any successful write (non-GET /api request) or a
 * state-changing socket event, a debounced job recomputes the counts and emits
 * `admin:sidebar-counts` to every connected admin (room `user_<adminId>`).
 */
import jwt from "jsonwebtoken";
import config from "../../config/env.js";
import User from "../../models/User.js";
import logger from "../../config/logger.js";

const INTERNAL_UA = "bins-admin-sidebar-counts/1.0";
const BROADCAST_DEBOUNCE_MS = 1500;

const baseUrl = () => `http://127.0.0.1:${config.get("port")}/api`;

async function getJson(path, authHeader) {
  try {
    const res = await fetch(`${baseUrl()}${path}`, {
      headers: { Authorization: authHeader, "User-Agent": INTERNAL_UA, Accept: "application/json" },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const pageTotal = (body) => {
  const p = body?.data ?? body;
  return num(p?.pagination?.total ?? p?.total);
};

/** Compute every sidebar count for one admin. `authHeader` is "Bearer <token>". */
export async function collectSidebarCounts(authHeader, adminId) {
  const enc = encodeURIComponent;
  const [
    bins,
    conversations,
    tree,
    junk,
    companies,
    leads,
    salesLeads,
    finPending,
    finReview,
    offerOpen,
    offerAdjust,
    offerPartial,
    orders,
    estimates,
    financials,
    support,
    reviews,
    manual,
  ] = await Promise.all([
    getJson(`/bin/admin/check-bin`, authHeader),
    adminId ? getJson(`/conversations/${adminId}?page=1&limit=1`, authHeader) : null,
    getJson(`/admin/get-all-tree-removal?page=1&limit=1`, authHeader),
    getJson(`/admin/get-all-junk-removal?page=1&limit=1`, authHeader),
    getJson(`/company/admin?page=1&limit=1`, authHeader),
    getJson(`/admin/leads?page=1&limit=1`, authHeader),
    getJson(`/admin/sales-agent/leads?page=1&limit=1`, authHeader),
    getJson(`/admin/growth/applications?page=1&limit=1&status=pending`, authHeader),
    getJson(`/admin/growth/applications?page=1&limit=1&status=in_review`, authHeader),
    getJson(`/admin/builder-offers?page=1&limit=1&status=open`, authHeader),
    getJson(`/admin/builder-offers?page=1&limit=1&status=needs_adjustment`, authHeader),
    getJson(`/admin/builder-offers?page=1&limit=1&status=partially_fulfilled`, authHeader),
    getJson(`/order/admin?page=1&limit=1&status=pending`, authHeader),
    getJson(`/admin/provider-estimates?page=1&limit=1`, authHeader),
    getJson(`/admin/financials/payments?page=1&limit=1`, authHeader),
    getJson(`/support/?page=1&limit=1`, authHeader),
    getJson(`/public-reviews?page=1&limit=1`, authHeader),
    getJson(`/admin/admin-manual-review-requests?page=1&limit=1`, authHeader),
  ]);

  const leadPayload = leads?.data ?? leads;
  const leadStats = leadPayload?.stats || {};
  const salesStats = salesLeads?.stats ?? salesLeads?.data?.stats ?? {};
  const companyPayload = companies?.data;
  const companyStats = companyPayload?.stats || companyPayload?.data?.stats || companyPayload?.pagination?.stats || {};
  const estStats = estimates?.data?.stats || {};
  const finCounts = (financials?.data || financials)?.summary?.counts || {};

  // Manual review stats come back per service type.
  const manualStats = manual?.data?.stats ?? manual?.stats;
  const manualPending = (match) => {
    if (!manualStats) return 0;
    const list = Array.isArray(manualStats) ? manualStats : [manualStats];
    return list
      .filter((s) => String(s?.service_type || "").toLowerCase().includes(match))
      .reduce((sum, s) => sum + num(s?.pending), 0);
  };

  const finPendingTotal = pageTotal(finPending);
  const finReviewTotal = pageTotal(finReview);
  const offers = [pageTotal(offerOpen), pageTotal(offerAdjust), pageTotal(offerPartial)];

  return {
    bins: bins?.data || bins || {},
    unreadMessages: num(conversations?.totalUnreadCount),
    treeRemoval: tree?.data?.stats || {},
    junkRemoval: junk?.data?.stats || {},
    companies: {
      total: num(companyStats.total),
      pending: num(companyStats.pending),
      approved: num(companyStats.approved),
      rejected: num(companyStats.rejected),
    },
    leads: {
      total: num(leadStats.total) || num(leadPayload?.total),
      new: num(leadStats.new),
      contacted: num(leadStats.contacted),
      converted: num(leadStats.converted),
    },
    salesLeads: {
      total: num(salesStats.total) || num(salesLeads?.pagination?.total ?? salesLeads?.total),
      new: num(salesStats.new),
      active: num(salesStats.active),
      handedOff: num(salesStats.handedOff),
      hot: num(salesStats.hot),
      warm: num(salesStats.warm),
      commercial: num(salesStats.commercial),
      abandoned: num(salesStats.abandoned),
      converted: num(salesStats.converted),
      rejected: num(salesStats.rejected),
    },
    financing: { pending: finPendingTotal, in_review: finReviewTotal, unseen: finPendingTotal + finReviewTotal },
    builderOffers: {
      open: offers[0],
      needs_adjustment: offers[1],
      partially_fulfilled: offers[2],
      unseen: offers[0] + offers[1] + offers[2],
    },
    orders: { pending: num(orders?.data?.total ?? orders?.total) },
    estimates: {
      pending: num(estStats.pending),
      estimateSent: num(estStats.estimateSent),
      accepted: num(estStats.accepted),
    },
    financials: {
      onHold: num(finCounts.on_hold),
      inProcess: num(finCounts.in_process),
      released: num(finCounts.released),
    },
    // Badge = open tickets (check-bin reports them); all-time total kept for reference.
    support: {
      total: num(bins?.data?.totalPendingSupports ?? bins?.totalPendingSupports),
      allTime: num(support?.data?.totalCount ?? support?.total ?? support?.count),
    },
    reviews: { total: pageTotal(reviews) },
    manualReviews: { tree: manualPending("tree"), junk: manualPending("junk") },
    generatedAt: new Date().toISOString(),
  };
}

/** GET /api/admin/sidebar-counts */
export async function getSidebarCounts(req, res) {
  try {
    const counts = await collectSidebarCounts(req.headers.authorization, req.user?._id?.toString());
    return res.status(200).json({ success: true, data: counts });
  } catch (error) {
    logger.error("getSidebarCounts error:", error);
    return res.status(500).json({ success: false, message: "Failed to load sidebar counts" });
  }
}

/**
 * GET /api/admin/dashboard-summary?startDate=&endDate=
 * One request for the dashboard: KPIs, user + dumpster graphs and the reports
 * summary (previously four separate calls). Same in-process approach as above.
 */
export async function getDashboardSummary(req, res) {
  try {
    const auth = req.headers.authorization;
    const { startDate = "", endDate = "" } = req.query || {};
    const dateParams = `startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`;
    const [overview, usersGraph, dumpstersGraph, reports] = await Promise.all([
      getJson(`/admin/dashboard?${dateParams}`, auth),
      getJson(`/admin/get-dashboard-users-graph-data?${dateParams}`, auth),
      getJson(`/admin/get-dashboard-dumpsters-graph-data?${dateParams}`, auth),
      getJson(`/admin/reports?timeRange=all&limit=5`, auth),
    ]);
    return res.status(200).json({
      success: true,
      data: {
        overview: overview?.success ? overview.data || {} : {},
        usersGraph: usersGraph?.data || [],
        dumpstersGraph: dumpstersGraph?.data || [],
        reports: reports?.success ? reports.data : null,
      },
    });
  } catch (error) {
    logger.error("getDashboardSummary error:", error);
    return res.status(500).json({ success: false, message: "Failed to load dashboard" });
  }
}

/* ── Real-time broadcast ─────────────────────────────────────────────── */

let ioRef = null;
let timer = null;
let running = false;
let pendingRun = false;

/** Called once from initSocket so this module can emit without importing socket.js. */
export function registerSidebarCountsIO(io) {
  ioRef = io;
}

async function broadcastNow() {
  if (!ioRef) return;
  if (running) {
    pendingRun = true;
    return;
  }
  running = true;
  try {
    const secret = config.get("jwtSecret");
    const admins = await User.find({ $or: [{ type: "admin" }, { role: "admin" }] }).select("_id").lean();
    for (const admin of admins) {
      const room = `user_${admin._id}`;
      // Only compute for admins that are actually connected.
      if (!ioRef.sockets.adapter.rooms.get(room)?.size) continue;
      const token = jwt.sign({ _id: admin._id.toString() }, secret, { expiresIn: "2m" });
      const counts = await collectSidebarCounts(`Bearer ${token}`, admin._id.toString());
      ioRef.to(room).emit("admin:sidebar-counts", counts);
    }
  } catch (error) {
    logger.error("sidebar counts broadcast error:", error);
  } finally {
    running = false;
    if (pendingRun) {
      pendingRun = false;
      scheduleSidebarCountsBroadcast();
    }
  }
}

/** Debounced: many writes in a burst produce one recompute. */
export function scheduleSidebarCountsBroadcast() {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    broadcastNow();
  }, BROADCAST_DEBOUNCE_MS);
}

/**
 * Express middleware: after any successful write to the API, refresh the sidebar
 * counts for connected admins. Internal count requests are GETs, so no loops.
 */
export function sidebarCountsWriteHook(req, res, next) {
  if (req.method !== "GET" && req.method !== "OPTIONS" && req.method !== "HEAD") {
    res.on("finish", () => {
      if (res.statusCode < 400) scheduleSidebarCountsBroadcast();
    });
  }
  next();
}

/** Socket events that change something the sidebar counts (orders, chats, approvals, requests…). */
const COUNT_EVENT_RE = /order|request|message|chat|approve|reject|status|lead|estimate|support|review|bin|company|cancel|accept|assign/i;
const IGNORE_EVENT_RE = /location|typing|ping|pong|seen|read|join|leave|track/i;

export function isCountChangingSocketEvent(event) {
  return COUNT_EVENT_RE.test(event) && !IGNORE_EVENT_RE.test(event);
}
