/**
 * Diagnostic: dump an operator's stored operatorStats and their raw JobEvent
 * aggregation so we can see exactly what drives their score/tier.
 *
 * Usage: node scripts/diagnose-operator-score.js <phoneOrUserId>
 */
import "dotenv/config";
import mongoose from "mongoose";

const ARG = process.argv[2];

async function main() {
  if (!ARG) {
    console.error("Provide a phone number or userId.");
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;
  const Users = db.collection("users");
  const JobEvents = db.collection("jobevents");
  const Orders = db.collection("orders");

  let user = null;
  if (/^[0-9a-fA-F]{24}$/.test(ARG)) {
    user = await Users.findOne({ _id: new mongoose.Types.ObjectId(ARG) });
  }
  if (!user) {
    user = await Users.findOne({
      $or: [
        { phone: ARG },
        { phone: `+${ARG}` },
        { phone: { $regex: `${ARG}$` } },
      ],
    });
  }
  if (!user) {
    console.error(`No user found for "${ARG}".`);
    await mongoose.disconnect();
    process.exit(1);
  }

  console.log("=== USER ===");
  console.log({
    _id: user._id.toString(),
    name: user.name,
    phone: user.phone,
    rating: user.rating,
  });
  console.log("=== STORED operatorStats ===");
  console.log(user.operatorStats);

  const events = await JobEvents.aggregate([
    { $match: { operatorId: user._id } },
    {
      $group: {
        _id: "$eventType",
        count: { $sum: 1 },
        onTimeCount: {
          $sum: { $cond: [{ $eq: ["$onTime", true] }, 1, 0] },
        },
      },
    },
  ]).toArray();
  console.log("=== JobEvent breakdown ===");
  console.log(events);

  // Show completed events with their onTime flag + the order's dates.
  const completed = await JobEvents.find({
    operatorId: user._id,
    eventType: "JOB_COMPLETED",
  }).toArray();
  console.log("=== JOB_COMPLETED events (onTime + order dates) ===");
  for (const ev of completed) {
    const order = ev.orderId
      ? await Orders.findOne(
          { _id: ev.orderId },
          { projection: { orderNumber: 1, start_date: 1, end_date: 1, new_end_date: 1 } },
        )
      : null;
    console.log({
      orderId: ev.orderId?.toString(),
      orderNumber: order?.orderNumber,
      onTime: ev.onTime,
      completedAt: ev.createdAt,
      start_date: order?.start_date,
      end_date: order?.end_date,
      new_end_date: order?.new_end_date,
    });
  }

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error("diagnose failed:", err);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});
