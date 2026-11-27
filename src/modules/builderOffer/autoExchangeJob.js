import Order from "../../models/Order.js";
import BuilderOffer from "../../models/BuilderOffer.js";
import { createSwapRequest } from "../company/commercialService.js";
import { resolveExchangeTurnaroundWindow } from "../../utils/exchangeTurnaroundWindow.js";
import { triggerScheduledContractInvoice } from "../../utils/builderOfferBilling.js";
import logger from "../../config/logger.js";

/**
 * Automatic empty & redeliver for commercial dumpster orders
 * created from Builder Offers with exchangeMode=automatic.
 * Respects contract estimatedLoads limit and failed-payment rotation pause.
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
    .select(
      "_id user commercialSize metadata swapRequest builderOffer loadSequenceNumber estimatedLoads",
    )
    .limit(50)
    .lean();

  let created = 0;
  let skipped = 0;
  let failed = 0;

  for (const order of candidates) {
    try {
      const meta = order.metadata || {};
      const currentLoad =
        Number(order.loadSequenceNumber || meta.loadSequenceNumber) || 1;
      let maxLoads =
        Number(order.estimatedLoads || meta.estimatedLoads) || null;

      let offer = null;
      if (order.builderOffer) {
        offer = await BuilderOffer.findById(order.builderOffer).select(
          "estimatedLoads loadsCompleted rotationsPaused rotationsPausedReason",
        );
        if (offer) {
          if (offer.rotationsPaused) {
            skipped += 1;
            continue;
          }
          if (!maxLoads && offer.estimatedLoads) {
            maxLoads = Number(offer.estimatedLoads);
          }
        }
      }

      if (maxLoads && currentLoad >= maxLoads) {
        skipped += 1;
        await Order.updateOne(
          { _id: order._id },
          { $unset: { "metadata.nextExchangeAt": "" } },
        );
        continue;
      }

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

      const nextLoadNumber = currentLoad + 1;
      const userId = order.user?._id || order.user;
      const { dropoffOrder } = await createSwapRequest(userId, order._id, {
        sameSize: true,
        size: order.commercialSize,
        windowStart: windowStart.toISOString(),
        windowEnd: windowEnd.toISOString(),
        notes: `Automatic empty & redeliver (Load #${nextLoadNumber}${maxLoads ? ` of ${maxLoads}` : ""}) per commercial schedule.`,
      });

      const everyDays = Math.max(1, Number(meta.exchangeEveryDays) || 3);
      const next = new Date(windowStart);
      next.setDate(next.getDate() + everyDays);
      const moreLoadsAfterNext = !maxLoads || nextLoadNumber < maxLoads;

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
              loadSequenceNumber: nextLoadNumber,
              estimatedLoads: maxLoads || nextLoadNumber,
              builderOffer: order.builderOffer || null,
              "metadata.loadSequenceNumber": nextLoadNumber,
              ...(maxLoads ? { "metadata.estimatedLoads": maxLoads } : {}),
              ...(moreLoadsAfterNext ? { "metadata.nextExchangeAt": next } : {}),
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

      if (offer?._id) {
        offer.loadsCompleted = Math.max(
          Number(offer.loadsCompleted) || 0,
          currentLoad,
        );
        await offer.save().catch(() => {});

        // Settle/open scheduled installment for this next rotation or grouped batch
        await triggerScheduledContractInvoice({
          offerId: offer._id,
          triggerType:
            offer.billingMode === "grouped_loads" ? "grouped_loads" : "load",
          loadNumber: nextLoadNumber,
          orderId: dropoffOrder?._id || order._id,
        }).catch((billErr) =>
          logger.warn("auto_exchange.installment_trigger_failed", {
            offerId: String(offer._id),
            error: billErr?.message,
          }),
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
