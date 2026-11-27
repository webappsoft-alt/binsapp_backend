import mongoose from "mongoose";
import Dustbin from "../models/Dustbin.js";
import JunkRemoval from "../models/JunkRemoval.js";
import User from "../models/User.js";

export const ACTIVE_VERIFIED_DUMPSTER_FILTER = {
  verify: true,
  rejected: false,
  status: "active",
  $or: [{ portaPotty: null }, { portaPotty: { $exists: false } }],
};

function cleanUrl(value) {
  if (typeof value !== "string") return "";
  return value.trim();
}

/**
 * Resolve an actual uploaded insurance file URL (excludes bare `isInsured` flags).
 */
export function resolveUploadedInsuranceFile(
  user,
  { junkProfile = null, treeProfile = null, binInsuranceFile = null } = {},
) {
  const candidates = [
    user?.insuranceFile,
    user?.insurancefile,
    user?.insurance,
    user?.insurance_file,
    user?.coi,
    user?.COI,
    junkProfile?.COI,
    junkProfile?.coi,
    treeProfile?.COI,
    treeProfile?.coi,
    binInsuranceFile,
  ];
  for (const candidate of candidates) {
    const url = cleanUrl(candidate);
    if (url) return url;
  }
  return null;
}

/**
 * Evaluate Junk Removal eligibility consistently across dispatch, portal, and admin:
 * - Rejected or pending junk applications stay locked until reviewed/approved.
 * - Approved junk applications require an uploaded COI / insurance file.
 * - Dumpster owners without a separate junk application qualify only when they
 *   have BOTH at least one active verified dumpster bin AND an uploaded insurance file.
 */
export function evaluateJunkEligibility({
  user = null,
  junkProfile = null,
  treeProfile = null,
  activeBinsCount = null,
  binInsuranceFile = null,
} = {}) {
  const resolvedJunk =
    junkProfile ||
    (user?.junkRemoval && typeof user.junkRemoval === "object"
      ? user.junkRemoval
      : null);
  const resolvedTree =
    treeProfile ||
    (user?.treeRemoval && typeof user.treeRemoval === "object"
      ? user.treeRemoval
      : null);

  const rawStatus = String(resolvedJunk?.status || "").toLowerCase().trim();
  const isRejected = Boolean(resolvedJunk && rawStatus === "rejected");
  const isPending = Boolean(resolvedJunk && rawStatus === "pending");
  const hasApprovedJunkProfile = Boolean(
    resolvedJunk &&
      (resolvedJunk.approved === true ||
        ["approved", "active", "verified"].includes(rawStatus)),
  );

  const insuranceFile = resolveUploadedInsuranceFile(user, {
    junkProfile: resolvedJunk,
    treeProfile: resolvedTree,
    binInsuranceFile: binInsuranceFile ?? user?.binInsuranceFile ?? null,
  });
  const hasInsuranceFile = Boolean(insuranceFile);

  const resolvedBinsCount = Number(
    activeBinsCount ?? user?.activeVerifiedBinsCount ?? user?.verifyCount ?? 0,
  );
  const safeBinsCount = Number.isFinite(resolvedBinsCount)
    ? Math.max(0, resolvedBinsCount)
    : 0;
  const hasActiveBins = safeBinsCount > 0;

  let eligible = false;
  let status = "not_eligible";
  let reason = "missing_bins_and_insurance";

  if (isRejected) {
    eligible = false;
    status = "rejected";
    reason = "rejected";
  } else if (isPending) {
    eligible = false;
    status = "pending";
    reason = "pending";
  } else if (hasApprovedJunkProfile) {
    if (hasInsuranceFile) {
      eligible = true;
      status = "approved";
      reason = "approved_application";
    } else {
      eligible = false;
      status = "not_eligible";
      reason = "missing_insurance_file";
    }
  } else if (hasActiveBins && hasInsuranceFile) {
    eligible = true;
    status = "auto_eligible";
    reason = "active_bins_and_insurance";
  } else if (!hasActiveBins && !hasInsuranceFile) {
    reason = "missing_bins_and_insurance";
  } else if (!hasActiveBins) {
    reason = "missing_active_bins";
  } else {
    reason = "missing_insurance_file";
  }

  return {
    eligible,
    status,
    reason,
    hasActiveBins,
    activeBinsCount: safeBinsCount,
    hasInsuranceFile,
    insuranceFile,
    hasApprovedJunkProfile,
  };
}

