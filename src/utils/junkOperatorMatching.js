import User from "../models/User.js";
import JunkRemoval from "../models/JunkRemoval.js";

const MILES_TO_METERS = 1609.34;
const DEFAULT_RADIUS_MILES = 40;
const MAX_SEARCH_MILES = 50;

/**
 * Nearby operators for junk / site-cleanup fan-out.
 *
 * Product rule: show requests even if the operator has not completed junk
 * signup or Stripe Connect. Those gates run only on accept.
 *
 * Sources (union):
 * 1) Online renters within their profile radius of the job (by user.location)
 * 2) Approved JunkRemoval profiles within their service radius (legacy)
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

  // 1) Any online renter near the job — no junk signup / Stripe required.
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
      },
    },
  ]);

  for (const u of nearbyRenters) {
    const id = u._id?.toString();
    if (!id || (exclude && id === exclude)) continue;
    unique.set(id, {
      userId: id,
      fcmtoken: u.fcmtoken || "",
      email: u.email || "",
      status: u.status || "online",
    });
  }

  // 2) Approved junk profiles (may use a different yard location).
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
        // Include pending + approved so newly signed-up operators still get
        // fan-out; rejected stays out. Accept flow still enforces insurance.
        status: { $in: ["approved", "pending"] },
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
