/**
 * Testing helper: simulate the owner "Confirm Drop Off" step for an order when
 * you can't capture a photo (e.g. on a simulator). The real socket event
 * `dropoff-order-renter` just stores a `dropoffimage` on the order; this script
 * sets a placeholder image so the flow can advance to ready-for-pickup.
 *
 * Usage:
 *   node scripts/simulate-dropoff.js <orderNumber>            # dry run
 *   node scripts/simulate-dropoff.js <orderNumber> --apply     # persist
 */
import "dotenv/config";
import mongoose from "mongoose";

const APPLY = process.argv.includes("--apply");
const orderArg = process.argv.find(
  (a) => a !== "--apply" && !a.includes("node") && !a.includes("simulate-dropoff"),
);
const ORDER_NUMBER = process.argv[2] && !process.argv[2].startsWith("--")
  ? process.argv[2]
  : null;

const PLACEHOLDER_IMAGE =
  "https://storage.googleapis.com/dumpster-df2b0.appspot.com/uploads/test-dropoff.jpg";

async function main() {
  if (!ORDER_NUMBER) {
    console.error("Provide an order number, e.g. node scripts/simulate-dropoff.js YcmmR --apply");
    process.exit(1);
  }
  if (!process.env.MONGODB_URI) {
    console.error("MONGODB_URI is not set in the environment (.env).");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);
  const Orders = mongoose.connection.db.collection("orders");

  const order = await Orders.findOne({ orderNumber: ORDER_NUMBER });
  if (!order) {
    console.error(`Order with orderNumber "${ORDER_NUMBER}" not found.`);
    await mongoose.disconnect();
    process.exit(1);
  }

  console.log("Found order:", {
    _id: order._id?.toString(),
    orderNumber: order.orderNumber,
    status: order.status,
    onway: order.onway,
    dropoffimage: order.dropoffimage || null,
    to_id: order.to_id?.toString() || null,
    user: order.user?.toString() || null,
  });

  if (order.status !== "accepted") {
    console.warn(
      `WARNING: order status is "${order.status}", not "accepted". Dropoff normally happens on an accepted order.`,
    );
  }
  if (order.dropoffimage) {
    console.log("Order already has a dropoffimage; nothing to do.");
    await mongoose.disconnect();
    return;
  }

  if (!APPLY) {
    console.log(
      `DRY RUN — would set dropoffimage to "${PLACEHOLDER_IMAGE}". Re-run with --apply to persist.`,
    );
    await mongoose.disconnect();
    return;
  }

  const res = await Orders.updateOne(
    { _id: order._id },
    { $set: { dropoffimage: PLACEHOLDER_IMAGE } },
  );
  console.log("Update result:", {
    matched: res.matchedCount,
    modified: res.modifiedCount,
  });
  const after = await Orders.findOne(
    { _id: order._id },
    { projection: { orderNumber: 1, status: 1, dropoffimage: 1 } },
  );
  console.log("After:", after);
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error("simulate-dropoff failed:", err);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});
