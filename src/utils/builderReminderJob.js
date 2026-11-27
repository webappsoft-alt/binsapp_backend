import cron from "node-cron";
import Order from "../models/Order.js";
import BillingRecord from "../models/BillingRecord.js";
import { sendNotification } from "./notifications.js";
import { buttonTemplate } from "./emailTemplate.js";
import logger from "../config/logger.js";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

function toYmd(date) {
  return new Date(date).toISOString().slice(0, 10);
}

/**
 * 1. Provider & Driver Pre-Dispatch Window Reminders (30-60 min before delivery or pickup)
 */
export async function runDispatchPreWindowReminders() {
  const now = new Date();
  const minAhead = new Date(now.getTime() + 15 * 60 * 1000);
  const maxAhead = new Date(now.getTime() + 75 * 60 * 1000);

  const orders = await Order.find({
    status: "accepted",
    $or: [
      { start_date: { $gte: minAhead, $lte: maxAhead } },
      { end_date: { $gte: minAhead, $lte: maxAhead } },
      { "pickupWorkflow.scheduledDate": { $gte: minAhead, $lte: maxAhead } },
      { "metadata.finalPickupDate": { $gte: minAhead, $lte: maxAhead } },
    ],
  })
    .populate("user", "name phone")
    .populate("to_id", "name fcmtoken email")
    .populate({
      path: "assignOrder",
      populate: { path: "subUserDetail", select: "_id name fcmtoken email" },
    })
    .limit(60);

  let sent = 0;

  for (const order of orders) {
    try {
      const meta = { ...(order.metadata?.toObject?.() || order.metadata || {}) };
      const orderNum =
        order.orderNumber || String(order._id).slice(-6).toUpperCase();
      const siteLabel = order.address || "Jobsite";
      const customerId = order.user?._id?.toString() || order.user?.toString();
      const ownerId = order.to_id?._id?.toString() || order.to_id?.toString();
      const driverUser = order.assignOrder?.subUserDetail;
      const driverId = driverUser?._id?.toString();

      let changed = false;

      // Pre-delivery reminder
      const startDt = order.start_date ? new Date(order.start_date) : null;
      const isDelivered = Boolean(
        order.dropoffimage || order.deliveryWorkflow?.deliveredAt,
      );
      if (
        !isDelivered &&
        startDt &&
        startDt >= minAhead &&
        startDt <= maxAhead &&
        meta.preDeliveryReminderSentFor !== startDt.toISOString()
      ) {
        const title = `Dispatch Reminder: Delivery Due Soon (#${orderNum})`;
        const desc = `Delivery at ${siteLabel} is scheduled within the next hour${order.deliveryWindow ? ` (${order.deliveryWindow})` : ""}.`;
        const targets = [
          ownerId
            ? {
                id: ownerId,
                fcm: order.to_id?.fcmtoken || "",
                email: order.to_id?.email || "",
              }
            : null,
          driverId && driverId !== ownerId
            ? {
                id: driverId,
                fcm: driverUser?.fcmtoken || "",
                email: "",
              }
            : null,
        ].filter(Boolean);

        await Promise.allSettled(
          targets.map((tgt) =>
            sendNotification({
              user: customerId || tgt.id,
              to_id: tgt.id,
              title,
              description: desc,
              type: "dispatch_reminder",
              order: order._id.toString(),
              fcmtoken: tgt.fcm,
              email: tgt.email,
              metadata: {
                kind: "dispatch_reminder",
                phase: "delivery",
                orderId: order._id.toString(),
              },
            }),
          ),
        );
        meta.preDeliveryReminderSentFor = startDt.toISOString();
        changed = true;
        sent += 1;
      }

      // Pre-pickup reminder
      const pickupTarget =
        order.pickupWorkflow?.scheduledDate ||
        order.metadata?.finalPickupDate ||
        order.end_date;
      const pickupDt = pickupTarget ? new Date(pickupTarget) : null;
      if (
        pickupDt &&
        pickupDt >= minAhead &&
        pickupDt <= maxAhead &&
        meta.prePickupReminderSentFor !== pickupDt.toISOString()
      ) {
        const title = `Pickup Reminder: Scheduled Pull Soon (#${orderNum})`;
        const desc = `Pickup at ${siteLabel} is scheduled within the next hour. Confirm truck dispatch and scale ticket readiness.`;
        const targets = [
          ownerId
            ? {
                id: ownerId,
                fcm: order.to_id?.fcmtoken || "",
                email: order.to_id?.email || "",
              }
            : null,
          driverId && driverId !== ownerId
            ? {
                id: driverId,
                fcm: driverUser?.fcmtoken || "",
                email: "",
              }
            : null,
        ].filter(Boolean);

        await Promise.allSettled(
          targets.map((tgt) =>
            sendNotification({
              user: customerId || tgt.id,
              to_id: tgt.id,
              title,
              description: desc,
              type: "dispatch_reminder",
              order: order._id.toString(),
              fcmtoken: tgt.fcm,
              email: tgt.email,
              metadata: {
                kind: "dispatch_reminder",
                phase: "pickup",
                orderId: order._id.toString(),
              },
            }),
          ),
        );
        meta.prePickupReminderSentFor = pickupDt.toISOString();
        changed = true;
        sent += 1;
      }

      if (changed) {
        await Order.findByIdAndUpdate(order._id, { $set: { metadata: meta } });
      }
    } catch (err) {
      logger.warn("builderReminder.dispatch_failed", {
        orderId: String(order._id),
        error: err?.message,
      });
    }
  }

  return { evaluated: orders.length, sent };
}

