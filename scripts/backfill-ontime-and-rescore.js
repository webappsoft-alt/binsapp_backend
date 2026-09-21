/**
 * Backfill `onTime` on historical JOB_COMPLETED events and recompute operator
 * scores.
 *
 * Why: on-time tracking was added after some jobs were already completed, so
 * those events have `onTime: undefined` and were being counted as "late",
 * unfairly lowering operator scores. This recomputes `onTime` for every
 * JOB_COMPLETED event from its order's end date (using the same end-of-day rule
 * as live scoring) and then re-runs the score engine for each affected operator.
 *
 * Usage:
 *   node scripts/backfill-ontime-and-rescore.js            # dry run
 *   node scripts/backfill-ontime-and-rescore.js --apply    # write changes
 *   node scripts/backfill-ontime-and-rescore.js --apply <phoneOrUserId>
 */
import "dotenv/config";
import mongoose from "mongoose";
import { isDeliveredOnTime } from "../src/utils/deliveryTiming.js";
import { ScoreEngine } from "../src/modules/scoring/scoreEngine.js";

const APPLY = process.argv.includes("--apply");
const FILTER = process.argv.find((a) => a !== "--apply" && a.indexOf("node") === -1 && !a.endsWith(".js"));

async function resolveOperatorId(db, filter) {
  if (!filter) return null;
  if (/^[0-9a-fA-F]{24}$/.test(filter)) {
    return new mongoose.Types.ObjectId(filter);
  }
  const user = await db.collection("users").findOne({
    $or: [
      { phone: filter },
      { phone: `+${filter}` },
      { phone: { $regex: `${filter}$` } },
    ],
  });
  return user?._id || null;
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;
  const JobEvents = db.collection("jobevents");
  const Orders = db.collection("orders");

  const operatorFilter = await resolveOperatorId(db, FILTER);
  if (FILTER && !operatorFilter) {
    console.error(`No user found for "${FILTER}".`);
    await mongoose.disconnect();
    process.exit(1);
  }

  const match = { eventType: "JOB_COMPLETED" };
  if (operatorFilter) match.operatorId = operatorFilter;

  const events = await JobEvents.find(match).toArray();
  console.log(
    `${APPLY ? "APPLY" : "DRY RUN"} — ${events.length} JOB_COMPLETED event(s)${
      operatorFilter ? ` for operator ${operatorFilter}` : ""
    }`,
  );

  const affectedOperators = new Set();
  let changed = 0;

  for (const ev of events) {
    const order = ev.orderId
      ? await Orders.findOne(
          { _id: ev.orderId },
          { projection: { orderNumber: 1, end_date: 1, new_end_date: 1 } },
        )
      : null;
    const effectiveEnd = order?.new_end_date || order?.end_date || null;
    const completedAtMs = ev.createdAt
      ? new Date(ev.createdAt).getTime()
      : Date.now();
    const onTime = isDeliveredOnTime(effectiveEnd, completedAtMs);

    if (ev.onTime !== onTime) {
      changed++;
      console.log(
        `  ${order?.orderNumber || ev.orderId}: onTime ${ev.onTime} -> ${onTime}`,
      );
      if (APPLY) {
        await JobEvents.updateOne({ _id: ev._id }, { $set: { onTime } });
      }
    }
    if (ev.operatorId) affectedOperators.add(ev.operatorId.toString());
  }

  console.log(
    `\n${changed} event(s) ${APPLY ? "updated" : "would change"}; ${affectedOperators.size} operator(s) to rescore.`,
  );

  if (APPLY && affectedOperators.size > 0) {
    for (const opId of affectedOperators) {
      try {
        const stats = await ScoreEngine.calculateOperatorScore(opId);
        console.log(
          `  rescored ${opId}: score=${stats.score} tier=${stats.tier} onTimeRate=${stats.onTimeRate}`,
        );
      } catch (err) {
        console.error(`  rescore failed for ${opId}:`, err.message);
      }
    }
  }

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error("backfill failed:", err);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});
