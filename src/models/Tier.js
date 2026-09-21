import { Schema, model } from "mongoose";

const tierSchema = new Schema(
  {
    title: {
      type: String,
      required: true,
    },
    level: {
      type: Number,
      required: true,
      index: true,
    },
    benefits: {
      type: [String],
      default: [],
    },
    minimumPerformanceFactorsValue: {
      completedJobs: {
        type: Number,
        required: true,
      },
      acceptanceRate: {
        type: Number,
        required: true,
      },
      onTimeDelivery: {
        type: Number,
        required: true,
      },
      rating: {
        type: Number,
        required: true,
      },
      cancellationRate: {
        type: Number,
        required: true,
      },
      responseRate: {
        type: Number,
        required: true,
      },
      totalRevenue: {
        type: Number,
        required: true,
      },
    },
    maximumPerformanceFactorsValue: {
      completedJobs: {
        type: Number,
        required: true,
      },
      acceptanceRate: {
        type: Number,
        required: true,
      },
      onTimeDelivery: {
        type: Number,
        required: true,
      },
      rating: {
        type: Number,
        required: true,
      },
      cancellationRate: {
        type: Number,
        required: true,
      },
      responseRate: {
        type: Number,
        required: true,
      },
      totalRevenue: {
        type: Number,
        required: true,
      },
    },
    description: {
      type: String,
      required: true,
    },
    dispatchDelaySeconds: {
      type: Number,
      required: true,
      default: 0,
    },
    milesCharges: {
      ZeroToTenMiles: {
        type: Number,
        required: true,
        default: 0,
      },
      ElevenToTwentyMiles: {
        type: Number,
        required: true,
        default: 0,
      },
      TwentyOneToThirtyMiles: {
        type: Number,
        required: true,
        default: 0,
      },
      ThirtyOneToFortyMiles: {
        type: Number,
        required: true,
        default: 0,
      },
    },
  },
  {
    timestamps: true,
    versionKey: false,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);
const Tier = model("Tier", tierSchema);

export default Tier;