/**
 * 2. Customer Pre-Extra-Day Advance Warning before midnight per-diem charges accrue
 */
export async function runPreExtraDayCustomerWarnings() {
  const now = new Date();
  const todayStr = toYmd(now);
  const cutoffEnd = new Date(now.getTime() + 12 * HOUR_MS);

  const orders = await Order.find({
    status: "accepted",
    service_type: { $in: ["Dumbster", "Porta Potty"] },
    readyToPickup: false,
    end_date: { $lte: cutoffEnd },
  })
    .populate("user", "name email fcmtoken")
    .populate("dustbin", "order_extension_price")
    .limit(60);

  let sent = 0;

  for (const order of orders) {
    try {
      const meta = { ...(order.metadata?.toObject?.() || order.metadata || {}) };
      if (meta.extraDayWarningSentForDate === todayStr) continue;

      const customerId = order.user?._id?.toString() || order.user?.toString();
      if (!customerId) continue;

      const rate =
        Number(order.perDiemRateSnapshot) ||
        Number(order.dustbin?.order_extension_price) ||
        20;
      const orderNum =
        order.orderNumber || String(order._id).slice(-6).toUpperCase();
      const title = `Extra Day Charges Starting Tonight (#${orderNum})`;
      const desc = `Your rental end date (${toYmd(order.end_date)}) is reached. Request pickup before midnight or an extra $${rate}/day charge will accrue.`;
      const link = `https://api.binsapp.ai/customer-orders?orderId=${order._id.toString()}`;

      await sendNotification({
        user: customerId,
        to_id: customerId,
        title,
        description: desc,
        type: "extra_day_warning",
        order: order._id.toString(),
        fcmtoken: order.user?.fcmtoken || "",
        email: order.user?.email || "",
        customEmailTemplate: Boolean(order.user?.email),
        html: buttonTemplate(link, title, desc),
        metadata: {
          kind: "extra_day_warning",
          orderId: order._id.toString(),
          dailyRate: rate,
          link,
        },
      });

      meta.extraDayWarningSentForDate = todayStr;
      await Order.findByIdAndUpdate(order._id, { $set: { metadata: meta } });
      sent += 1;
    } catch (err) {
      logger.warn("builderReminder.extra_day_warning_failed", {
        orderId: String(order._id),
        error: err?.message,
      });
    }
  }

  return { evaluated: orders.length, sent };
}

