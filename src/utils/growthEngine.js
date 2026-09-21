import GrowthProgramConfig from "../models/GrowthProgramConfig.js";
import OperatorGrowthProfile from "../models/OperatorGrowthProfile.js";
import Order from "../models/Order.js";
import JobEvent from "../models/JobEvent.js";
import User from "../models/user.js";
import Dustbin from "../models/Dustbin.js";
import Dumbster from "../models/Dumbster.js";
import Company from "../models/Company.js";
import logger from "../config/logger.js";

const PACKAGE_RANK = (packages, key) => {
  const idx = packages.findIndex((p) => p.key === key);
  return idx < 0 ? -1 : idx;
};

export function estimateMonthlyPayment(cashPrice, financing = {}) {
  const price = Number(cashPrice) || 0;
  if (price <= 0) return 0;
  if (
    financing.estMonthlyPayment != null &&
    Number(financing.estMonthlyPayment) > 0
  ) {
    return Number(financing.estMonthlyPayment);
  }
  const months = Math.max(1, Number(financing.termMonths) || 36);
  const downPct = Math.min(100, Math.max(0, Number(financing.downPaymentPercent) || 0));
  const principal = price * (1 - downPct / 100);
  const apr = Math.max(0, Number(financing.aprPercent) || 0) / 100;
  if (apr === 0) return Math.round((principal / months) * 100) / 100;
  const r = apr / 12;
  const payment =
    (principal * r * Math.pow(1 + r, months)) / (Math.pow(1 + r, months) - 1);
  return Math.round(payment * 100) / 100;
}

export async function getOrCreateGrowthConfig() {
  let config = await GrowthProgramConfig.findOne({ singletonKey: "default" });
  if (!config) {
    config = await GrowthProgramConfig.create({ singletonKey: "default" });
  }
  return config;
}

function windowStart(windowDays) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - Number(windowDays || 60));
  return d;
}

async function operatorHasBrandedCan(operatorId) {
  const dustbins = await Dustbin.find({
    user: operatorId,
    status: "active",
    dumbster: { $ne: null },
  })
    .select("dumbster")
    .lean();
  if (!dustbins.length) return false;
  const dumbsterIds = dustbins.map((d) => d.dumbster).filter(Boolean);
  const branded = await Dumbster.exists({
    _id: { $in: dumbsterIds },
    branded: true,
  });
  return Boolean(branded);
}

async function docsAreCurrent(operatorId, user) {
  if (user?.driving_license) return true;
  const now = new Date();
  const dustbin = await Dustbin.findOne({
    user: operatorId,
    status: "active",
    $or: [
      { insurance_expiry_date: { $gt: now } },
      { expiry_date: { $gt: now } },
      {
        insurancefile: { $exists: true, $nin: [null, ""] },
        registrationfile: { $exists: true, $nin: [null, ""] },
      },
    ],
  })
    .select("_id")
    .lean();
  return Boolean(dustbin);
}

async function isCommercialEligible(operatorId, user) {
  if (user?.access_types === "company") return true;
  if (user?.company) return true;
  const company = await Company.findOne({ user: operatorId })
    .select("_id status")
    .lean();
  if (!company) return false;
  return String(company.status || "").toLowerCase() === "approved";
}

function sumPenaltyCredits(penaltiesApplied, penaltyValues, since) {
  let total = 0;
  for (const p of penaltiesApplied || []) {
    if (since && p.appliedAt && new Date(p.appliedAt) < since) continue;
    const key = p.type;
    const configured = Number(penaltyValues?.[key]);
    const value =
      p.value != null && !Number.isNaN(Number(p.value))
        ? Number(p.value)
        : configured || 0;
    total += value;
  }
  return total;
}

export function resolvePackageForMetrics({
  packages,
  completedJobs,
  fleetCredits,
  gatePassed,
  commercialEligible,
  lockedPackageKey,
  manualOverride,
}) {
  const sorted = [...(packages || [])].sort(
    (a, b) => a.minJobs - b.minJobs || a.minCredits - b.minCredits,
  );

  if (manualOverride) {
    const overridePkg = sorted.find((p) => p.key === manualOverride);
    if (overridePkg) {
      return computeNext(sorted, overridePkg, completedJobs, fleetCredits);
    }
  }

  let current = sorted[0] || {
    key: "starter",
    label: "Starter",
    minJobs: 0,
    minCredits: 0,
  };

  if (gatePassed) {
    for (const pkg of sorted) {
      if (completedJobs < pkg.minJobs) break;
      if (fleetCredits + 1e-9 < pkg.minCredits) break;
      if (pkg.requiresCommercialEligible && !commercialEligible) break;
      current = pkg;
    }
  }

  if (lockedPackageKey) {
    const lockedRank = PACKAGE_RANK(sorted, lockedPackageKey);
    const currentRank = PACKAGE_RANK(sorted, current.key);
    if (lockedRank > currentRank) {
      const locked = sorted[lockedRank];
      if (locked) current = locked;
    }
  }

  return computeNext(sorted, current, completedJobs, fleetCredits);
}

