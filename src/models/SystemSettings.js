import mongoose from "mongoose";

const systemSettingsSchema = new mongoose.Schema(
  {
    scoringWeights: {
      reliability: { type: Number, default: 0.4 },
      performance: { type: Number, default: 0.3 },
      activity: { type: Number, default: 0.2 },
      efficiency: { type: Number, default: 0.1 },
    },
    cancellationWeight: { type: Number, default: 0.05 },
    tierThresholds: {
      tier1: { min: { type: Number, default: 0 }, max: { type: Number, default: 59 } },
      tier2: { min: { type: Number, default: 60 }, max: { type: Number, default: 79 } },
      tier3: { min: { type: Number, default: 80 }, max: { type: Number, default: 94 } },
      tier4: { min: { type: Number, default: 95 }, max: { type: Number, default: 100 } },
    },
  },
  { timestamps: true },
);
const SystemSettings = mongoose.model("SystemSettings", systemSettingsSchema);
export default SystemSettings;
