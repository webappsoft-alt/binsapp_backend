/**
 * Reproduce check-service-provider-availability dumpster matching
 * against live MongoDB or a mongodump backup folder.
 *
 * Usage:
 *   node scripts/test-dumpster-availability.js
 *   node scripts/test-dumpster-availability.js --lng 73.1003447 --lat 31.4005006
 *   node scripts/test-dumpster-availability.js --backup backup/latest-dump/dumbster
 */
import dotenv from "dotenv";
import mongoose from "mongoose";
import { existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));

const PAYLOAD = {
  companyId: "6a5788010378c8ec5416408b",
  dumbsterId: "6749c191d35fc34208d6cb7a",
  start_date: "2026-07-15",
  end_date: "2026-07-16",
  quantity: 1,
  service_type: "Dumbster",
};

function parseArgs(argv) {
  const args = { ...PAYLOAD };
  for (let i = 2; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];
    if (key === "--lng") {
      args.longitude = Number(value);
      i += 1;
    } else if (key === "--lat") {
      args.latitude = Number(value);
      i += 1;
    } else if (key === "--backup") {
      args.backupDir = value;
      i += 1;
    }
  }
  return args;
}

function buildDustbinMatchQuery({
  dumbsterId,
  start_date,
  end_date,
  requestedQuantity,
  useFixedQuantity,
}) {
  const query = {
    dumbster: new mongoose.Types.ObjectId(dumbsterId),
    verify: true,
    status: "active",
    bookings: {
      $not: {
        $elemMatch: {
          startDate: { $lte: new Date(end_date) },
          endDate: { $gte: new Date(start_date) },
        },
      },
    },
  };

  if (useFixedQuantity) {
    query.$expr = {
      $gte: [{ $ifNull: ["$availableQuantity", 1] }, requestedQuantity],
    };
    query.$or = [
      {
        "location.coordinates.0": { $exists: true },
        "location.coordinates.1": { $exists: true },
      },
      {
        "locationObject.coordinates.0": { $exists: true },
        "locationObject.coordinates.1": { $exists: true },
      },
    ];
  } else {
    query.availableQuantity = { $gte: requestedQuantity };
    query.location = { $exists: true, $ne: null };
    query["location.coordinates.0"] = { $exists: true };
    query["location.coordinates.1"] = { $exists: true };
  }

  return query;
}

function buildPipeline({
  dustbinMatchQuery,
  latitude,
  longitude,
  companyId,
  topTier,
  onlineOnly,
}) {
  const milesToMeters = 1609.344;
  const maxPlatformRadiusMiles = 100;
  const customerLatRad = (latitude * Math.PI) / 180;
  const customerLonRad = (longitude * Math.PI) / 180;

  const pipeline = [
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
                            $multiply: [
                              { $sin: "$$lat1" },
                              { $sin: "$$lat2" },
                            ],
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
        serviceRadiusMeters: {
          $multiply: [{ $ifNull: ["$radius", 40] }, milesToMeters],
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
                maxPlatformRadiusMiles * milesToMeters,
              ],
            },
          ],
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
  ];

  if (companyId && topTier > 1) {
    pipeline.push({
      $match: {
        $expr: {
          $gte: [{ $ifNull: ["$user.operatorStats.tier", 1] }, topTier],
        },
      },
    });
  }

  pipeline.push({
    $project: {
      _id: 1,
      distanceInMeters: 1,
      radius: 1,
      availableQuantity: 1,
      "user._id": 1,
      "user.status": 1,
      providerCoordinates: 1,
    },
  });

  return pipeline;
}

async function resolveCoordinates(db, args) {
  if (
    Number.isFinite(args.longitude) &&
    Number.isFinite(args.latitude)
  ) {
    return {
      longitude: args.longitude,
      latitude: args.latitude,
      source: "cli",
    };
  }

  const companyOid = new mongoose.Types.ObjectId(args.companyId);
  const collections = ["companies", "users", "subuserdetails"];
  for (const name of collections) {
    const doc = await db.collection(name).findOne({ _id: companyOid });
    if (!doc) continue;

    const coords =
      doc.location?.coordinates ||
      doc.locationObject?.coordinates ||
      doc.address?.coordinates;
    if (Array.isArray(coords) && coords.length >= 2) {
      return {
        longitude: Number(coords[0]),
        latitude: Number(coords[1]),
        source: name,
      };
    }
  }

  const activeDustbin = await db.collection("dustbins").findOne({
    dumbster: new mongoose.Types.ObjectId(args.dumbsterId),
    verify: true,
    status: "active",
    "location.coordinates.0": { $exists: true },
  });

  if (activeDustbin?.location?.coordinates) {
    const [longitude, latitude] = activeDustbin.location.coordinates;
    return {
      longitude,
      latitude,
      source: `dustbin:${activeDustbin._id}`,
    };
  }

  return null;
}