/**
 * Batch-query active verified dumpster counts and bin-level insurance files.
 */
export async function getOperatorBinMetricsMap(userIds = []) {
  const objectIds = userIds
    .map((id) => {
      try {
        return id ? new mongoose.Types.ObjectId(String(id)) : null;
      } catch {
        return null;
      }
    })
    .filter(Boolean);

  const map = new Map();
  if (objectIds.length === 0) return map;

  const rows = await Dustbin.aggregate([
    {
      $match: {
        user: { $in: objectIds },
        ...ACTIVE_VERIFIED_DUMPSTER_FILTER,
      },
    },
    {
      $group: {
        _id: "$user",
        activeBinsCount: { $sum: 1 },
        binInsuranceFile: {
          $max: {
            $cond: [
              {
                $and: [
                  { $ne: ["$insurancefile", null] },
                  { $ne: ["$insurancefile", ""] },
                ],
              },
              "$insurancefile",
              null,
            ],
          },
        },
      },
    },
  ]);

  for (const row of rows) {
    map.set(String(row._id), {
      activeBinsCount: Number(row.activeBinsCount || 0),
      binInsuranceFile: cleanUrl(row.binInsuranceFile) || null,
    });
  }
  return map;
}

/**
 * Live DB check for a single operator's junk removal eligibility.
 */
export async function getOperatorJunkEligibility(
  userOrId,
  { junkProfile = null, treeProfile = null } = {},
) {
  let user =
    userOrId && typeof userOrId === "object" && userOrId._id
      ? userOrId
      : null;

  const userId = user?._id || userOrId;
  if (!user && userId) {
    user = await User.findById(userId)
      .select("role type isInsured insuranceFile verifyCount junkRemoval treeRemoval")
      .populate("junkRemoval treeRemoval")
      .lean();
  }

  if (!userId) {
    return evaluateJunkEligibility({});
  }

  let resolvedJunk = junkProfile;
  if (!resolvedJunk) {
    if (user?.junkRemoval && typeof user.junkRemoval === "object" && user.junkRemoval.status) {
      resolvedJunk = user.junkRemoval;
    } else if (user?.junkRemoval) {
      resolvedJunk = await JunkRemoval.findById(user.junkRemoval).lean();
    } else {
      resolvedJunk = await JunkRemoval.findOne({ userId }).lean();
    }
  }

  const metricsMap = await getOperatorBinMetricsMap([userId]);
  const metrics = metricsMap.get(String(userId)) || {
    activeBinsCount: 0,
    binInsuranceFile: null,
  };

  return evaluateJunkEligibility({
    user,
    junkProfile: resolvedJunk,
    treeProfile,
    activeBinsCount: metrics.activeBinsCount,
    binInsuranceFile: metrics.binInsuranceFile,
  });
}

/**
 * Hydrate an array of user objects/documents with live `activeVerifiedBinsCount`,
 * `hasInsuranceFile`, `insuranceFileUrl`, and `junkEligibility`.
 */
export async function hydrateOperatorsJunkEligibility(users = []) {
  if (!Array.isArray(users) || users.length === 0) return users;
  const userIds = users.map((u) => u?._id).filter(Boolean);
  const metricsMap = await getOperatorBinMetricsMap(userIds);

  return users.map((entry) => {
    const obj = entry?.toObject ? entry.toObject() : { ...entry };
    const uid = String(obj._id || "");
    const metrics = metricsMap.get(uid) || {
      activeBinsCount: 0,
      binInsuranceFile: null,
    };
    const junkEligibility = evaluateJunkEligibility({
      user: obj,
      activeBinsCount: metrics.activeBinsCount,
      binInsuranceFile: metrics.binInsuranceFile,
    });
    return {
      ...obj,
      activeVerifiedBinsCount: metrics.activeBinsCount,
      binInsuranceFile: metrics.binInsuranceFile,
      hasInsuranceFile: junkEligibility.hasInsuranceFile,
      insuranceFileUrl: junkEligibility.insuranceFile,
      junkEligibility,
    };
  });
}
