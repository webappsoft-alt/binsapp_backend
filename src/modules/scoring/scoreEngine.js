import JobEvent from "../../models/JobEvent.js";
import SystemSettings from "../../models/SystemSettings.js";
import User from "../../models/User.js";
import mongoose from "mongoose";
import logger from "../../config/logger.js";
import Tier from "../../models/Tier.js";
export class ScoreEngine {
  /**
   * Calculates dynamic performance score and securely updates operator tier based on admin weights.
   * Runs in a MongoDB Transaction for safety.
   * @param {string} operatorId  - MongoDB ID of the operator.
   * @returns {Promise<Object>} Updated stats object from User model.
   */
  static async calculateOperatorScore(operatorId) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // 1. Fetch Config dynamically
      let settings = await SystemSettings.findOne({})
        .read("primary")
        .session(session);
      if (!settings) {
        settings = new SystemSettings();
        await settings.save({ session });
      }

      // 2. Aggregate Job Events
      const aggregateCursor = await JobEvent.aggregate([
        { $match: { operatorId: new mongoose.Types.ObjectId(operatorId) } },
        {
          $group: {
            _id: "$operatorId",
            totalNotified: {
              $sum: {
                $cond: [{ $eq: ["$eventType", "NOTIFICATION_RECEIVED"] }, 1, 0],
              },
            },
            totalAccepted: {
              $sum: { $cond: [{ $eq: ["$eventType", "JOB_ACCEPTED"] }, 1, 0] },
            },
            totalCompleted: {
              $sum: { $cond: [{ $eq: ["$eventType", "JOB_COMPLETED"] }, 1, 0] },
            },
            totalOnTime: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $eq: ["$eventType", "JOB_COMPLETED"] },
                      { $eq: ["$onTime", true] },
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
            totalCancelled: {
              $sum: { $cond: [{ $eq: ["$eventType", "JOB_CANCELLED"] }, 1, 0] },
            },
            totalRejected: {
              $sum: { $cond: [{ $eq: ["$eventType", "JOB_REJECTED"] }, 1, 0] },
            },
            totalRevenue: { $sum: "$revenueGenerated" },
            avgResponseTime: { $avg: "$responseTimeMs" },
          },
        },
      ])
        .session(session)
        .read("primary");

      const metrics = aggregateCursor[0] || {
        totalNotified: 0,
        totalAccepted: 0,
        totalCompleted: 0,
        totalOnTime: 0,
        totalCancelled: 0,
        totalRejected: 0,
        totalRevenue: 0,
        avgResponseTime: null,
      };

      const operator = await User.findById(operatorId)
        .read("primary")
        .session(session);
      if (!operator) throw new Error("Operator not found");

      // Calculate factors (0..1). Acceptance is clamped since an operator can
      // occasionally accept a job without a logged notification (e.g. repeat
      // requests), which would otherwise push the ratio above 1.
      let acceptanceRate =
        metrics.totalNotified > 0
          ? Math.min(1, metrics.totalAccepted / metrics.totalNotified)
          : 1;
      let cancellationRate =
        metrics.totalAccepted > 0
          ? metrics.totalCancelled / metrics.totalAccepted
          : 0;
      // On-time delivery is now real: on-time completions / total completions.
      let onTimeDeliveryRate =
        metrics.totalCompleted > 0
          ? metrics.totalOnTime / metrics.totalCompleted
          : 1;

      const rating = operator.rating || 5;
      const ratingFactor = rating / 5; // Normalize rating 0-1

      // Response Time score (fastest = highest)
      let efficiencyScore = 1;
      if (metrics.avgResponseTime != null) {
        // Normalize to [0...1], assume 120s is completely inefficient.
        efficiencyScore = Math.max(0, 1 - metrics.avgResponseTime / 120000);
      }

      // 3. Apply dynamically configured weights
      const { reliability, performance, activity, efficiency } =
        settings.scoringWeights;
      const cW = settings.cancellationWeight;

      const reliabilityScore = Math.max(
        0,
        acceptanceRate - cancellationRate * cW,
      );
      const performanceScore = ratingFactor * 0.5 + onTimeDeliveryRate * 0.5;
      const activityScore = Math.min(1, metrics.totalCompleted / 50); // saturate at 50 cap

      // Compute final score
      const finalScoreRaw =
        Math.max(
          0,
          reliabilityScore * reliability +
            performanceScore * performance +
            activityScore * activity +
            efficiencyScore * efficiency,
        ) * 100;

      const newScore = Math.min(100, Math.round(finalScoreRaw));

      // 4. Dynamic Tier Assignment from Admin-configured Tier documents
      // Fetch all tiers sorted by level DESC so we match the highest qualifying tier first
      const allTiers = await Tier.find({})
        .sort({ level: -1 })
        .read("primary")
        .session(session)
        .lean();

      // Compute the operator's real metrics to compare against Tier thresholds.
      const totalJobsHandled = metrics.totalAccepted + metrics.totalCancelled;
      const effectiveNotified = Math.max(
        metrics.totalNotified,
        metrics.totalAccepted,
      );
      // responseRate = % of notifications the operator acted on (accept/reject).
      const respondedCount = metrics.totalAccepted + metrics.totalRejected;
      // avgResponseTime is kept as a display value in minutes.
      const avgResponseMinutes =
        metrics.avgResponseTime != null
          ? parseFloat((metrics.avgResponseTime / 60000).toFixed(1))
          : 0;
      const operatorMetrics = {
        completedJobs: metrics.totalCompleted,
        acceptanceRate:
          effectiveNotified > 0
            ? Math.min(
                100,
                parseFloat(
                  ((metrics.totalAccepted / effectiveNotified) * 100).toFixed(1),
                ),
              )
            : 100,
        onTimeDelivery:
          metrics.totalCompleted > 0
            ? parseFloat(
                ((metrics.totalOnTime / metrics.totalCompleted) * 100).toFixed(
                  1,
                ),
              )
            : 0,
        rating: rating,
        cancellationRate:
          totalJobsHandled > 0
            ? parseFloat(
                ((metrics.totalCancelled / totalJobsHandled) * 100).toFixed(1),
              )
            : 0,
        // Percentage (higher is better) — how many offers the operator responded to.
        responseRate:
          metrics.totalNotified > 0
            ? Math.min(
                100,
                parseFloat(
                  ((respondedCount / metrics.totalNotified) * 100).toFixed(1),
                ),
              )
            : 100,
        avgResponseMinutes,
        totalRevenue: metrics.totalRevenue,
      };

      let newTier = 1; // Default fallback tier
      let tier_id = null;

      // Check each tier from highest to lowest — first match wins
      for (const tier of allTiers) {
        const min = tier.minimumPerformanceFactorsValue;
        const max = tier.maximumPerformanceFactorsValue;

        // An operator qualifies when every "higher is better" metric meets the
        // tier's minimum, and cancellationRate (lower is better) stays within
        // the tier's max. responseRate is a percentage (higher is better).
        const qualifies =
          operatorMetrics.completedJobs >= min.completedJobs &&
          operatorMetrics.acceptanceRate >= min.acceptanceRate &&
          operatorMetrics.onTimeDelivery >= min.onTimeDelivery &&
          operatorMetrics.rating >= min.rating &&
          operatorMetrics.responseRate >= min.responseRate &&
          operatorMetrics.cancellationRate <= max.cancellationRate &&
          operatorMetrics.totalRevenue >= min.totalRevenue;

        if (qualifies) {
          newTier = tier.level;
          tier_id = tier._id;
          break; // Highest qualifying tier found
        }
      }

      // Update Operator — reuse operatorMetrics computed above for display values
      const currentStats =
        operator.operatorStats && typeof operator.operatorStats.toObject === "function"
          ? operator.operatorStats.toObject()
          : operator.operatorStats || {};
      operator.operatorStats = {
        ...currentStats,
        score: newScore,
        tier: newTier,
        tier_id: tier_id,
        totalJobs: operatorMetrics.completedJobs,
        acceptedJobs: metrics.totalAccepted,
        cancelledJobs: metrics.totalCancelled,
        onTimeDeliveries: metrics.totalOnTime,
        avgRating: rating,
        lastActive: new Date(),
        // Frontend-ready computed fields (already calculated in operatorMetrics)
        acceptanceRate: operatorMetrics.acceptanceRate,
        cancellationRate: operatorMetrics.cancellationRate,
        onTimeRate: operatorMetrics.onTimeDelivery,
        completionRate:
          metrics.totalAccepted > 0
            ? parseFloat(
                (
                  (metrics.totalCompleted / metrics.totalAccepted) *
                  100
                ).toFixed(1),
              )
            : 0,
        responseRate: operatorMetrics.responseRate,
        avgResponseTime: operatorMetrics.avgResponseMinutes,
        totalRevenue: operatorMetrics.totalRevenue,
      };

      await operator.save({ session });

      await session.commitTransaction();
      session.endSession();

      logger.info(
        `Operator ${operatorId} score recalculated: Score=${newScore}, Tier=${newTier}`,
      );
      return operator.operatorStats;
    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      logger.error(
        `Error calculating operator score for ${operatorId}:`,
        error,
      );
      throw error;
    }
  }
}
