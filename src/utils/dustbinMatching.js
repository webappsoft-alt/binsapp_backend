import mongoose from "mongoose";
import Dustbin from "../models/Dustbin.js";
import Company from "../models/Company.js";
import Tier from "../models/Tier.js";

const MILES_TO_METERS = 1609.344;
const MAX_PLATFORM_RADIUS_MILES = 100;
const DEFAULT_MAX_TIER = 5;

/**
 * Resolve preferred starting tier for company bookings.
 *
 * - Explicit Company.minOperatorTier → start cascade there (priority).
 * - Company with no override → start at platform highest tier (5→4→…).
 * - No companyId (consumer) → no cascade; all eligible owners.
 */
export async function resolveCompanyTopTier(companyId) {
  if (!companyId) {
    return {
      topTier: 1,
      tiersConfigured: false,
      cascade: false,
      source: "none",
    };
  }

  const company = await Company.findById(companyId)
    .select("minOperatorTier")
    .lean();

  if (company?.minOperatorTier != null && Number(company.minOperatorTier) > 0) {
    return {
      topTier: Number(company.minOperatorTier),
      tiersConfigured: true,
      cascade: true,
      source: "company_override",
    };
  }

  const tierList = await Tier.find().sort({ level: -1 }).limit(1).lean();
  const highest = tierList.length
    ? Number(tierList[0].level)
    : DEFAULT_MAX_TIER;

  return {
    topTier: highest,
    tiersConfigured: true,
    cascade: true,
    source: "platform_cascade",
  };
}

/**
 * Build descending tier ladder: startTier → … → 1, then "unset".
 * Example: start 5 → [5,4,3,2,1,"unset"]
 * Example: company min 3 → [3,2,1,"unset"]
 */
export function buildTierCascadeLadder(startTier) {
  const start = Math.min(DEFAULT_MAX_TIER, Math.max(1, Number(startTier) || 1));
  const ladder = [];
  for (let t = start; t >= 1; t -= 1) ladder.push(t);
  ladder.push("unset");
  return ladder;
}

function effectiveOperatorTier(user) {
  const raw = user?.operatorStats?.tier;
  if (raw == null || raw === "" || Number(raw) === 0) return "unset";
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return "unset";
  return n;
}

/**
 * Prefer the highest tier band that has at least one owner.
 * Stops at the first non-empty band (e.g. finds a tier-4 → do not open tier-3).
 */
export function selectBestTierBand(dustbins, startTier) {
  const ladder = buildTierCascadeLadder(startTier);
  for (const band of ladder) {
    const matched = dustbins.filter(
      (d) => effectiveOperatorTier(d?.user) === band,
    );
    if (matched.length > 0) {
      return {
        dustbins: matched,
        matchedTier: band,
        cascadedFrom: ladder[0],
        ladder,
      };
    }
  }
  return {
    dustbins: [],
    matchedTier: null,
    cascadedFrom: ladder[0],
    ladder,
  };
}

export function buildDustbinMatchQuery({
  serviceQuery,
  start_date,
  end_date,
  requestedQuantity,
}) {
  // Real remaining capacity is derived from total `quantity` minus the units
  // reserved by bookings that overlap the requested range. We intentionally do
  // NOT trust the `availableQuantity` counter: it defaults to 1 (not `quantity`),
  // is unset on older records, and drifts out of sync — which caused valid
  // dumpsters (e.g. quantity 12) to be hidden. `bookings` is the source of truth
  // (entries are removed on completion/cancellation).
  const bookedInRange =
    start_date && end_date
      ? {
          $sum: {
            $map: {
              input: {
                $filter: {
                  input: { $ifNull: ["$bookings", []] },
                  as: "b",
                  cond: {
                    $and: [
                      { $lte: ["$$b.startDate", new Date(end_date)] },
                      { $gte: ["$$b.endDate", new Date(start_date)] },
                    ],
                  },
                },
              },
              as: "ob",
              in: { $ifNull: ["$$ob.quantity", 1] },
            },
          },
        }
      : 0;

  const query = {
    verify: true,
    status: "active",
    $expr: {
      $gte: [
        { $subtract: [{ $ifNull: ["$quantity", 1] }, bookedInRange] },
        requestedQuantity,
      ],
    },
    $or: [
      {
        "location.coordinates.0": { $exists: true },
        "location.coordinates.1": { $exists: true },
      },
      {
        "locationObject.coordinates.0": { $exists: true },
        "locationObject.coordinates.1": { $exists: true },
      },
    ],
    ...serviceQuery,
  };

  return query;
}

