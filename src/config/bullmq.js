import redis from "./redis.js";

// BullMQ uses ioredis instance directly
export const connection = redis;

export const defaultQueueOptions = {
  connection,
  defaultJobOptions: {
    removeOnComplete: true,
    removeOnFail: false,
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 1000,
    },
  },
};

export const closeBullMQ = async () => {
  await redis.quit();
};
