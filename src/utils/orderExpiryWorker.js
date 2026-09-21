import { createWorker } from "./bullmq.js";
import Order from "../models/Order.js";
import User from "../models/user.js";
import DispatchService from "./dispatchService.js";
import { releaseHold } from "./paymentHold.js";
import { sendNotification } from "./notifications.js";
import logger from "../config/logger.js";
import OrderTimeline from "../models/OrderTimeline.js";
import { orderMessages, timelineEntry } from "./orderMessages.js";
import TransactionModel from "../models/Transaction.js";

export const initOrderExpiryWorker = (io) => {
  return createWorker(
    "order-expiry",
    async (job) => {
      const { orderId, paymentId } = job.data;

      try {
        const order = await Order.findById(orderId).populate("user").lean();
        if (!order) {
          logger.warn(`Expiry job ${job.id}: order ${orderId} not found`);
          return { status: "not_found" };
        }

        if (order.to_id != null || order.status !== "pending") {
          logger.info(
            `Expiry job ${job.id} skipped: order ${orderId} already matched or terminal`,
          );
          return { status: "skipped", orderStatus: order.status };
        }

        if (paymentId) {
          await releaseHold(paymentId);

          // Reverse the booking-time hold debit so the customer's ledger nets
          // to zero (the hold was released, no money was actually taken).
          const bookingDebit = await TransactionModel.findOne({
            order: orderId,
            stripePaymentIntentId: paymentId,
            type: "debit",
          });
          if (bookingDebit) {
            const alreadyReversed = await TransactionModel.findOne({
              order: orderId,
              stripePaymentIntentId: paymentId,
              type: "credit",
              "metadata.flow": "booking_cancel_reversal",
            });
            if (!alreadyReversed) {
              await TransactionModel.create({
                user: bookingDebit.user,
                order: orderId,
                amount: bookingDebit.amount,
                type: "credit",
                stripePaymentIntentId: paymentId,
                metadata: {
                  source: "expiry_worker",
                  flow: "booking_cancel_reversal",
                  reason: "Hold released on expiry — booking authorization reversed",
                },
              });
            }
          }
        }

        const updated = await Order.findByIdAndUpdate(
          orderId,
          {
            $set: {
              status: "cancelled",
              "metadata.searchExpired": true,
              "metadata.searchExpiredAt": new Date(),
              "metadata.paymentHoldStatus": "cancelled",
            },
          },
          { new: true },
        );

        const expiryCopy = orderMessages.requestExpired({
          customerName: order.user?.name || "Customer",
          serviceType: order.service_type,
          order: updated || order,
        });

        await OrderTimeline.create({
          order: orderId,
          orderDeatil: updated,
          ...timelineEntry(expiryCopy),
        });

        await DispatchService.cancelRemainingWaves(orderId);

        const notifyPromises = [];
        const customerId =
          order.user?._id?.toString() || order.user?.toString();

        if (customerId) {
          notifyPromises.push(
            sendNotification({
              user: customerId,
              to_id: customerId,
              description: expiryCopy.customer.description,
              type: "order",
              title: expiryCopy.customer.title,
              fcmtoken: order.user?.fcmtoken || "",
              order: orderId,
              email: order.user?.email || "",
            }),
          );
          if (io) {
            io.to(`user_${customerId}`).emit("cancel-order-rentee", {
              success: true,
              order: updated,
              title: expiryCopy.customer.title,
              message: expiryCopy.customer.description,
            });
          }
        }

        if (order.userIds?.length) {
          for (const userId of order.userIds) {
            const opId = userId.toString();
            if (io) {
              io.to(`user_${opId}`).emit("cancel-order-renter", {
                success: true,
                order: updated,
                title: expiryCopy.operator.title,
                message: expiryCopy.operator.description,
              });
            }
            notifyPromises.push(
              sendNotification({
                user: customerId || opId,
                to_id: opId,
                description: expiryCopy.operator.description,
                type: "order",
                title: expiryCopy.operator.title,
                order: orderId,
                email: "",
                noti: false,
              }),
            );
          }
        }

        const adminUser = await User.findOne({
          $or: [{ type: "admin" }, { role: "admin" }],
        })
          .select("fcmtoken")
          .lean();

        if (adminUser) {
          if (io) {
            io.to(`user_${adminUser._id.toString()}`).emit("admin-noti", {
              success: true,
              title: expiryCopy.admin.title,
              message: expiryCopy.admin.description,
              type: "order",
            });
          }
          notifyPromises.push(
            sendNotification({
              user: customerId || adminUser._id.toString(),
              to_id: adminUser._id.toString(),
              description: expiryCopy.admin.description,
              type: "order",
              title: expiryCopy.admin.title,
              fcmtoken: adminUser?.fcmtoken || "",
              order: orderId,
              email: "",
            }),
          );
        }

        await Promise.all(notifyPromises).catch((err) =>
          logger.error("Expiry notifications failed", err),
        );

        return { status: "expired", orderId };
      } catch (error) {
        logger.error(`Order expiry worker failed for ${orderId}`, error);
        throw error;
      }
    },
    { concurrency: 5 },
  );
};
