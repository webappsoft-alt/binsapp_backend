/**
 * Check whether a user has a verified porta potty source (inventory) to use.
 * Usage: node scripts/check-portapotty-source.js <phoneOrUserId>
 */
import "dotenv/config";
import mongoose from "mongoose";

const ARG = process.argv[2];

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;
  const Users = db.collection("users");
  const Dustbins = db.collection("dustbins");

  let user = null;
  if (/^[0-9a-fA-F]{24}$/.test(ARG)) {
    user = await Users.findOne({ _id: new mongoose.Types.ObjectId(ARG) });
  }
  if (!user) {
    user = await Users.findOne({
      $or: [{ phone: ARG }, { phone: `+${ARG}` }, { phone: { $regex: `${ARG}$` } }],
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
    email: user.email,
    accountType: user.accountType,
    role: user.role,
  });

  const bins = await Dustbins.find({
    user: user._id,
    portaPotty: { $ne: null },
  })
    .toArray();

  console.log(`\n=== PORTA POTTY inventory (dustbins with portaPotty) — ${bins.length} ===`);
  for (const b of bins) {
    console.log({
      _id: b._id.toString(),
      portaPotty: b.portaPotty?.toString(),
      verify: b.verify,
      rejected: b.rejected,
      status: b.status,
      quantity: b.quantity,
      availableQuantity: b.availableQuantity,
      city: b.locationObject?.city,
      registrationfile: b.registrationfile ? "yes" : "no",
      insurancefile: b.insurancefile ? "yes" : "no",
    });
  }

  const verified = bins.filter(
    (b) => b.verify === true && b.rejected !== true && b.status === "active",
  );
  console.log(
    `\n=== VERDICT: ${verified.length > 0 ? "YES" : "NO"} verified/active porta potty source (${verified.length} of ${bins.length}) ===`,
  );

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error("check failed:", err);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});