function computeNext(sorted, current, completedJobs, fleetCredits) {
  const idx = PACKAGE_RANK(sorted, current.key);
  const next = idx >= 0 && idx < sorted.length - 1 ? sorted[idx + 1] : null;
  if (!next) {
    return {
      currentPackageKey: current.key,
      currentPackage: current,
      nextPackage: {
        key: null,
        label: null,
        jobsRemaining: 0,
        creditsRemaining: 0,
        progressPercent: 100,
      },
    };
  }
  const jobsRemaining = Math.max(0, next.minJobs - completedJobs);
  const creditsRemaining = Math.max(
    0,
    Math.ceil((next.minCredits - fleetCredits) * 100) / 100,
  );
  const jobProgress =
    next.minJobs > 0 ? Math.min(1, completedJobs / next.minJobs) : 1;
  const creditProgress =
    next.minCredits > 0 ? Math.min(1, fleetCredits / next.minCredits) : 1;
  const progressPercent = Math.round(
    Math.min(jobProgress, creditProgress) * 100,
  );
  return {
    currentPackageKey: current.key,
    currentPackage: current,
    nextPackage: {
      key: next.key,
      label: next.label,
      jobsRemaining,
      creditsRemaining,
      progressPercent,
    },
  };
}

/**
 * Recompute growth profile for a single operator.
 * @param {string|ObjectId} operatorId
 * @param {{ notify?: boolean, reason?: string }} options
 */
