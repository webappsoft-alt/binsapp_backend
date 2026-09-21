import { Schema, model } from "mongoose";

const penaltyAppliedSchema = new Schema(
  {
    type: {
      type: String,
      enum: ["late", "no_show", "prohibited_material", "chargeback", "refund"],
      required: true,
    },
    value: { type: Number, required: true },
    orderId: { type: Schema.Types.ObjectId, ref: "Order", default: null },
    note: { type: String, default: "" },
    appliedAt: { type: Date, default: Date.now },
    source: { type: String, default: "system" },
  },
  { _id: true },
);

const qualityGateSchema = new Schema(
  {
    rating: { type: Number, default: 0 },
    onTimeRate: { type: Number, default: 0 },
    cancellationRate: { type: Number, default: 0 },
    stripeVerified: { type: Boolean, default: false },
    docsCurrent: { type: Boolean, default: false },
    commercialEligible: { type: Boolean, default: false },
    hasBrandedCan: { type: Boolean, default: false },
    passed: { type: Boolean, default: false },
    failures: { type: [String], default: [] },
  },
  { _id: false },
);

const nextPackageSchema = new Schema(
  {
    key: { type: String, default: null },
    label: { type: String, default: null },
    jobsRemaining: { type: Number, default: 0 },
    creditsRemaining: { type: Number, default: 0 },
    progressPercent: { type: Number, default: 0 },
  },
  { _id: false },
);

const operatorGrowthProfileSchema = new Schema(
  {
    operator: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    completedJobs60d: { type: Number, default: 0 },
    gmv60d: { type: Number, default: 0 },
    fleetCredits: { type: Number, default: 0 },
    penaltiesApplied: { type: [penaltyAppliedSchema], default: [] },
    qualityGate: { type: qualityGateSchema, default: () => ({}) },
    currentPackageKey: { type: String, default: "starter" },
    nextPackage: { type: nextPackageSchema, default: () => ({}) },
    qualificationLockedUntil: { type: Date, default: null },
    manualPackageOverride: { type: String, default: null },
    computedAt: { type: Date, default: null },
    previousPackageKey: { type: String, default: null },
    milestoneNotifiedAtPercent: { type: Number, default: 0 },
  },
  { timestamps: true },
);

operatorGrowthProfileSchema.index({ currentPackageKey: 1, fleetCredits: -1 });
operatorGrowthProfileSchema.index({ fleetCredits: -1 });

export default model("OperatorGrowthProfile", operatorGrowthProfileSchema);
