import { orderExpiryQueue } from "./bullmq.js";
import logger from "../config/logger.js";

const EXPIRY_DELAY_MS = 24 * 60 * 60 * 1000;

export function getOrderExpiryJobId(orderId) {
  return `order-expiry-${orderId}`;
}

export async function scheduleOrderExpiry(orderId, paymentId) {
  try {
    await orderExpiryQueue.add(
      "void-unmatched-hold",
      { orderId: orderId.toString(), paymentId },
      {
        delay: EXPIRY_DELAY_MS,
        jobId: getOrderExpiryJobId(orderId),
        removeOnComplete: true,
      },
    );
    logger.info(`Scheduled 24h expiry for order ${orderId}`);
  } catch (error) {
    logger.error(`Failed to schedule expiry for order ${orderId}`, error);
  }
}

export async function cancelOrderExpiry(orderId) {
  try {
    const jobId = getOrderExpiryJobId(orderId);
    const job = await orderExpiryQueue.getJob(jobId);
    if (job) {
      await job.remove();
      logger.info(`Removed expiry job: ${jobId}`);
    }
  } catch (error) {
    logger.error(`Error cancelling expiry for order ${orderId}`, error);
  }
}