async function runScenario(db, args, label, options) {
  const requestedQuantity = Number(args.quantity) > 0 ? Number(args.quantity) : 1;
  const topTier = options.topTier;
  const dustbinMatchQuery = buildDustbinMatchQuery({
    dumbsterId: args.dumbsterId,
    start_date: args.start_date,
    end_date: args.end_date,
    requestedQuantity,
    useFixedQuantity: options.useFixedQuantity,
  });

  const pipeline = buildPipeline({
    dustbinMatchQuery,
    latitude: args.latitude,
    longitude: args.longitude,
    companyId: args.companyId,
    topTier,
    onlineOnly: options.onlineOnly,
  });

  const results = await db.collection("dustbins").aggregate(pipeline).toArray();
  const providersInArea = results.length;
  const uniqueUsers = new Map();

  for (const item of results) {
    const user = item.user;
    if (!user || user.status === "deleted" || user.status === "deactivated") {
      continue;
    }
    if (options.onlineOnly && user.status !== "online") {
      continue;
    }
    uniqueUsers.set(String(user._id), {
      userId: String(user._id),
      status: user.status,
      distanceMiles: Number((item.distanceInMeters / 1609.344).toFixed(2)),
    });
  }

  const uniqueUserObjects = Array.from(uniqueUsers.values());
  const providersOnline = uniqueUserObjects.filter(
    (u) => u.status === "online",
  ).length;

  const success = options.onlineOnly
    ? uniqueUserObjects.length > 0
    : providersInArea > 0;

  return {
    label,
    success,
    providersInArea,
    providersOnline,
    uniqueProviders: uniqueUserObjects.length,
    sample: uniqueUserObjects.slice(0, 5),
    nearest: results
      .slice()
      .sort((a, b) => a.distanceInMeters - b.distanceInMeters)
      .slice(0, 3)
      .map((r) => ({
        dustbinId: String(r._id),
        miles: Number((r.distanceInMeters / 1609.344).toFixed(2)),
        radius: r.radius ?? 40,
        userStatus: r.user?.status,
      })),
  };
}

async function main() {
  const args = parseArgs(process.argv);
  const backupDir = args.backupDir
    ? resolve(args.backupDir)
    : resolve(__dirname, "../backup/latest-dump/dumbster");

  if (existsSync(backupDir)) {
    console.log(`Backup folder found: ${backupDir}`);
    console.log(
      "Note: BSON restore not configured locally; using MONGODB_URI for query replay.",
    );
  } else {
    console.log(`No local backup at ${backupDir}; using MONGODB_URI directly.`);
  }

  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is required in .env");
  }

  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;

  const coords = await resolveCoordinates(db, args);
  if (!coords) {
    throw new Error(
      "Could not resolve coordinates. Pass --lng and --lat explicitly.",
    );
  }

  args.longitude = coords.longitude;
  args.latitude = coords.latitude;

  const tier = await db
    .collection("tiers")
    .find({})
    .sort({ level: 1 })
    .limit(1)
    .toArray();
  const topTier = tier.length ? tier[0].level : 1;

  const baseCount = await db.collection("dustbins").countDocuments({
    dumbster: new mongoose.Types.ObjectId(args.dumbsterId),
  });
  const oldBaseCount = await db.collection("dustbins").countDocuments({
    dumbster: new mongoose.Types.ObjectId(args.dumbsterId),
    verify: true,
    status: "active",
    availableQuantity: { $gte: 1 },
  });
  const newBaseCount = await db.collection("dustbins").countDocuments({
    dumbster: new mongoose.Types.ObjectId(args.dumbsterId),
    verify: true,
    status: "active",
    $expr: { $gte: [{ $ifNull: ["$availableQuantity", 1] }, 1] },
  });

  console.log("\n=== Payload ===");
  console.log(JSON.stringify(args, null, 2));
  console.log("\n=== Coordinates ===");
  console.log(
    JSON.stringify(
      {
        longitude: args.longitude,
        latitude: args.latitude,
        source: coords.source,
        topTier,
      },
      null,
      2,
    ),
  );

  console.log("\n=== Dustbin counts for dumbsterId ===");
  console.log(
    JSON.stringify(
      {
        totalForDumbsterType: baseCount,
        oldQuantityFilterMatches: oldBaseCount,
        fixedQuantityFilterMatches: newBaseCount,
      },
      null,
      2,
    ),
  );

  const scenarios = [
    {
      label: "OLD production logic (availableQuantity field required, online only)",
      useFixedQuantity: false,
      onlineOnly: true,
      topTier,
    },
    {
      label: "NEW fixed logic (ifNull quantity, providers in area)",
      useFixedQuantity: true,
      onlineOnly: false,
      topTier,
    },
    {
      label: "NEW fixed logic + only online providers in callback",
      useFixedQuantity: true,
      onlineOnly: true,
      topTier,
    },
  ];

  console.log("\n=== Scenario results ===");
  for (const scenario of scenarios) {
    const result = await runScenario(db, args, scenario.label, scenario);
    console.log(JSON.stringify(result, null, 2));
  }

  await mongoose.disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
