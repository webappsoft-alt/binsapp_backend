import User from "../models/User.js";
import JunkRemoval from "../models/JunkRemoval.js";
import TreeRemoval from "../models/TreeRemoval.js";
import { hydrateOperatorsJunkEligibility } from "./junkEligibility.js";

const MILES_TO_METERS = 1609.34;
const DEFAULT_RADIUS_MILES = 40;
const MAX_SEARCH_MILES = 50;

/**
 * Nearby operators for junk / site-cleanup fan-out.
 *
 * Sources (union):
 * 1) Online renters within radius who have BOTH active verified dumpster bins
 *    AND an uploaded insurance file (without a pending/rejected junk signup)
 * 2) Approved JunkRemoval profiles within their service radius with COI/insurance
 */
export async function findNearbyJunkOperators({
  latitude,
  longitude,
  onlineOnly = true,
  excludeUserId = null,
}) {
  const unique = new Map();
  const maxDistanceInMeters = MAX_SEARCH_MILES * MILES_TO_METERS;
  const near = {
    type: "Point",
    coordinates: [Number(longitude), Number(latitude)],
  };

  const exclude =
    excludeUserId != null ? String(excludeUserId) : null;

  // 1) Nearby online renters — gated to active verified bins + uploaded insurance file.
  const renterMatch = {
    $or: [{ role: "renter" }, { type: "renter" }],
    status: { $nin: ["deleted", "deactivated"] },
  };
  if (onlineOnly) {
    renterMatch.status = "online";
  }

  const nearbyRenters = await User.aggregate([
    {
      $geoNear: {
        near,
        distanceField: "distanceInMeters",
        maxDistance: maxDistanceInMeters,
        spherical: true,
        query: renterMatch,
        key: "location",
      },
    },
    {
      $addFields: {
        distanceInMiles: { $divide: ["$distanceInMeters", MILES_TO_METERS] },
        serviceRadiusMiles: { $ifNull: ["$radius", DEFAULT_RADIUS_MILES] },
      },
    },
    {
      $match: {
        $expr: {
          $lte: ["$distanceInMiles", "$serviceRadiusMiles"],
        },
      },
    },
    {
      $project: {
        _id: 1,
        fcmtoken: 1,
        email: 1,
        status: 1,
        distanceInMiles: 1,
        isInsured: 1,
        insuranceFile: 1,
        verifyCount: 1,
        junkRemoval: 1,
        treeRemoval: 1,
      },
    },
  ]);

  const renterIds = nearbyRenters.map((u) => u._id).filter(Boolean);
  const [junkDocs, treeDocs] = renterIds.length
    ? await Promise.all([
        JunkRemoval.find({ userId: { $in: renterIds } }).select("userId status approved COI").lean(),
        TreeRemoval.find({ userId: { $in: renterIds } }).select("userId COI").lean(),
      ])
    : [[], []];
  const junkByUserId = new Map(junkDocs.map((j) => [String(j.userId), j]));
  const treeByUserId = new Map(treeDocs.map((t) => [String(t.userId), t]));

  const rentersWithServices = nearbyRenters.map((u) => {
    const uid = String(u._id);
    return {
      ...u,
      junkRemoval: junkByUserId.get(uid) || null,
      treeRemoval: treeByUserId.get(uid) || null,
    };
  });

  const hydratedRenters = await hydrateOperatorsJunkEligibility(rentersWithServices);
  for (const u of hydratedRenters) {
    const id = u._id?.toString();
    if (!id || (exclude && id === exclude)) continue;
    if (!u.junkEligibility?.eligible) continue;
    unique.set(id, {
      userId: id,
      fcmtoken: u.fcmtoken || "",
      email: u.email || "",
      status: u.status || "online",
    });
  }

  // 2) Approved junk profiles with an insurance / COI file (may use a different yard location).
  const junkProfiles = await JunkRemoval.aggregate([
    {
      $geoNear: {
        near,
        distanceField: "distanceInMeters",
        maxDistance: maxDistanceInMeters,
        spherical: true,
      },
    },
    {
      $match: {
        $or: [
          { status: { $in: ["approved", "active", "verified"] } },
          { approved: true },
        ],
      },
    },
    {
      $lookup: {
        from: "users",
        localField: "userId",
        foreignField: "_id",
        as: "user",
      },
    },
    { $unwind: "$user" },
    {
      $match: {
        "user.status": onlineOnly
          ? "online"
          : { $nin: ["deleted", "deactivated"] },
      },
    },
    {
      $addFields: {
        distanceInMiles: { $divide: ["$distanceInMeters", MILES_TO_METERS] },
        serviceRadiusMiles: { $ifNull: ["$radius", DEFAULT_RADIUS_MILES] },
      },
    },
    {
      $match: {
        $expr: {
          $lte: ["$distanceInMiles", "$serviceRadiusMiles"],
        },
      },
    },
  ]);

  for (const item of junkProfiles) {
    const user = item?.user;
    const id = user?._id?.toString();
    if (!id || (exclude && id === exclude)) continue;
    const hasCoi = Boolean(
      (typeof item?.COI === "string" && item.COI.trim()) ||
        (typeof user?.insuranceFile === "string" && user.insuranceFile.trim()),
    );
    if (!hasCoi) continue;
    if (!unique.has(id)) {
      unique.set(id, {
        userId: id,
        fcmtoken: user.fcmtoken || "",
        email: user.email || "",
        status: user.status || "online",
      });
    }
  }

  return Array.from(unique.values());
}

export default findNearbyJunkOperators;
