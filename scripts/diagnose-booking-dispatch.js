/**
 * Diagnose which owners receive a dumpster booking and why a specific owner
 * was included or excluded.
 *
 * Usage:
 *   node scripts/diagnose-booking-dispatch.js --phone +923117384180
 *   node scripts/diagnose-booking-dispatch.js --phone 923117384180 --size 30
 *   node scripts/diagnose-booking-dispatch.js --orderId <orderId>
 *   node scripts/diagnose-booking-dispatch.js --orderNumber YcmmR
 */
import dotenv from "dotenv";
import mongoose from "mongoose";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));

const MILES_TO_METERS = 1609.344;

function parseArgs(argv) {
  const args = {
    phone: null,
    orderId: null,
    orderNumber: null,
    size: "30",
    limit: 5,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];
    if (key === "--phone") {
      args.phone = value;
      i += 1;
    } else if (key === "--orderId") {
      args.orderId = value;
      i += 1;
    } else if (key === "--orderNumber") {
      args.orderNumber = value;
      i += 1;
    } else if (key === "--size") {
      args.size = value;
      i += 1;
    } else if (key === "--limit") {
      args.limit = Number(value) || 5;
      i += 1;
    }
  }
  return args;
}

function normalizePhone(phone) {
  if (!phone) return null;
  const digits = String(phone).replace(/\D/g, "");
  return digits.slice(-10);
}