export async function recomputeOperatorGrowth(operatorId, options = {}) {
  // `notify` kept for API compat; tier/gate/milestone never send outbound alerts.
  const { reason = "recompute" } = options;
  if (!operatorId) {
    return { topTier: null, error: "missing_operator" };
  }

  const config = await getOrCreateGrowthConfig();
  const user = await User.findById(operatorId)
    .select(
      "rating accountId_verified driving_license access_types company role status name email fcmtoken",
    )
    .lean();
  if (!user || user.role === "rentee" || user.role === "temp") {
    return null;
  }

  const since = windowStart(config.windowDays);
  const existing = await OperatorGrowthProfile.findOne({
    operator: operatorId,
  });

  const completedOrders = await Order.find({
    to_id: operatorId,
    status: "completed",
    updatedAt: { $gte: since },
  })
    .select("price amount updatedAt")
    .lean();

  const completedJobs60d = completedOrders.length;
  const gmv60d = completedOrders.reduce(
    (sum, o) => sum + (Number(o.price) || Number(o.amount) || 0),
    0,
  );

  const completedEvents = await JobEvent.find({
    operatorId,
    eventType: "JOB_COMPLETED",
    createdAt: { $gte: since },
  })
    .select("onTime")
    .lean();
  const onTimeCount = completedEvents.filter((e) => e.onTime === true).length;
  const onTimeRate =
    completedEvents.length > 0 ? onTimeCount / completedEvents.length : 1;

  const cancelledCount = await Order.countDocuments({
    to_id: operatorId,
    status: "cancelled",
    updatedAt: { $gte: since },
  });
  const denom = completedJobs60d + cancelledCount;
  const cancellationRate = denom > 0 ? cancelledCount / denom : 0;

  const stripeVerified = Boolean(user.accountId_verified);
  const docsCurrent = await docsAreCurrent(operatorId, user);
  const commercialEligible = await isCommercialEligible(operatorId, user);
  const hasBrandedCan = await operatorHasBrandedCan(operatorId);

  const gateCfg = config.qualityGate || {};
  const failures = [];
  if ((Number(user.rating) || 0) < (gateCfg.minRating ?? 4.5)) {
    failures.push("rating");
  }
  if (onTimeRate < (gateCfg.minOnTimeRate ?? 0.9)) {
    failures.push("onTimeRate");
  }
  if (cancellationRate > (gateCfg.maxCancellationRate ?? 0.1)) {
    failures.push("cancellationRate");
  }
  if (gateCfg.requireStripeVerified !== false && !stripeVerified) {
    failures.push("stripeVerified");
  }
  if (gateCfg.requireDocsCurrent !== false && !docsCurrent) {
    failures.push("docsCurrent");
  }
  const gatePassed = failures.length === 0;

  let rawCredits = gmv60d / (Number(config.gmvDivisor) || 5000);
  if (hasBrandedCan) {
    rawCredits *= Number(config.brandedMultiplier) || 1.1;
  }
  const penaltyTotal = sumPenaltyCredits(
    existing?.penaltiesApplied,
    config.penalties,
    since,
  );
  const fleetCredits = Math.max(
    0,
    Math.round((rawCredits - penaltyTotal) * 1000) / 1000,
  );

  const lockedUntil = existing?.qualificationLockedUntil
    ? new Date(existing.qualificationLockedUntil)
    : null;
  const isLocked = lockedUntil && lockedUntil > new Date();
  const lockedPackageKey = isLocked
    ? existing.manualPackageOverride || existing.currentPackageKey
    : null;

  const resolved = resolvePackageForMetrics({
    packages: config.packages,
    completedJobs: completedJobs60d,
    fleetCredits,
    gatePassed,
    commercialEligible,
    lockedPackageKey: isLocked ? lockedPackageKey : null,
    manualOverride:
      isLocked && existing?.manualPackageOverride
        ? existing.manualPackageOverride
        : null,
  });

  const previousKey =
    existing?.currentPackageKey || existing?.previousPackageKey || null;
  const qualityGate = {
    rating: Number(user.rating) || 0,
    onTimeRate: Math.round(onTimeRate * 1000) / 1000,
    cancellationRate: Math.round(cancellationRate * 1000) / 1000,
    stripeVerified,
    docsCurrent,
    commercialEligible,
    hasBrandedCan,
    passed: gatePassed,
    failures,
  };

  const profile = await OperatorGrowthProfile.findOneAndUpdate(
    { operator: operatorId },
    {
      $set: {
        completedJobs60d,
        gmv60d: Math.round(gmv60d * 100) / 100,
        fleetCredits,
        qualityGate,
        currentPackageKey: resolved.currentPackageKey,
        nextPackage: resolved.nextPackage,
        previousPackageKey: previousKey,
        computedAt: new Date(),
      },
      $setOnInsert: {
        operator: operatorId,
        penaltiesApplied: [],
      },
    },
    { upsert: true, new: true },
  );

  // Tier / gate / milestone: silent bookkeeping only (no email/push/in-app).
  await maybeNotifyTierChanges({
    operatorId,
    nextPackage: resolved.nextPackage,
    milestonePercent: config.milestonePercent || 80,
    existing,
  });

  logger.info("growth.recompute", {
    operatorId: operatorId.toString(),
    reason,
    package: resolved.currentPackageKey,
    fleetCredits,
    gatePassed,
  });

  return {
    profile,
    config,
    currentPackage: resolved.currentPackage,
    nextPackage: resolved.nextPackage,
  };
}

/**
 * Growth eligibility / tier / gate status is shown only when the operator
 * opens Growth in the app. Cron + order/rating recompute must never send
 * email, push, or in-app notifications for these events (old app builds
 * still receive FCM and would confuse users who never opted into Growth).
 */
async function maybeNotifyTierChanges({
  operatorId,
  nextPackage,
  milestonePercent,
  existing,
}) {
  // Keep silent milestone bookkeeping for analytics only — no notify.
  const progress = nextPackage?.progressPercent || 0;
  const already = existing?.milestoneNotifiedAtPercent || 0;
  if (
    nextPackage?.key &&
    progress >= milestonePercent &&
    already < milestonePercent
  ) {
    await OperatorGrowthProfile.updateOne(
      { operator: operatorId },
      { $set: { milestoneNotifiedAtPercent: milestonePercent } },
    );
  } else if (progress < milestonePercent && already >= milestonePercent) {
    await OperatorGrowthProfile.updateOne(
      { operator: operatorId },
      { $set: { milestoneNotifiedAtPercent: 0 } },
    );
  }
}

/**
 * Append a penalty and recompute.
 */
export async function applyGrowthPenalty(
  operatorId,
  { type, orderId = null, note = "", value = null, source = "system" },
) {
  const config = await getOrCreateGrowthConfig();
  const resolvedValue =
    value != null ? Number(value) : Number(config.penalties?.[type]) || 0;

  await OperatorGrowthProfile.findOneAndUpdate(
    { operator: operatorId },
    {
      $push: {
        penaltiesApplied: {
          type,
          value: resolvedValue,
          orderId,
          note,
          source,
          appliedAt: new Date(),
        },
      },
      $setOnInsert: { operator: operatorId },
    },
    { upsert: true },
  );

  const result = await recomputeOperatorGrowth(operatorId, {
    notify: false,
    reason: `penalty:${type}`,
  });

  // No email/push/in-app for penalties — credits update is visible in Growth UI.
  return result
    ? {
        ...result,
        penalty: {
          type,
          value: resolvedValue,
          note,
          source,
          appliedAt: new Date(),
        },
      }
    : {
        penalty: {
          type,
          value: resolvedValue,
          note,
          source,
          appliedAt: new Date(),
        },
      };
}

