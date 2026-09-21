import { createWorker } from "./bullmq.js";
import Order from "../models/Order.js";
import User from "../models/user.js";
import { sendNotification } from "./notifications.js";
import logger from "../config/logger.js";
import { buttonTemplate } from "./emailTemplate.js";
import { orderMessages } from "./orderMessages.js";
import JobEvent from "../models/JobEvent.js";
import {
  formatOrderPayload,
  PRICING_ROLES,
} from "./orderPricing.js";

/**
 * Dispatch Worker: Executes staggered owner notification waves (Uber-style).
 */
export const initDispatchWorker = (io) => {
  return createWorker(
    "priority-dispatch",
    async (job) => {
      const { orderId, targetTier, operatorIds, customerId } = job.data;

      try {
        const order = await Order.findById(orderId).populate([
          "user",
          "dumbster",
          "dustbin",
          "to_id",
          {
            path: "assignOrder",
            populate: {
              path: "subUserDetail",
            },
          },
        ]);

        if (!order) {
          logger.warn(
            `Dispatch job ${job.id} failed: Order ${orderId} not found.`,
          );
          return { status: "not_found" };
        }

        if (order.to_id != null || order.status !== "pending") {
          logger.info(
            `Dispatch wave ${job.id} skipped: Order ${orderId} is matched or processed.`,
          );
          return {
            status: "already_processed",
            orderStatus: order.status,
            matched: order.to_id != null,
          };
        }

        const allowedOperatorIds = new Set(
          (order.userIds || []).map((id) => id.toString()),
        );
        const rejectedOperatorIds = new Set(
          (order.rejected_by || []).map((id) => id.toString()),
        );

        const eligibleOperatorIds = operatorIds.filter((id) => {
          const operatorId = id.toString();
          if (rejectedOperatorIds.has(operatorId)) return false;
          if (allowedOperatorIds.size > 0 && !allowedOperatorIds.has(operatorId)) {
            return false;
          }
          return true;
        });

        if (eligibleOperatorIds.length === 0) {
          logger.info(`Dispatch wave ${job.id} skipped: no eligible operators.`);
          return { status: "no_eligible_operators", tier: targetTier };
        }

        logger.info("dispatch.wave_executing", {
          orderId: orderId.toString(),
          targetTier,
          operatorCount: eligibleOperatorIds.length,
        });

        const waveCopy = orderMessages.dispatchWave({
          customerName: order.user?.name || "Customer",
          serviceType: order.service_type,
          order,
        });

        const operators = await User.find({
          _id: { $in: eligibleOperatorIds },
          status: "online",
        })
          .select("_id fcmtoken email name")
          .lean();

        // Log a NOTIFICATION_RECEIVED event per operator/order (deduped via
        // upsert) so the acceptance rate (accepted / notified) is based on real
        // dispatch data. Without this the denominator is always zero.
        await Promise.all(
          operators.map((op) =>
            JobEvent.updateOne(
              {
                operatorId: op._id,
                orderId: order._id,
                eventType: "NOTIFICATION_RECEIVED",
              },
              {
                $setOnInsert: {
                  operatorId: op._id,
                  orderId: order._id,
                  eventType: "NOTIFICATION_RECEIVED",
                  createdAt: new Date(),
                },
              },
              { upsert: true },
            ).catch((err) =>
              logger.error(
                `Failed to log NOTIFICATION_RECEIVED for operator ${op._id}:`,
                err,
              ),
            ),
          ),
        );

        const orderLink = `https://api.binsapp.ai/offers`;
        const ownerOrderPayload = formatOrderPayload(order, PRICING_ROLES.OWNER);

        const notificationPromises = operators.map(async (op) => {
          try {
            if (io) {
              io.to(`user_${op._id}`).emit("receive-request-renter", {
                orderId: ownerOrderPayload,
                request: ownerOrderPayload,
                order: ownerOrderPayload,
                orderNumber: order.orderNumber,
                price: ownerOrderPayload.price,
                success: true,
                title: waveCopy.operator.title,
                message: waveCopy.operator.description,
                dispatchTier: targetTier,
              });
            }

            return sendNotification({
              user: customerId.toString(),
              to_id: op._id.toString(),
              description: waveCopy.operator.description,
              type: "request",
              title: waveCopy.operator.title,
              fcmtoken: op.fcmtoken,
              order: orderId,
              email: op.email || "",
              metadata: {
                orderId: orderId.toString(),
                tier: String(targetTier),
                priority: "high",
              },
              html: buttonTemplate(
                orderLink,
                waveCopy.operator.title,
                waveCopy.operator.description,
              ),
              customEmailTemplate: true,
            });
          } catch (err) {
            logger.error(
              `Error sending notification to operator ${op._id}:`,
              err,
            );
          }
        });

        await Promise.all(notificationPromises);

        return {
          success: true,
          operatorsNotified: operators.length,
          tier: targetTier,
        };
      } catch (error) {
        logger.error(
          `Fatal error inside Dispatch Worker for job ${job.id}:`,
          error,
        );
        throw error;
      }
    },
    {
      concurrency: 10,
    },
  );
};
