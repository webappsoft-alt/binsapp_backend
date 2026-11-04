import dotenv from 'dotenv';
dotenv.config();
import mongoose from 'mongoose';
import Order from '../src/models/Order.js';

async function check() {
  await mongoose.connect(process.env.MONGODB_URI);
  const counts = await Order.aggregate([
    { $group: { _id: "$status", count: { $sum: 1 } } }
  ]);
  console.log("Order counts by status:", counts);

  const pendingOrUnaccepted = await Order.find({
    $or: [
      { status: "pending" },
      { to_id: null },
      { reAssign: true },
    ]
  }).select("_id orderNumber status to_id reAssign service_type createdAt").lean();
  console.log("Pending or unaccepted orders:", pendingOrUnaccepted);
  process.exit(0);
}
check();