/**
 * Remove a previously applied penalty by subdocument id, then recompute credits.
 */
export async function removeGrowthPenalty(
  operatorId,
  { penaltyId, reason = "", source = "admin" },
) {
  if (!penaltyId) {
    throw new Error("penaltyId is required");
  }

  const profile = await OperatorGrowthProfile.findOne({ operator: operatorId });
  if (!profile) {
    throw new Error("Operator growth profile not found");
  }

  const subdoc =
    profile.penaltiesApplied?.id?.(penaltyId) ||
    (profile.penaltiesApplied || []).find(
      (p) => String(p._id) === String(penaltyId),
    );

  if (!subdoc) {
    throw new Error("Penalty not found on this operator");
  }

  const removed = {
    _id: subdoc._id,
    type: subdoc.type,
    value: subdoc.value,
    note: subdoc.note || "",
    source: subdoc.source || "system",
    appliedAt: subdoc.appliedAt,
  };

  if (typeof subdoc.deleteOne === "function") {
    subdoc.deleteOne();
  } else {
    profile.penaltiesApplied = (profile.penaltiesApplied || []).filter(
      (p) => String(p._id) !== String(penaltyId),
    );
  }

  await profile.save();

  const result = await recomputeOperatorGrowth(operatorId, {
    notify: false,
    reason: `penalty_removed:${removed.type || penaltyId}`,
  });

  // No email/push/in-app for penalty removal — visible in Growth UI only.
  return result
    ? { ...result, removedPenalty: removed, removeReason: reason || "" }
    : { removedPenalty: removed, removeReason: reason || "" };
}

/**
 * Daily cron: recompute all active renters.
 */
export async function recomputeAllOperatorGrowth({ notify = false } = {}) {
  const operators = await User.find({
    role: "renter",
    status: { $in: ["online", "offline", "approved", "active"] },
  })
    .select("_id")
    .lean();

  let ok = 0;
  let fail = 0;
  for (const op of operators) {
    try {
      await recomputeOperatorGrowth(op._id, {
        notify,
        reason: "daily_cron",
      });
      ok += 1;
    } catch (err) {
      fail += 1;
      logger.error("growth.daily_recompute_failed", {
        operatorId: op._id?.toString(),
        error: err?.message,
      });
    }
  }
  return { ok, fail, total: operators.length };
}

/**
 * Whether an operator should get branded-can dispatch boost.
 */
export async function operatorHasBrandedDispatchBoost(operatorId) {
  if (!operatorId) return false;
  const profile = await OperatorGrowthProfile.findOne({ operator: operatorId })
    .select("qualityGate")
    .lean();
  if (!profile?.qualityGate?.passed) return false;
  return operatorHasBrandedCan(operatorId);
}

export async function mapBrandedBoostForOperators(operatorIds = []) {
  const map = new Map();
  if (!operatorIds.length) return map;

  const profiles = await OperatorGrowthProfile.find({
    operator: { $in: operatorIds },
    "qualityGate.passed": true,
  })
    .select("operator qualityGate.hasBrandedCan")
    .lean();

  const passedIds = profiles.map((p) => p.operator.toString());
  if (!passedIds.length) {
    for (const id of operatorIds) map.set(id.toString(), false);
    return map;
  }

  // Prefer profile flag if fresh; also verify branded inventory
  const dustbins = await Dustbin.find({
    user: { $in: passedIds },
    status: "active",
    dumbster: { $ne: null },
  })
    .select("user dumbster")
    .lean();

  const dumbsterIds = [...new Set(dustbins.map((d) => String(d.dumbster)))];
  const brandedDumbsters = await Dumbster.find({
    _id: { $in: dumbsterIds },
    branded: true,
  })
    .select("_id")
    .lean();
  const brandedSet = new Set(brandedDumbsters.map((d) => String(d._id)));

  const boostUsers = new Set();
  for (const d of dustbins) {
    if (brandedSet.has(String(d.dumbster))) {
      boostUsers.add(String(d.user));
    }
  }

  for (const id of operatorIds) {
    map.set(id.toString(), boostUsers.has(id.toString()));
  }
  return map;
}
