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
  process.exit(0);
}
check();