function haversineMeters(lng1, lat1, lng2, lat2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getCoords(doc) {
  const loc = doc?.location?.coordinates;
  if (Array.isArray(loc) && loc.length >= 2) return { lng: loc[0], lat: loc[1], source: "location" };
  const obj = doc?.locationObject?.coordinates;
  if (Array.isArray(obj) && obj.length >= 2) return { lng: obj[0], lat: obj[1], source: "locationObject" };
  return null;
}

function bookedQuantityInRange(bookings, start, end) {
  if (!start || !end || !Array.isArray(bookings)) return 0;
  const startDate = new Date(start);
  const endDate = new Date(end);
  return bookings
    .filter(
      (b) =>
        new Date(b.startDate) <= endDate && new Date(b.endDate) >= startDate,
    )
    .reduce((sum, b) => sum + (Number(b.quantity) > 0 ? Number(b.quantity) : 1), 0);
}

function remainingCapacity(dustbin, start, end, requestedQty) {
  const total = Number(dustbin.quantity) > 0 ? Number(dustbin.quantity) : 1;
  const booked = bookedQuantityInRange(dustbin.bookings, start, end);
  const remaining = total - booked;
  return { total, booked, remaining, passes: remaining >= requestedQty };
}

async function main() {
  const args = parseArgs(process.argv);
  if (!process.env.MONGODB_URI) {
    console.error("MONGODB_URI is not set in .env");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);

  const User = (await import("../src/models/User.js")).default;
  const Order = (await import("../src/models/Order.js")).default;
  const Dustbin = (await import("../src/models/Dustbin.js")).default;
  const Dumbster = (await import("../src/models/Dumbster.js")).default;
  const {
    findNearbyDustbinProviders,
    resolveCompanyTopTier,
    buildServiceQueryForType,
  } = await import("../src/utils/dustbinMatching.js");

  const targetPhoneSuffix = normalizePhone(args.phone);

  let targetUser = null;
  if (targetPhoneSuffix) {
    targetUser = await User.findOne({
      phone: { $regex: `${targetPhoneSuffix}$` },
    }).lean();
    console.log("\n=== Target owner ===");
    if (!targetUser) {
      console.log(`No user found for phone ending in ${targetPhoneSuffix}`);
    } else {
      console.log(
        JSON.stringify(
          {
            _id: targetUser._id,
            name: targetUser.name,
            phone: targetUser.phone,
            status: targetUser.status,
            role: targetUser.role,
            tier: targetUser.operatorStats?.tier ?? 1,
            score: targetUser.operatorStats?.score ?? 0,
          },
          null,
          2,
        ),
      );
    }
  }

  const sizeCatalog = await Dumbster.find({ size: String(args.size) })
    .select("_id size description status")
    .lean();
  console.log(`\n=== ${args.size} Yard catalog ids ===`);
  console.log(JSON.stringify(sizeCatalog, null, 2));

  let orders = [];
  if (args.orderId) {
    const one = await Order.findById(args.orderId).populate("dumbster").lean();
    if (one) orders = [one];
  } else if (args.orderNumber) {
    const one = await Order.findOne({ orderNumber: args.orderNumber })
      .populate("dumbster")
      .lean();
    if (one) orders = [one];
  } else {
    const catalogIds = sizeCatalog.map((d) => d._id);
    orders = await Order.find({
      service_type: "Dumbster",
      dumbster: { $in: catalogIds },
      status: "pending",
    })
      .sort({ createdAt: -1 })
      .limit(args.limit)
      .populate("dumbster")
      .lean();
  }

  if (!orders.length) {
    console.log("\nNo matching pending orders found.");
    await mongoose.disconnect();
    return;
  }

  for (const order of orders) {
    console.log("\n" + "=".repeat(72));
    console.log("ORDER", order.orderNumber, order._id.toString());
    console.log("=".repeat(72));

    const coords = order.location?.coordinates;
    if (!coords || coords.length < 2) {
      console.log("Order has no valid location coordinates — cannot match.");
      continue;
    }
    const [lng, lat] = coords;
    const requestedQty = Number(order.quantity) > 0 ? Number(order.quantity) : 1;
    const companyId = order.company?.toString?.() || order.company || null;
    const { topTier, tiersConfigured } = await resolveCompanyTopTier(companyId);

    console.log("\n--- Order summary ---");
    console.log(
      JSON.stringify(
        {
          orderNumber: order.orderNumber,
          status: order.status,
          matchedOwner: order.to_id || null,
          createdAt: order.createdAt,
          customerLocation: { lng, lat },
          start_date: order.start_date,
          end_date: order.end_date,
          quantity: requestedQty,
          dumbsterCatalogId: order.dumbster?._id || order.dumbster,
          dumbsterSize: order.dumbster?.size,
          companyId,
          topTier,
          tiersConfigured,
          userIdsOnOrder: (order.userIds || []).map(String),
          rejected_by: (order.rejected_by || []).map(String),
          payment_type: order.payment_type,
        },
        null,
        2,
      ),
    );

    const serviceQuery = buildServiceQueryForType({
      serviceType: "Dumbster",
      dumbsterId: order.dumbster?._id || order.dumbster,
    });

    const allInArea = await findNearbyDustbinProviders({
      serviceQuery,
      start_date: order.start_date,
      end_date: order.end_date,
      quantity: requestedQty,
      latitude: lat,
      longitude: lng,
      companyId,
      topTier,
      onlineOnly: false,
    });

    const onlineOnly = await findNearbyDustbinProviders({
      serviceQuery,
      start_date: order.start_date,
      end_date: order.end_date,
      quantity: requestedQty,
      latitude: lat,
      longitude: lng,
      companyId,
      topTier,
      onlineOnly: true,
    });

    console.log("\n--- Matching summary (same rules as booking) ---");
    console.log(
      JSON.stringify(
        {
          dustbinsInArea: allInArea.providersInArea,
          providersInArea_anyStatus: allInArea.providers.length,
          providersOnline_bookingUsesThis: onlineOnly.providers.length,
          note:
            "send-request-rentee requires onlineOnly:true; check-service-provider-availability uses onlineOnly:false",
        },
        null,
        2,
      ),
    );

    const providerRows = [];
    for (const p of allInArea.providers) {
      const u = await User.findById(p.userId).select("name phone status operatorStats").lean();
      providerRows.push({
        userId: p.userId,
        name: u?.name,
        phone: u?.phone,
        status: p.status,
        online: p.status === "online",
        tier: p.operatorTier,
        onOrderUserIds: (order.userIds || []).map(String).includes(p.userId),
        dustbinIds: p.dustbinIds,
      });
    }
    console.log("\n--- All providers in area (any online status) ---");
    console.table(providerRows);

    console.log("\n--- Providers who receive booking (online at send time) ---");
    console.table(
      onlineOnly.providers.map((p) => ({
        userId: p.userId,
        status: p.status,
        tier: p.operatorTier,
        onOrderUserIds: (order.userIds || []).map(String).includes(p.userId),
      })),
    );

    if (targetUser) {
      const uid = targetUser._id.toString();
      console.log("\n--- Why target owner is included / excluded ---");
      const reasons = [];

      if ((order.rejected_by || []).map(String).includes(uid)) {
        reasons.push("FAIL: owner already in order.rejected_by");
      }

      const onOrder = (order.userIds || []).map(String).includes(uid);
      if (onOrder) {
        reasons.push("PASS: listed on order.userIds (matched at booking create)");
      } else {
        reasons.push("FAIL: NOT on order.userIds — was not matched when booking was created");
      }

      if (targetUser.status !== "online") {
        reasons.push(
          `FAIL: user.status is "${targetUser.status}" — must be "online" for send-request-rentee and dispatch waves`,
        );
      } else {
        reasons.push('PASS: user.status is "online"');
      }

      if (companyId && tiersConfigured && topTier > 1) {
        const userTier = targetUser.operatorStats?.tier || 1;
        if (userTier < topTier) {
          reasons.push(
            `FAIL: company booking requires tier >= ${topTier}, owner tier is ${userTier}`,
          );
        } else {
          reasons.push(`PASS: tier ${userTier} >= required ${topTier}`);
        }
      }

      const ownerBins = await Dustbin.find({
        user: targetUser._id,
        dumbster: { $exists: true, $ne: null },
      })
        .populate("dumbster")
        .lean();

      console.log(`\nOwner has ${ownerBins.length} dumpster listing(s):`);
      for (const bin of ownerBins) {
        const coordsBin = getCoords(bin);
        const cap = remainingCapacity(
          bin,
          order.start_date,
          order.end_date,
          requestedQty,
        );
        const catalogMatch =
          String(bin.dumbster?._id || bin.dumbster) ===
          String(order.dumbster?._id || order.dumbster);
        const sizeMatch =
          String(bin.dumbster?.size || bin.size) === String(order.dumbster?.size);

        let distanceMiles = null;
        let withinRadius = null;
        if (coordsBin) {
          const distM = haversineMeters(lng, lat, coordsBin.lng, coordsBin.lat);
          distanceMiles = (distM / MILES_TO_METERS).toFixed(2);
          const radiusMiles = Number(bin.radius) > 0 ? Number(bin.radius) : 40;
          withinRadius = distM <= radiusMiles * MILES_TO_METERS;
        }

        const row = {
          dustbinId: bin._id,
          catalogId: bin.dumbster?._id || bin.dumbster,
          catalogSize: bin.dumbster?.size,
          verify: bin.verify,
          rejected: bin.rejected,
          listingStatus: bin.status,
          catalogMatch,
          sizeMatch,
          coords: coordsBin,
          distanceMiles,
          serviceRadiusMiles: bin.radius ?? 40,
          withinRadius,
          capacity: cap,
        };
        console.log(JSON.stringify(row, null, 2));

        if (!bin.verify) reasons.push(`FAIL dustbin ${bin._id}: not verified`);
        if (bin.rejected) reasons.push(`FAIL dustbin ${bin._id}: rejected`);
        if (bin.status !== "active") reasons.push(`FAIL dustbin ${bin._id}: status ${bin.status}`);
        if (!catalogMatch && !sizeMatch) {
          reasons.push(
            `FAIL dustbin ${bin._id}: catalog/size does not match order (${order.dumbster?.size} yard)`,
          );
        }
        if (!coordsBin) reasons.push(`FAIL dustbin ${bin._id}: missing coordinates`);
        if (withinRadius === false) {
          reasons.push(
            `FAIL dustbin ${bin._id}: customer ${distanceMiles} mi away, outside radius ${bin.radius ?? 40} mi`,
          );
        }
        if (!cap.passes) {
          reasons.push(
            `FAIL dustbin ${bin._id}: capacity ${cap.remaining}/${cap.total} for dates (need ${requestedQty})`,
          );
        }
      }

      if (!ownerBins.length) {
        reasons.push("FAIL: no dumpster dustbin listings on this account");
      }

      const inOnlineMatch = onlineOnly.providers.some((p) => p.userId === uid);
      if (inOnlineMatch) {
        reasons.push("PASS: would match findNearbyDustbinProviders(onlineOnly:true) today");
      } else {
        reasons.push(
          "FAIL: does NOT match findNearbyDustbinProviders(onlineOnly:true) today — booking would not notify this owner now",
        );
      }

      console.log("\n--- Verdict checklist ---");
      reasons.forEach((r) => console.log(r));
    }
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
