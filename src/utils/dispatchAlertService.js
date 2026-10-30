import { sendNotification } from "./notifications.js";
import { sendSMS } from "./sendSMS.js";
import { buttonTemplate } from "./emailTemplate.js";
import logger from "../config/logger.js";

async function getIo() {
  try {
    const mod = await import("../socket/socket.js");
    return mod.io;
  } catch {
    return null;
  }
}

/**
 * Standard preset message templates for dumpster dispatch operations
 */
export const DISPATCH_ALERT_PRESETS = {
  driver_on_way: {
    title: "Driver On The Way",
    customerText: (order, link) =>
      `Your Bins & Dumpsters driver is on the way with your dumpster to ${order.address || "your jobsite"}.${
        link ? ` Track live: ${link}` : ""
      }`,
    smsText: (order, link) =>
      `Bins & Dumpsters: Driver is on the way to ${order.address || "your site"} with your dumpster.${
        link ? ` Track: ${link}` : ""
      }`,
  },
  eta_15: {
    title: "Driver Arriving in 15-20 Mins",
    customerText: (order) =>
      `Your driver is approximately 15-20 minutes away from ${order.address || "your jobsite"}.`,
    smsText: (order) =>
      `Bins & Dumpsters: Driver is arriving in ~15-20 mins at ${order.address || "your site"}.`,
  },
  clear_driveway: {
    title: "Please Clear Driveway & Unlock Gate",
    customerText: (order) =>
      `The hauling truck is arriving soon at ${order.address || "your location"}. Please ensure vehicles are moved and gates are unlocked for safe container placement.`,
    smsText: (order) =>
      `Bins & Dumpsters: Truck arriving soon at ${order.address || "your site"}. Please clear driveway and unlock gates for safe container placement.`,
  },
  driver_arrived: {
    title: "Driver On Site",
    customerText: (order) =>
      `The driver has arrived on site at ${order.address || "your address"}. Delivery/pickup is in progress.`,
    smsText: (order) =>
      `Bins & Dumpsters: Driver has arrived on site at ${order.address || "your site"}. Placement in progress.`,
  },
  dropoff_done: {
    title: "Dumpster Delivered & Placed",
    customerText: (order, link) =>
      `Your dumpster has been safely placed at ${order.address || "your address"}.${
        link ? ` View placement photo: ${link}` : ""
      }`,
    smsText: (order, link) =>
      `Bins & Dumpsters: Your dumpster has been placed at ${order.address || "your site"}.${
        link ? ` Photo proof: ${link}` : ""
      }`,
  },
  pickup_en_route: {
    title: "Driver En Route for Pickup",
    customerText: (order) =>
      `A driver is en route to collect the dumpster from ${order.address || "your address"}. Please ensure the container is accessible.`,
    smsText: (order) =>
      `Bins & Dumpsters: Driver is en route to collect the dumpster at ${order.address || "your site"}. Please keep access clear.`,
  },
};

/**
 * Dispatches an automated or manual notification across Push, In-App, SMS, and Email
 *
 * @param {Object} params
 * @param {Object} params.order - The order document (populated with user/company/to_id)
 * @param {string} params.alertType - Preset key or 'custom'
 * @param {string} [params.customMessage] - Custom message if alertType === 'custom' or override
 * @param {string} [params.title] - Optional title override
 * @param {boolean} [params.sendSms=true] - Whether to send SMS
 * @param {boolean} [params.sendPush=true] - Whether to send Push + In-App Notification
 * @param {string} [params.actionLink] - Optional URL for live tracking or proof photo
 * @param {string} [params.senderId] - ID of operator sending the alert
 */
export async function sendDispatchAlertToCustomer({
  order,
  alertType = "driver_on_way",
  customMessage = "",
  title = "",
  sendSms = true,
  sendPush = true,
  actionLink = "",
  senderId = "",
}) {
  if (!order) return { success: false, message: "Order required" };

  const customer = order.user || order.from_id;
  const customerId =
    customer?._id?.toString() ||
    (typeof customer === "string" ? customer : null);

  const customerPhone =
    order.company?.phone ||
    customer?.phone ||
    (typeof order.from_id === "object" ? order.from_id?.phone : null) ||
    "";

  const customerEmail =
    order.company?.email ||
    customer?.email ||
    (typeof order.from_id === "object" ? order.from_id?.email : null) ||
    "";

  const fcmtoken = customer?.fcmtoken || "";
  const orderRef =
    order.orderNumber || `#ORD-${String(order._id).slice(-6).toUpperCase()}`;

  const frontendBase = process.env.FRONTEND_URL || "https://binsapp.ai";
  const defaultActionLink = `${frontendBase}/track/${order.orderNumber || order._id}`;
  const effectiveActionLink = actionLink || defaultActionLink;

  // Resolve Title & Content
  const preset = DISPATCH_ALERT_PRESETS[alertType];
  const alertTitle =
    title ||
    preset?.title ||
    "Dispatch Update";

  const alertContent =
    customMessage ||
    (preset?.customerText ? preset.customerText(order, effectiveActionLink) : `Update for order ${orderRef}`);

  const smsContent =
    customMessage
      ? `Bins & Dumpsters: ${customMessage}`
      : (preset?.smsText ? preset.smsText(order, effectiveActionLink) : `Bins & Dumpsters update: ${alertContent}`);

  const results = {
    sms: null,
    push: null,
    inApp: null,
    realtimeSocket: null,
  };

  const fromUserId =
    senderId ||
    order.to_id?._id?.toString() ||
    order.to_id?.toString() ||
    "system";

  // 1. In-App Notification & Push Alert (FCM)
  if (sendPush && customerId) {
    try {
      await sendNotification({
        user: fromUserId,
        to_id: customerId,
        title: alertTitle,
        description: alertContent,
        type: "order",
        order: order._id.toString(),
        noti: true, // Always persist in customer's Notification inbox
        fcmtoken: fcmtoken,
        email: customerEmail,
        customEmailTemplate: Boolean(effectiveActionLink),
        html: effectiveActionLink
          ? buttonTemplate(effectiveActionLink, alertTitle, alertContent)
          : undefined,
        metadata: {
          action: "dispatch_alert",
          alertType,
          orderId: order._id.toString(),
          orderNumber: orderRef,
          link: effectiveActionLink || undefined,
        },
      });
      results.push = true;
      results.inApp = true;
    } catch (err) {
      logger.error("Error in push/inApp dispatch alert:", err);
      results.push = false;
    }
  }

  // 2. Real-time direct socket emission
  try {
    const io = await getIo();
    if (io && customerId) {
      io.to(`user_${customerId}`).emit("dispatch:alert", {
        orderId: order._id.toString(),
        orderNumber: orderRef,
        alertType,
        title: alertTitle,
        message: alertContent,
        link: actionLink,
        timestamp: new Date().toISOString(),
      });
      results.realtimeSocket = true;
    }
  } catch (err) {
    logger.error("Error emitting realtime dispatch:alert socket:", err);
  }

  // 3. Direct SMS Alert (via Twilio)
  if (sendSms && customerPhone) {
    try {
      const smsRes = await sendSMS({
        to: customerPhone,
        body: smsContent,
      });
      results.sms = smsRes;
    } catch (err) {
      logger.error("Error sending dispatch SMS:", err);
      results.sms = { success: false, error: err.message };
    }
  }

  return {
    success: true,
    results,
    alertTitle,
    alertContent,
    customerPhone: customerPhone ? `***${customerPhone.slice(-4)}` : null,
  };
}