export function buildDustbinProviderPipeline({
  dustbinMatchQuery,
  customerLatRad,
  customerLonRad,
}) {
  // Tier preference is applied in JS after geo match (cascade), not as a
  // hard Mongo $gte filter — so lower tiers remain bookable when higher
  // tiers have zero coverage.
  //
  // Service radius uses the provider profile radius first (set in Account),
  // then the dustbin listing radius, then the 40-mile default — capped by
  // MAX_PLATFORM_RADIUS_MILES.
  return [
    { $match: dustbinMatchQuery },
    {
      $addFields: {
        providerCoordinates: {
          $cond: {
            if: {
              $and: [
                { $isArray: "$location.coordinates" },
                {
                  $gte: [
                    { $size: { $ifNull: ["$location.coordinates", []] } },
                    2,
                  ],
                },
              ],
            },
            then: "$location.coordinates",
            else: "$locationObject.coordinates",
          },
        },
      },
    },
    {
      $addFields: {
        distanceInMeters: {
          $let: {
            vars: {
              lat1: {
                $degreesToRadians: {
                  $arrayElemAt: ["$providerCoordinates", 1],
                },
              },
              lon1: {
                $degreesToRadians: {
                  $arrayElemAt: ["$providerCoordinates", 0],
                },
              },
              lat2: customerLatRad,
              lon2: customerLonRad,
            },
            in: {
              $multiply: [
                6371000,
                {
                  $acos: {
                    $min: [
                      1,
                      {
                        $add: [
                          {
                            $multiply: [{ $sin: "$$lat1" }, { $sin: "$$lat2" }],
                          },
                          {
                            $multiply: [
                              { $cos: "$$lat1" },
                              { $cos: "$$lat2" },
                              {
                                $cos: {
                                  $subtract: ["$$lon2", "$$lon1"],
                                },
                              },
                            ],
                          },
                        ],
                      },
                    ],
                  },
                },
              ],
            },
          },
        },
      },
    },
    {
      $lookup: {
        from: "users",
        localField: "user",
        foreignField: "_id",
        as: "user",
      },
    },
    { $unwind: "$user" },
    {
      $match: {
        "user.status": { $nin: ["deleted", "deactivated"] },
      },
    },
    {
      $addFields: {
        // Profile radius (Account setting) wins over dustbin.radius.
        serviceRadiusMiles: {
          $ifNull: [
            "$user.radius",
            { $ifNull: ["$radius", 40] },
          ],
        },
      },
    },
    {
      $addFields: {
        serviceRadiusMeters: {
          $multiply: ["$serviceRadiusMiles", MILES_TO_METERS],
        },
      },
    },
    {
      $match: {
        $expr: {
          $and: [
            { $lte: ["$distanceInMeters", "$serviceRadiusMeters"] },
            {
              $lte: [
                "$distanceInMeters",
                MAX_PLATFORM_RADIUS_MILES * MILES_TO_METERS,
              ],
            },
          ],
        },
      },
    },
    {
      $project: {
        document: "$$ROOT",
        _id: 1,
        distanceInMeters: 1,
        serviceRadiusMiles: 1,
        "user.status": 1,
        "user.fcmtoken": 1,
        "user.email": 1,
        "user._id": 1,
        "user.radius": 1,
        "user.operatorStats": 1,
      },
    },
    {
      $replaceRoot: {
        newRoot: {
          $mergeObjects: ["$document", { user: "$user" }],
        },
      },
    },
  ];
}

