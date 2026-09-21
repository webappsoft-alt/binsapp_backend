/**
 * Recompute owner-facing `Order.amount` using the canonical payout split
 * (add-ons to admin first, then 15% commission on the remaining base).
 *
 * Fixes historical orders created before the split fix, where `amount` was
 * stored as `price * 0.85` (15% taken on the FULL total including add-ons).
 *
 * Safe by default: DRY RUN (prints changes only). Pass --apply to persist.
 * Only touches orders that are not yet settled/closed (not completed,
 * cancelled, refunded, and not already transferred).
 *
 * Usage:
 *   node scripts/backfill-order-amount.js            # dry run
 *   node scripts/backfill-order-amount.js --apply     # write changes
 *   node scripts/backfill-order-amount.js --apply --order QQadu
 */
import "dotenv/config";
import mongoose from "mongoose";
import { computeSplit } from "../src/utils/paymentHold.js";

const APPLY = process.argv.includes("--apply");
const orderFlagIdx = process.argv.indexOf("--order");
const ONLY_ORDER = orderFlagIdx !== -1 ? process.argv[orderFlagIdx + 1] : null;

const CLOSED_STATUSES = ["completed", "cancelled", "canceled", "refunded"];

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  const Orders = mongoose.connection.db.collection("orders");

  const query = {
    status: { $nin: CLOSED_STATUSES },
    transfer: { $ne: true },
    price: { $gt: 0 },
  };
  if (ONLY_ORDER) query.orderNumber = ONLY_ORDER;

  const orders = await Orders.find(query).toArray();
  console.log(
    `${APPLY ? "APPLY" : "DRY RUN"} — evaluating ${orders.length} open order(s)\n`,
  );

  let changed = 0;
  for (const o of orders) {
    const { amount: correct, privacyAmount } = computeSplit(o.price, {
      driveaway: o.driveaway,
      cancelation: o.cancelation,
    });
    const rounded = Math.round(correct * 100) / 100;
    const current = Number(o.amount);
    if (Math.abs(current - rounded) < 0.005) continue;

    changed++;
    console.log(
      `#${o.orderNumber} price=${o.price} addons=${privacyAmount} ` +
        `amount ${current} -> ${rounded} (status=${o.status})`,
    );
    if (APPLY) {
      await Orders.updateOne({ _id: o._id }, { $set: { amount: rounded } });
    }
  }

  console.log(
    `\n${changed} order(s) ${APPLY ? "updated" : "would change"}.` +
      (APPLY ? "" : " Re-run with --apply to persist."),
  );
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