/**
 * 3. Invoice Due Soon & Failed Payment Retry Reminders
 */
export async function runInvoiceDueAndFailedReminders() {
  const now = new Date();
  const next24h = new Date(now.getTime() + DAY_MS);

  const dueOrFailed = await BillingRecord.find({
    $or: [
      { status: { $in: ["open", "due"] }, dueDate: { $gt: now, $lte: next24h } },
      { status: "failed" },
    ],
  })
    .populate("user", "name email fcmtoken")
    .limit(60);

  let sent = 0;

  for (const inv of dueOrFailed) {
    try {
      const meta = { ...(inv.metadata || {}) };
      const recipient = inv.user?._id?.toString() || inv.user?.toString();
      if (!recipient) continue;
      const invNum = inv.invoiceNumber || String(inv._id).slice(-8);

      if (inv.status === "failed") {
        const lastSent = meta.failedReminderLastSentAt
          ? new Date(meta.failedReminderLastSentAt).getTime()
          : 0;
        if (now.getTime() - lastSent < DAY_MS) continue;

        const title = `Payment Failed — Action Required (${invNum})`;
        const desc = `Automatic charge for $${Number(inv.amount || 0).toFixed(2)} failed. Retry payment or update your card so scheduled rotations remain active.`;
        await sendNotification({
          user: recipient,
          to_id: recipient,
          title,
          description: desc,
          type: "payment_failed",
          fcmtoken: inv.user?.fcmtoken || "",
          email: inv.user?.email || "",
          isImportant: true,
          metadata: {
            kind: "builder_offer",
            billingId: inv._id.toString(),
            builderOfferId: inv.contract ? inv.contract.toString() : meta.builderOfferId,
            invoiceNumber: invNum,
          },
        });
        meta.failedReminderLastSentAt = now.toISOString();
        await BillingRecord.findByIdAndUpdate(inv._id, { $set: { metadata: meta } });
        sent += 1;
      } else {
        const dueKey = toYmd(inv.dueDate);
        if (meta.dueReminderSentForDate === dueKey) continue;

        const title = `Commercial Invoice Due Within 24h (${invNum})`;
        const desc = `Invoice ${invNum} for $${Number(inv.amount || 0).toFixed(2)} is due on ${dueKey}.`;
        await sendNotification({
          user: recipient,
          to_id: recipient,
          title,
          description: desc,
          type: "invoice_due",
          fcmtoken: inv.user?.fcmtoken || "",
          email: inv.user?.email || "",
          metadata: {
            kind: "builder_offer",
            billingId: inv._id.toString(),
            builderOfferId: inv.contract ? inv.contract.toString() : meta.builderOfferId,
            invoiceNumber: invNum,
          },
        });
        meta.dueReminderSentForDate = dueKey;
        await BillingRecord.findByIdAndUpdate(inv._id, { $set: { metadata: meta } });
        sent += 1;
      }
    } catch (err) {
      logger.warn("builderReminder.invoice_reminder_failed", {
        billingId: String(inv._id),
        error: err?.message,
      });
    }
  }

  return { evaluated: dueOrFailed.length, sent };
}

export function scheduleBuilderReminders() {
  cron.schedule("*/15 * * * *", async () => {
    try {
      await runDispatchPreWindowReminders();
    } catch (err) {
      logger.error("builderReminder.dispatch_cron_error", err);
    }
  });

  cron.schedule("45 * * * *", async () => {
    try {
      await runPreExtraDayCustomerWarnings();
      await runInvoiceDueAndFailedReminders();
    } catch (err) {
      logger.error("builderReminder.hourly_cron_error", err);
    }
  });

  logger.info("Builder dispatch, extra-day warning & invoice reminders scheduled");
}
