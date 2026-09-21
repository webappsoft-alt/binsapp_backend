import cron from "node-cron";
import redis from "../../../config/redis.js";
import { logger } from "../../../config/logger.js";
import SalesLead from "../../../models/SalesLead.js";
import { dispatchSalesAlert } from "../notifications/salesAlert.service.js";

const LOCK_KEY = "sales:lock:abandonment_worker";
const LOCK_TTL_SECONDS = 300; // 5 minutes lock
const INACTIVITY_THRESHOLD_MS = 15 * 60 * 1000; // 15 minutes inactivity threshold
const BATCH_SIZE = 50;

/**
 * Runs a single sweep for inactive leads and transitions them to 'abandoned'
 * @returns {Promise<{ processedCount: number }>}
 */
export async function runAbandonmentSweep() {
  const lockValue = `instance_${process.pid}_${Date.now()}`;
  let lockAcquired = false;

  // 1. Acquire Redis distributed lock to prevent duplicate runs across multi-instance clusters
  try {
    const res = await redis.set(LOCK_KEY, lockValue, "NX", "EX", LOCK_TTL_SECONDS);
    lockAcquired = res === "OK";
  } catch (lockErr) {
    logger.warn("Abandonment worker lock check failed (proceeding single-instance):", lockErr?.message);
    lockAcquired = true;
  }

  if (!lockAcquired) {
    logger.debug("Abandonment worker lock already held by another cluster instance. Skipping cycle.");
    return { processedCount: 0 };
  }

  let processedCount = 0;

  try {
    const cutoffDate = new Date(Date.now() - INACTIVITY_THRESHOLD_MS);

    // 2. Query candidates: active chat with contact details inactive for > 15 mins
    const candidates = await SalesLead.find({
      status: "active_chat",
      isDeleted: { $ne: true },
      updatedAt: { $lte: cutoffDate },
      $or: [
        { "contact.phone": { $exists: true, $ne: "" } },
        { "contact.email": { $exists: true, $ne: "" } },
      ],
    })
      .limit(BATCH_SIZE)
      .lean();

    if (!candidates || candidates.length === 0) {
      return { processedCount: 0 };
    }

    logger.info(`🧹 Abandonment Worker found ${candidates.length} candidate leads for sweep.`);

    for (const lead of candidates) {
      // 3. Atomic state transition: ensures no race condition if customer resumes concurrently
      const updated = await SalesLead.findOneAndUpdate(
        { _id: lead._id, status: "active_chat" },
        {
          $set: {
            status: "abandoned",
            abandonedAt: new Date(),
          },
        },
        { new: true }
      );

      if (updated) {
        processedCount++;
        // 4. Dispatch abandonment alert
        await dispatchSalesAlert(updated, "ABANDONED");
      }
    }

    logger.info(`✅ Abandonment Worker processed and flagged ${processedCount} leads as abandoned.`);
  } catch (err) {
    logger.error("Error running abandonment sweep:", err);
  } finally {
    // 5. Release distributed lock
    try {
      const currentVal = await redis.get(LOCK_KEY);
      if (currentVal === lockValue) {
        await redis.del(LOCK_KEY);
      }
    } catch (unlockErr) {
      logger.debug("Releasing abandonment worker lock failed:", unlockErr?.message);
    }
  }

  return { processedCount };
}

/**
 * Initializes and schedules the Abandonment Worker cron job (Every 15 minutes)
 */
export function startAbandonmentWorker() {
  // Run every 15 minutes: */15 * * * *
  cron.schedule("*/15 * * * *", async () => {
    logger.info("⏱️ Running scheduled Sales Lead Abandonment sweep...");
    await runAbandonmentSweep();
  });

  logger.info("⏱️ Sales Lead Abandonment Worker scheduled (every 15 minutes)");
}

export default {
  runAbandonmentSweep,
  startAbandonmentWorker,
};
