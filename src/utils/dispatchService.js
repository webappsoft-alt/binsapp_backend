import { dispatchQueue } from "./bullmq.js";
import User from "../models/User.js";
import Tier from "../models/Tier.js";
import logger from "../config/logger.js";
import { mapBrandedBoostForOperators } from "./growthEngine.js";

const IMMEDIATE_WAVE_KEY = "immediate";

function compareOperators(a, b) {
  const tierA = a.operatorStats?.tier || 1;
  const tierB = b.operatorStats?.tier || 1;
  if (tierB !== tierA) return tierB - tierA;

  // Growth platform: branded can + passing quality gate beats legacy isBranded
  const growthBrandedA = a.growthBrandedBoost ? 1 : 0;
  const growthBrandedB = b.growthBrandedBoost ? 1 : 0;
  if (growthBrandedB !== growthBrandedA) return growthBrandedB - growthBrandedA;

  const brandedA = a.isBranded ? 1 : 0;
  const brandedB = b.isBranded ? 1 : 0;
  if (brandedB !== brandedA) return brandedB - brandedA;

  const scoreA = a.operatorStats?.score || 0;
  const scoreB = b.operatorStats?.score || 0;
  return scoreB - scoreA;
}

function buildWaveJobId(orderId, waveKey) {
  return `dispatch-${orderId}-${waveKey}`;
}

/**
 * Dispatch Service: Uber-style staggered owner notifications via BullMQ.
 * When no tier configuration exists (early launch), all owners are notified immediately.
 */
class DispatchService {
  /**
   * @param {Object} order Order document
   * @param {string[]} operatorIds Pre-filtered operator IDs from matching
   * @param {{ immediate?: boolean }} options immediate=true skips tier delays (repeat orders)
   */
  async initializeDispatchWaves(order, operatorIds = [], options = {}) {
    const { immediate = false } = options;

    try {
      logger.info("dispatch.initialize", {
        orderId: order._id?.toString(),
        operatorCount: operatorIds.length,
        immediate,
      });

      if (!operatorIds?.length) {
        logger.warn(`No operators found for Order: ${order._id}`);
        return { mode: "none", wavesScheduled: 0 };
      }

      const tiers = await Tier.find({}).sort({ level: -1 }).lean();
      const tierSettings = tiers.reduce((acc, tierDoc) => {
        acc[tierDoc.level] = tierDoc.dispatchDelaySeconds;
        return acc;
      }, {});

      const operators = await User.find({
        _id: { $in: operatorIds },
        status: "online",
      })
        .select("_id operatorStats isBranded fcmtoken email name")
        .lean();

      if (operators.length === 0) {
        logger.warn(`No online operators for Order: ${order._id}`);
        return { mode: "none", wavesScheduled: 0 };
      }

      try {
        const boostMap = await mapBrandedBoostForOperators(
          operators.map((op) => op._id),
        );
        for (const op of operators) {
          op.growthBrandedBoost = Boolean(boostMap.get(op._id.toString()));
        }
      } catch (boostErr) {
        logger.warn("dispatch.growth_branded_boost_failed", {
          orderId: order._id?.toString(),
          error: boostErr?.message,
        });
      }

      operators.sort(compareOperators);

      // Early-launch guard: tier config rows may exist, but if none of the
      // matched operators actually have differentiated priority data (tier > 1
      // or a positive score), staggering just makes the customer wait for no
      // reason. In that case notify everyone immediately.
      const hasMeaningfulTierData = operators.some(
        (op) =>
          (op.operatorStats?.tier || 1) > 1 ||
          (op.operatorStats?.score || 0) > 0,
      );

      const useImmediateDispatch =
        immediate || tiers.length === 0 || !hasMeaningfulTierData;
      const jobPromises = [];

      if (useImmediateDispatch) {
        jobPromises.push(
          dispatchQueue.add(
            "wave-immediate",
            {
              orderId: order._id,
              targetTier: IMMEDIATE_WAVE_KEY,
              operatorIds: operators.map((op) => op._id.toString()),
              orderNumber: order.orderNumber,
              customerId: order.user,
            },
            {
              delay: 0,
              jobId: buildWaveJobId(order._id, IMMEDIATE_WAVE_KEY),
              removeOnComplete: true,
            },
          ),
        );

        logger.info("dispatch.immediate_wave", {
          orderId: order._id?.toString(),
          reason: immediate
            ? "repeat_or_forced"
            : tiers.length === 0
              ? "no_tier_configuration"
              : "no_operator_tier_data",
          operatorCount: operators.length,
        });
      } else {
        const waves = operators.reduce((acc, op) => {
          const tier = op.operatorStats?.tier || 1;
          if (!acc[tier]) acc[tier] = [];
          acc[tier].push(op._id.toString());
          return acc;
        }, {});

        const activeTiers = Object.keys(waves)
          .map(Number)
          .sort((a, b) => b - a);

        for (const tierLevel of activeTiers) {
          const delayInSeconds =
            tierSettings[tierLevel] ?? Math.max(0, 135 - (tierLevel - 1) * 45);
          const delayMs = delayInSeconds * 1000;

          jobPromises.push(
            dispatchQueue.add(
              `wave-tier-${tierLevel}`,
              {
                orderId: order._id,
                targetTier: tierLevel,
                operatorIds: waves[tierLevel],
                orderNumber: order.orderNumber,
                customerId: order.user,
              },
              {
                delay: delayMs,
                jobId: buildWaveJobId(order._id, `tier-${tierLevel}`),
                removeOnComplete: true,
              },
            ),
          );

          logger.info("dispatch.tier_wave_scheduled", {
            orderId: order._id?.toString(),
            tierLevel,
            delayInSeconds,
            operatorCount: waves[tierLevel].length,
            notifyAt: new Date(Date.now() + delayMs).toISOString(),
          });
        }
      }

      await Promise.all(jobPromises);

      return {
        mode: useImmediateDispatch ? "immediate" : "tiered",
        wavesScheduled: jobPromises.length,
      };
    } catch (error) {
      logger.error(
        `Failed to initialize dispatch waves for Order ${order._id}:`,
        error,
      );
      throw error;
    }
  }

  async cancelRemainingWaves(orderId) {
    try {
      const orderIdStr = orderId.toString();
      const jobIds = new Set([buildWaveJobId(orderIdStr, IMMEDIATE_WAVE_KEY)]);

      const tiers = await Tier.find({}).select("level").lean();
      for (const tier of tiers) {
        jobIds.add(buildWaveJobId(orderIdStr, `tier-${tier.level}`));
      }

      // Legacy job id format from older deployments
      for (let level = 1; level <= 10; level += 1) {
        jobIds.add(`dispatch-${orderIdStr}-tier-${level}`);
      }

      for (const jobId of jobIds) {
        const job = await dispatchQueue.getJob(jobId);
        if (job) {
          await job.remove();
          logger.info(`Removed pending dispatch wave: ${jobId}`);
        }
      }
    } catch (error) {
      logger.error(`Error cancelling waves for Order ${orderId}:`, error);
    }
  }
}

export default new DispatchService();
