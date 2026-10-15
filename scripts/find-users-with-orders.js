/**
 * find-users-with-orders.js
 *
 * Finds and displays all users in the current MongoDB database who have orders:
 * - As Provider/Operator (to_id): received/assigned orders (accepted, pending, completed, etc.)
 * - As Customer/Rentee (user): placed orders
 *
 * Usage:
 *   node scripts/find-users-with-orders.js
 *   node scripts/find-users-with-orders.js --providers-only
 *   node scripts/find-users-with-orders.js --customers-only
 */
import "dotenv/config";
import mongoose from "mongoose";

async function run() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("❌ MONGODB_URI not found in environment (.env).");
    process.exit(1);
  }

  console.log("🔌 Connecting to MongoDB...");
  await mongoose.connect(uri);
  const db = mongoose.connection.db;

  const usersCollection = db.collection("users");
  const ordersCollection = db.collection("orders");

  const totalOrdersInDb = await ordersCollection.countDocuments();
  console.log(`\n📦 Total orders found in database: ${totalOrdersInDb}\n`);

  if (totalOrdersInDb === 0) {
    console.log("⚠️ No orders exist in the database yet.");
    await mongoose.disconnect();
    return;
  }

  // 1. PROVIDERS / OPERATORS (orders where user is `to_id`)
  const providerAgg = await ordersCollection.aggregate([
    { $match: { to_id: { $ne: null } } },
    {
      $group: {
        _id: "$to_id",
        totalOrders: { $sum: 1 },
        statuses: { $push: "$status" },
        services: { $push: "$service_type" },
        recentOrder: {
          $last: {
            id: "$_id",
            status: "$status",
            service: "$service_type",
            createdAt: "$createdAt",
            amount: { $ifNull: ["$amount", "$price"] }
          }
        }
      }
    },
    { $sort: { totalOrders: -1 } }
  ]).toArray();

  console.log("═══════════════════════════════════════════════════════════════════════════");
  console.log(` 🚚 PROVIDERS / OPERATORS WITH ORDERS (${providerAgg.length} found)`);
  console.log("    (These are accounts that have orders in their Provider Portal / Calendar)");
  console.log("═══════════════════════════════════════════════════════════════════════════");

  if (providerAgg.length === 0) {
    console.log("  No providers currently assigned to orders (to_id is null for all orders).");
  } else {
    for (const p of providerAgg) {
      let userObj = null;
      try {
        userObj = await usersCollection.findOne({ _id: new mongoose.Types.ObjectId(p._id) });
      } catch {
        userObj = await usersCollection.findOne({ _id: p._id });
      }

      // Count statuses
      const statusCounts = {};
      (p.statuses || []).forEach(st => {
        statusCounts[st || "unknown"] = (statusCounts[st || "unknown"] || 0) + 1;
      });
      const statusStr = Object.entries(statusCounts).map(([k, v]) => `${k}: ${v}`).join(", ");

      // Services summary
      const serviceCounts = {};
      (p.services || []).forEach(sv => {
        serviceCounts[sv || "other"] = (serviceCounts[sv || "other"] || 0) + 1;
      });
      const servicesStr = Object.entries(serviceCounts).map(([k, v]) => `${k}: ${v}`).join(", ");

      console.log(`\n• User ID: ${p._id}`);
      console.log(`  Name:     ${userObj?.name || userObj?.comp_name || "N/A"}`);
      console.log(`  Phone:    ${userObj?.phone || "N/A"}`);
      console.log(`  Email:    ${userObj?.email || "N/A"}`);
      console.log(`  Role:     ${userObj?.role || "renter"}`);
      console.log(`  Orders:   ${p.totalOrders} total (${statusStr})`);
      console.log(`  Services: ${servicesStr}`);
      if (p.recentOrder) {
        console.log(`  Latest:   #${String(p.recentOrder.id).slice(-6)} | ${p.recentOrder.service} | Status: ${p.recentOrder.status} | $${p.recentOrder.amount || 0}`);
      }
    }
  }

  // 2. CUSTOMERS / RENTEES (orders where user is `user`)
  const customerAgg = await ordersCollection.aggregate([
    { $match: { user: { $ne: null } } },
    {
      $group: {
        _id: "$user",
        totalOrders: { $sum: 1 },
        statuses: { $push: "$status" },
        services: { $push: "$service_type" },
        recentOrder: {
          $last: {
            id: "$_id",
            status: "$status",
            service: "$service_type",
            createdAt: "$createdAt",
            amount: { $ifNull: ["$amount", "$price"] }
          }
        }
      }
    },
    { $sort: { totalOrders: -1 } }
  ]).toArray();

  console.log("\n═══════════════════════════════════════════════════════════════════════════");
  console.log(` 👤 CUSTOMERS / RENTEES WHO PLACED ORDERS (${customerAgg.length} found)`);
  console.log("═══════════════════════════════════════════════════════════════════════════");

  if (customerAgg.length === 0) {
    console.log("  No customers associated with orders.");
  } else {
    for (const c of customerAgg) {
      let userObj = null;
      try {
        userObj = await usersCollection.findOne({ _id: new mongoose.Types.ObjectId(c._id) });
      } catch {
        userObj = await usersCollection.findOne({ _id: c._id });
      }

      const statusCounts = {};
      (c.statuses || []).forEach(st => {
        statusCounts[st || "unknown"] = (statusCounts[st || "unknown"] || 0) + 1;
      });
      const statusStr = Object.entries(statusCounts).map(([k, v]) => `${k}: ${v}`).join(", ");

      console.log(`\n• User ID: ${c._id}`);
      console.log(`  Name:     ${userObj?.name || "N/A"}`);
      console.log(`  Phone:    ${userObj?.phone || "N/A"}`);
      console.log(`  Email:    ${userObj?.email || "N/A"}`);
      console.log(`  Role:     ${userObj?.role || "rentee"}`);
      console.log(`  Orders:   ${c.totalOrders} total (${statusStr})`);
      if (c.recentOrder) {
        console.log(`  Latest:   #${String(c.recentOrder.id).slice(-6)} | ${c.recentOrder.service} | Status: ${c.recentOrder.status} | $${c.recentOrder.amount || 0}`);
      }
    }
  }

  // 3. UNMATCHED / UNASSIGNED PENDING ORDERS (Orders waiting for a provider)
  const unassignedCount = await ordersCollection.countDocuments({ to_id: null });
  console.log("\n═══════════════════════════════════════════════════════════════════════════");
  console.log(` 📋 UNASSIGNED ORDERS (to_id: null): ${unassignedCount}`);
  if (unassignedCount > 0) {
    const sample = await ordersCollection.find({ to_id: null }).limit(3).toArray();
    console.log("    Sample unassigned order IDs:");
    sample.forEach(o => {
      console.log(`    - ID: ${o._id} | Service: ${o.service_type} | Status: ${o.status} | Customer: ${o.user}`);
    });
  }
  console.log("═══════════════════════════════════════════════════════════════════════════\n");

  await mongoose.disconnect();
  console.log("✅ Done.");
}

run().catch(err => {
  console.error("❌ Error running script:", err);
  process.exit(1);
});
