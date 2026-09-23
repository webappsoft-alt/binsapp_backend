import cron from "node-cron";
import Order from "../models/Order.js";
import User from "../models/User.js";
import { sendNotification } from "./notifications.js";
import { orderMessages } from "./orderMessages.js";
import logger from "../config/logger.js";

const WINDOW_MS = 24 * 60 * 60 * 1000;
const NOTIFY_BATCH_SIZE = 50;

function endDateReminderKey(endDate) {
  return new Date(endDate).toISOString();
}

function shouldSendReminder(order) {
  const sentFor = order.metadata?.expiryReminderSentForEndDate;
  if (!sentFor) return true;
  return sentFor !== endDateReminderKey(order.end_date);
}

async function processExpiryReminder(order, adminUser) {
  const rate = Number(order.dustbin?.order_extension_price);
  if (!Number.isFinite(rate) || rate <= 0) {
    logger.warn(
      `Skipping expiry reminder for order ${order._id}: missing extension rate`,
    );
    return;
  }

  const orderId = order._id.toString();
  const customerId =
    order.user?._id?.toString() || order.user?.toString() || "";
  if (!customerId) {
    logger.warn(
      `Skipping expiry reminder for order ${order._id}: customer not found`,
    );
    return;
  }

  const copy = orderMessages.rentalEndingSoon({
    customerName: order.user?.name || "Customer",
    serviceType: order.service_type,
    order,
    dailyRate: rate,
  });

  const customerLink = `https://api.binsapp.ai/customer-orders?orderId=${orderId}&action=extend`;
  const ownerLink = `https://api.binsapp.ai/owner-orders?orderId=${orderId}`;

  const notifyPromises = [
    sendNotification({
      user: customerId,
      to_id: customerId,
      description: copy.customer.description,
      type: "order",
      title: copy.customer.title,
      fcmtoken: order.user?.fcmtoken || "",
      order: orderId,
      email: "",
      metadata: {
        action: "extend_rental",
        orderId,
        link: customerLink,
      },
    }),
  ];

  const operatorId =
    order.to_id?._id?.toString() || order.to_id?.toString() || "";
  if (operatorId) {
    notifyPromises.push(
      sendNotification({
        user: customerId,
        to_id: operatorId,
        description: copy.operator.description,
        type: "order",
        title: copy.operator.title,
        fcmtoken: order.to_id?.fcmtoken || "",
        order: orderId,
        email: order.to_id?.email || "",
        metadata: {
          action: "rental_ending_soon",
          orderId,
          link: ownerLink,
        },
      }),
    );
  }

  if (adminUser) {
    notifyPromises.push(
      sendNotification({
        user: customerId,
        to_id: adminUser._id.toString(),
        description: copy.admin.description,
        type: "order",
        title: copy.admin.title,
        fcmtoken: adminUser.fcmtoken || "",
        order: orderId,
        email: "",
        metadata: {
          action: "rental_ending_soon",
          orderId,
        },
      }),
    );
  }

  await Promise.all(notifyPromises);

  const existingMeta = { ...(order.metadata || {}) };
  await Order.findByIdAndUpdate(order._id, {
    $set: {
      metadata: {
        ...existingMeta,
        expiryReminderSentForEndDate: endDateReminderKey(order.end_date),
      },
    },
  });
}

export async function runRentalExpiryReminderCheck() {
  const now = new Date();
  const windowEnd = new Date(now.getTime() + WINDOW_MS);

  const [orders, adminUser] = await Promise.all([
    Order.find({
      status: "accepted",
      service_type: {$in: ["Dumbster", "Porta Potty"]},
      readyToPickup: false,
      dustbin: { $ne: null },
      end_date: { $gt: now, $lte: windowEnd },
    })
      .populate("user", "name fcmtoken")
      .populate("to_id", "fcmtoken email")
      .populate("dustbin", "order_extension_price")
      .lean(),
    User.findOne({ $or: [{ type: "admin" }, { role: "admin" }] })
      .select("fcmtoken")
      .lean(),
  ]);

  const eligible = orders.filter(shouldSendReminder);
  if (!eligible.length) {
    logger.info("No rental expiry reminders to send");
    return { evaluated: orders.length, sent: 0 };
  }

  let sent = 0;
  for (let i = 0; i < eligible.length; i += NOTIFY_BATCH_SIZE) {
    const batch = eligible.slice(i, i + NOTIFY_BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map((order) => processExpiryReminder(order, adminUser)),
    );
    sent += results.filter((r) => r.status === "fulfilled").length;
  }

  logger.info(
    `Rental expiry reminders complete: ${sent}/${eligible.length} sent`,
  );
  return { evaluated: orders.length, sent };
}

/**
 * Hourly cron: notify customer, operator, and admin when rental ends within 24h.
 */
export function scheduleRentalExpiryReminders() {
  cron.schedule("0 * * * *", async () => {
    logger.info("Rental expiry reminder cron triggered");
    try {
      await runRentalExpiryReminderCheck();
    } catch (error) {
      logger.error("Rental expiry reminder cron failed", error);
    }
  });
  logger.info("Rental expiry reminder cron scheduled (hourly)");
}
