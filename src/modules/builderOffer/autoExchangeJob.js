import Order from "../../models/Order.js";
import { createSwapRequest } from "../company/commercialService.js";
import { resolveExchangeTurnaroundWindow } from "../../utils/exchangeTurnaroundWindow.js";
import logger from "../../config/logger.js";

/**
 * Automatic empty & redeliver for commercial dumpster orders
 * created from Builder Offers with exchangeMode=automatic.
 * Each run creates a swap (separate order + charge) via createSwapRequest.
 */
export async function runAutomaticExchangeScan() {
  const now = new Date();
  const candidates = await Order.find({
    status: "accepted",
    company: { $ne: null },
    service_type: "Dumbster",
    "metadata.exchangeMode": "automatic",
    "metadata.nextExchangeAt": { $lte: now },
    $or: [
      { "swapRequest.status": { $in: [null, "none", "cancelled"] } },
      { swapRequest: { $exists: false } },
    ],
  })
    .select("_id user commercialSize metadata swapRequest")
    .limit(50)
    .lean();

  let created = 0;
  let skipped = 0;
  let failed = 0;

  for (const order of candidates) {
    try {
      const meta = order.metadata || {};
      if (
        meta.finalPickupMode === "scheduled_end_date" &&
        meta.finalPickupDate &&
        new Date(meta.finalPickupDate) <= now
      ) {
        skipped += 1;
        continue;
      }

      const { windowStart, windowEnd } = resolveExchangeTurnaroundWindow(
        meta.exchangeTurnaround || "within_24_hours",
        {
          now,
          scheduledDate: meta.exchangeTurnaroundDate,
        },
      );

      const userId = order.user?._id || order.user;
      const { dropoffOrder } = await createSwapRequest(userId, order._id, {
        sameSize: true,
        size: order.commercialSize,
        windowStart: windowStart.toISOString(),
        windowEnd: windowEnd.toISOString(),
        notes:
          "Automatic empty & redeliver per commercial schedule. This is an additional order and charge.",
      });

      const everyDays = Math.max(1, Number(meta.exchangeEveryDays) || 3);
      const next = new Date(windowStart);
      next.setDate(next.getDate() + everyDays);

      // Parent becomes pickup; cadence continues on the replacement drop-off order.
      await Order.updateOne(
        { _id: order._id },
        {
          $set: {
            "metadata.lastAutoExchangeAt": now,
          },
          $unset: { "metadata.nextExchangeAt": "" },
        },
      );
      if (dropoffOrder?._id) {
        await Order.updateOne(
          { _id: dropoffOrder._id },
          {
            $set: {
              "metadata.nextExchangeAt": next,
              "metadata.lastAutoExchangeAt": now,
              "metadata.exchangeMode": "automatic",
              "metadata.exchangeEveryDays": everyDays,
              "metadata.exchangeTurnaround": meta.exchangeTurnaround,
              "metadata.exchangeTurnaroundDate": meta.exchangeTurnaroundDate,
              "metadata.exchangeTurnaroundCustom":
                meta.exchangeTurnaroundCustom || "",
            },
          },
        );
      }
      created += 1;
    } catch (err) {
      failed += 1;
      logger.warn("auto_exchange.order_failed", {
        orderId: String(order._id),
        message: err?.message,
      });
    }
  }

  return { scanned: candidates.length, created, skipped, failed };
}
