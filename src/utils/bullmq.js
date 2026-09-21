import { Queue, Worker } from "bullmq";
import { connection, defaultQueueOptions } from "../config/bullmq.js";
import logger from "../config/logger.js";

/**
 * Helper to create a BullMQ Queue
 */
export const createQueue = (name, options = {}) => {
  return new Queue(name, {
    ...defaultQueueOptions,
    ...options,
    connection,
  });
};

/**
 * Helper to create a BullMQ Worker
 */
export const createWorker = (name, processor, options = {}) => {
  const worker = new Worker(name, processor, {
    ...options,
    connection,
  });

  worker.on("completed", (job) => {
    logger.info(`Job ${job.id} in queue ${name} completed.`);
  });

  worker.on("failed", (job, err) => {
    logger.error(`Job ${job.id} in queue ${name} failed: ${err.message}`);
  });

  return worker;
};

// Exporting existing queues for consistency
export const notificationQueue = createQueue("notifications");
export const dispatchQueue = createQueue("priority-dispatch");
export const orderExpiryQueue = createQueue("order-expiry");