export function collectProvidersFromDustbins(
  dustbins,
  { onlineOnly = false } = {},
) {
  const uniqueUsersMap = new Map();

  for (const item of dustbins) {
    const user = item?.user;
    if (!user || user.status === "deleted" || user.status === "deactivated") {
      continue;
    }
    if (onlineOnly && user.status !== "online") {
      continue;
    }

    const userId = user._id.toString();
    if (!uniqueUsersMap.has(userId)) {
      uniqueUsersMap.set(userId, {
        userId,
        fcmtoken: user.fcmtoken,
        email: user.email || "",
        status: user.status,
        operatorTier: user.operatorStats?.tier || 1,
        dustbinIds: [],
      });
    }
    uniqueUsersMap.get(userId).dustbinIds.push(item._id.toString());
  }

  return Array.from(uniqueUsersMap.values());
}

export async function findNearbyDustbinProviders({
  serviceQuery,
  start_date,
  end_date,
  quantity = 1,
  latitude,
  longitude,
  companyId,
  topTier,
  cascade,
  onlineOnly = false,
}) {
  const requestedQuantity = Number(quantity) > 0 ? Number(quantity) : 1;
  const customerLatRad = (latitude * Math.PI) / 180;
  const customerLonRad = (longitude * Math.PI) / 180;

  const dustbinMatchQuery = buildDustbinMatchQuery({
    serviceQuery,
    start_date,
    end_date,
    requestedQuantity,
  });

  const pipeline = buildDustbinProviderPipeline({
    dustbinMatchQuery,
    customerLatRad,
    customerLonRad,
  });

  let dustbins = await Dustbin.aggregate(pipeline);

  let matchedTier = null;
  let cascadedFrom = null;
  const shouldCascade =
    Boolean(companyId) && cascade !== false && Number(topTier) >= 1;

  if (shouldCascade && dustbins.length > 0) {
    const band = selectBestTierBand(dustbins, topTier);
    dustbins = band.dustbins;
    matchedTier = band.matchedTier;
    cascadedFrom = band.cascadedFrom;
  }

  const providers = collectProvidersFromDustbins(dustbins, { onlineOnly });

  return {
    dustbins,
    providers,
    providersInArea: dustbins.length,
    providersOnline: providers.filter((p) => p.status === "online").length,
    matchedTier,
    cascadedFrom,
  };
}

/**
 * Returns, for a given location, the set of service sizes (dumbster or porta
 * potty) that have at least one dustbin passing the SAME rules the socket
 * availability check enforces (owner `radius` coverage, quantity vs bookings,
 * active/verified, non-deleted owner, and optional booking dates).
 *
 * Nearby listing is location-only (no company cascade) so sizes stay visible;
 * company tier cascade runs at availability / send-request time.
 *
 * @param {"dumbster"|"portaPotty"} sizeField - Dustbin field holding the size id.
 * @returns {Promise<Map<string, number>>} sizeId -> count of matching dustbins.
 */
export async function findBookableSizesNearby({
  sizeField,
  latitude,
  longitude,
  quantity = 1,
  start_date,
  end_date,
}) {
  const { dustbins } = await findNearbyDustbinProviders({
    serviceQuery: {},
    start_date,
    end_date,
    quantity,
    latitude,
    longitude,
    onlineOnly: false,
    cascade: false,
  });

  const countBySize = new Map();
  for (const dustbin of dustbins) {
    const sizeId = dustbin?.[sizeField];
    if (!sizeId) continue;
    const key = sizeId.toString();
    countBySize.set(key, (countBySize.get(key) || 0) + 1);
  }

  return countBySize;
}

export function buildServiceQueryForType({
  serviceType,
  dumbsterId,
  portaPottyId,
}) {
  const query = {};
  if (serviceType === "Dumbster" && dumbsterId) {
    query.dumbster = new mongoose.Types.ObjectId(dumbsterId);
  }
  if (serviceType === "Porta Potty" && portaPottyId) {
    query.portaPotty = new mongoose.Types.ObjectId(portaPottyId);
  }
  return query;
}
