/**
 * Backfill User.isInsured / insuranceFile / insuranceExpiryDate for existing
 * operators from JunkRemoval.COI and Dustbin insurance fields.
 *
 * Usage:
 *   node scripts/backfill-user-insurance.js            # dry run
 *   node scripts/backfill-user-insurance.js --apply     # write changes
 */
import mongoose from "mongoose";
import dotenv from "dotenv";
import User from "../src/models/User.js";
import JunkRemoval from "../src/models/JunkRemoval.js";
import Dustbin from "../src/models/Dustbin.js";

dotenv.config();

const APPLY = process.argv.includes("--apply");

function toDateOrNull(value) {
  if (value == null || value === "") return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

async function resolveForUser(userId, junkByUser) {
  const junk = junkByUser.get(String(userId)) || null;
  let file = junk?.COI || junk?.coi || null;
  let expiry = toDateOrNull(junk?.insurance_expiry_date);

  const bins = await Dustbin.find({
    user: userId,
    verify: true,
    status: "active",
  })
    .select("insurancefile insurance_expiry_date expiry_date")
    .lean();

  for (const bin of bins) {
    if (!file && bin.insurancefile) file = bin.insurancefile;
    const binExpiry = toDateOrNull(
      bin.insurance_expiry_date || bin.expiry_date,
    );
    if (binExpiry && (!expiry || binExpiry < expiry)) {
      expiry = binExpiry;
    }
  }

  const hasFile = Boolean(file && String(file).trim());
  const isExpired = Boolean(expiry && expiry < startOfToday());
  return {
    insuranceFile: hasFile ? String(file) : null,
    insuranceExpiryDate: expiry,
    isInsured: hasFile && !isExpired,
  };
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("MONGODB_URI missing");
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log(`Connected. Mode: ${APPLY ? "APPLY" : "DRY RUN"}`);

  const users = await User.find({
    $or: [
      { role: "renter" },
      { type: "renter" },
      { junkRemoval: { $ne: null } },
    ],
  })
    .select("_id name email insuranceFile insuranceExpiryDate isInsured junkRemoval role type status")
    .lean();

  // Also include anyone who owns verified active dustbins (dumpster operators).
  const binOwners = await Dustbin.distinct("user", {
    verify: true,
    status: "active",
  });
  const existingIds = new Set(users.map((u) => String(u._id)));
  const missingOwnerIds = binOwners
    .map(String)
    .filter((id) => id && !existingIds.has(id));
  if (missingOwnerIds.length) {
    const extra = await User.find({
      _id: { $in: missingOwnerIds.map((id) => new mongoose.Types.ObjectId(id)) },
    })
      .select("_id name email insuranceFile insuranceExpiryDate isInsured junkRemoval role type status")
      .lean();
    users.push(...extra);
  }

  const junkIds = users
    .map((u) => u.junkRemoval)
    .filter(Boolean);
  const junkDocs = junkIds.length
    ? await JunkRemoval.find({ _id: { $in: junkIds } })
        .select("userId COI insurance_expiry_date")
        .lean()
    : [];
  const junkByUser = new Map(
    junkDocs.map((j) => [String(j.userId), j]),
  );

  let scanned = 0;
  let wouldUpdate = 0;
  let updated = 0;
  let withFile = 0;
  let expired = 0;

  for (const user of users) {
    scanned += 1;
    const resolved = await resolveForUser(user._id, junkByUser);
    if (!resolved.insuranceFile && !resolved.insuranceExpiryDate) continue;

    const patch = {};
    if (resolved.insuranceFile && !user.insuranceFile) {
      patch.insuranceFile = resolved.insuranceFile;
    }
    if (resolved.insuranceExpiryDate && !user.insuranceExpiryDate) {
      patch.insuranceExpiryDate = resolved.insuranceExpiryDate;
    }
    if (user.isInsured !== resolved.isInsured) {
      patch.isInsured = resolved.isInsured;
    }

    if (Object.keys(patch).length === 0) {
      if (resolved.insuranceFile) withFile += 1;
      if (resolved.insuranceExpiryDate && resolved.insuranceExpiryDate < startOfToday()) {
        expired += 1;
      }
      continue;
    }

    wouldUpdate += 1;
    if (resolved.insuranceFile) withFile += 1;
    if (resolved.isInsured === false && resolved.insuranceFile) expired += 1;

    console.log(
      `${APPLY ? "UPDATE" : "WOULD UPDATE"} ${user._id} ${user.email || user.name || ""}`,
      patch,
    );

    if (APPLY) {
      await User.updateOne({ _id: user._id }, { $set: patch });
      updated += 1;
    }
  }

  console.log(
    JSON.stringify(
      {
        scanned,
        wouldUpdate,
        updated,
        withFile,
        expiredOrUninsured: expired,
        apply: APPLY,
      },
      null,
      2,
    ),
  );

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
