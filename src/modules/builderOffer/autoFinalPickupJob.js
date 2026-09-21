import Order from "../../models/Order.js";
import OrderTimeline from "../../models/OrderTimeline.js";
import { orderMessages, timelineEntry } from "../../utils/orderMessages.js";
import { sendNotification } from "../../utils/notifications.js";
import { formatOrderPayload, PRICING_ROLES } from "../../utils/orderPricing.js";
import logger from "../../config/logger.js";

async function getIo() {
  try {
    const mod = await import("../../socket/socket.js");
    return mod.io;
  } catch {
    return null;
  }
}

/**
 * Automatic final pickup for commercial dumpster orders with
 * finalPickupMode=scheduled_end_date when finalPickupDate is due.
 * Marks readyToPickup (same outcome as builder "Request Pickup").
 */
export async function runScheduledFinalPickupScan() {
  const now = new Date();
  const candidates = await Order.find({
    status: "accepted",
    company: { $ne: null },
    service_type: "Dumbster",
    "metadata.finalPickupMode": "scheduled_end_date",
    "metadata.finalPickupDate": { $lte: now },
    readyToPickup: { $ne: true },
    "metadata.finalPickupTriggeredAt": { $exists: false },
  })
    .populate(["user", "to_id"])
    .limit(50);

  let marked = 0;
  let failed = 0;

  for (const order of candidates) {
    try {
      order.readyToPickup = true;
      order.metadata = {
        ...(order.metadata?.toObject?.() || order.metadata || {}),
        finalPickupTriggeredAt: now,
        finalPickupTrigger: "scheduled_end_date",
      };
      order.markModified("metadata");
      await order.save();

      const pickupCopy = orderMessages.readyForPickup({
        customerName: order.user?.name,
        serviceType: order.service_type,
        order,
      });

      await OrderTimeline.create({
        order: order._id,
        orderDeatil: order,
        ...timelineEntry(pickupCopy),
      });

      const orderId = order._id.toString();
      const notifyPromises = [];
      if (order.user?._id && order.to_id?._id) {
        notifyPromises.push(
          sendNotification({
            user: order.user._id.toString(),
            to_id: order.to_id._id.toString(),
            description: `${pickupCopy.operator.description} (automatic final pickup)`,
            type: "order",
            title: pickupCopy.operator.title,
            fcmtoken: order.to_id.fcmtoken,
            order: orderId,
            noti: false,
            email: "",
          }),
        );
        notifyPromises.push(
          sendNotification({
            user: order.user._id.toString(),
            to_id: order.user._id.toString(),
            description: `${pickupCopy.customer.description} (automatic final pickup on scheduled end date)`,
            type: "order",
            title: pickupCopy.customer.title,
            fcmtoken: order.user.fcmtoken,
            order: orderId,
            noti: false,
            email: "",
          }),
        );
      }
      await Promise.allSettled(notifyPromises);

      const io = await getIo();
      if (io && order.user?._id) {
        io.to(`user_${order.user._id.toString()}`).emit("update-order-rentee", {
          success: true,
          order: formatOrderPayload(order, PRICING_ROLES.CUSTOMER),
          title: pickupCopy.customer.title,
          message: "Automatic final pickup scheduled for today.",
        });
      }
      if (io && order.to_id?._id) {
        io.to(`user_${order.to_id._id.toString()}`).emit(
          "update-order-renter",
          {
            success: true,
            order: formatOrderPayload(order, PRICING_ROLES.OWNER),
            title: pickupCopy.operator.title,
            message: "Customer dumpster is ready for final pickup (scheduled).",
          },
        );
      }

      marked += 1;
    } catch (err) {
      failed += 1;
      logger.warn("final_pickup.order_failed", {
        orderId: String(order._id),
        message: err?.message,
      });
    }
  }

  return { scanned: candidates.length, marked, failed };
}
