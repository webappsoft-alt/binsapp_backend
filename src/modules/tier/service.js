import Tier from "../../models/Tier.js";
import { NotFoundError } from "../../utils/apiError.js";
import flattenObject from "../../utils/flattenObject.js";
import User from "../../models/User.js";

class TierService {
  async createTier(tierData) {
    try {
      const tier = await Tier.create(tierData);
      return tier;
    } catch (error) {
      throw error;
    }
  }

  async getAllTiers() {
    try {
      const tiers = await Tier.find().sort({ level: 1 });
      return tiers;
    } catch (error) {
      throw error;
    }
  }

  async getMyScore(userId) {
    try {
      const user = await User.findById(userId)
        .select("operatorStats rating name isBranded")
        .lean();
      if (!user) throw new NotFoundError("User not found");

      const stats = user.operatorStats || {};

      // Find matching tier document by level
      const tierDoc = await Tier.findOne({ level: stats.tier || 1 }).lean();

      return {
        score: stats.score || 0,
        tier: {
          level: stats.tier || 1,
          title: tierDoc?.title || `Tier ${stats.tier || 1}`,
          description: tierDoc?.description || "",
          benefits: tierDoc?.benefits || [],
        },
        completionRate: stats.completionRate || 0,
        performance: {
          jobsDone: stats.totalJobs || 0,
          acceptance: stats.acceptanceRate || 0,
          onTime: stats.onTimeRate || 0,
          rating: stats.avgRating || user.rating || 0,
          cancellation: stats.cancellationRate || 0,
          response: stats.avgResponseTime || 0, // in minutes
          revenue: stats.totalRevenue || 0,
        },
      };
    } catch (error) {
      throw error;
    }
  }


  async updateTier(tierId, tierData) {
    try {
      const flattenedData = flattenObject(tierData);
      const tier = await Tier.findByIdAndUpdate(
        tierId,
        { $set: flattenedData },
        {
          new: true,
          runValidators: true,
        },
      );
      if (!tier) {
        throw new NotFoundError("Tier not found");
      }
      return tier;
    } catch (error) {
      throw error;
    }
  }

  async deleteTier(tierId) {
    try {
      const tier = await Tier.findByIdAndDelete(tierId);
      if (!tier) {
        throw new NotFoundError("Tier not found");
      }
      return tier;
    } catch (error) {
      throw error;
    }
  }
}

export default new TierService();
