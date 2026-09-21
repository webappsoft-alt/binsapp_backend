import { Schema, model } from "mongoose";

const packageSchema = new Schema(
  {
    key: { type: String, required: true, trim: true },
    label: { type: String, required: true, trim: true },
    cans: { type: Number, default: 1, min: 0 },
    minJobs: { type: Number, default: 0, min: 0 },
    minCredits: { type: Number, default: 0, min: 0 },
    requiresCommercialEligible: { type: Boolean, default: false },
  },
  { _id: false },
);

const qualityGateSchema = new Schema(
  {
    minRating: { type: Number, default: 4.5 },
    minOnTimeRate: { type: Number, default: 0.9 },
    maxCancellationRate: { type: Number, default: 0.1 },
    requireStripeVerified: { type: Boolean, default: true },
    requireDocsCurrent: { type: Boolean, default: true },
  },
  { _id: false },
);

const penaltiesSchema = new Schema(
  {
    late: { type: Number, default: 0.25 },
    no_show: { type: Number, default: 1 },
    prohibited_material: { type: Number, default: 2 },
    chargeback: { type: Number, default: 1.5 },
    refund: { type: Number, default: 0.5 },
  },
  { _id: false },
);

const growthProgramConfigSchema = new Schema(
  {
    singletonKey: {
      type: String,
      default: "default",
      unique: true,
      immutable: true,
    },
    windowDays: { type: Number, default: 60, min: 1 },
    gmvDivisor: { type: Number, default: 5000, min: 1 },
    brandedMultiplier: { type: Number, default: 1.1, min: 1 },
    qualityGate: { type: qualityGateSchema, default: () => ({}) },
    penalties: { type: penaltiesSchema, default: () => ({}) },
    packages: {
      type: [packageSchema],
      default: () => [
        {
          key: "starter",
          label: "Starter",
          cans: 1,
          minJobs: 0,
          minCredits: 0,
          requiresCommercialEligible: false,
        },
        {
          key: "growth",
          label: "Growth",
          cans: 2,
          minJobs: 10,
          minCredits: 1,
          requiresCommercialEligible: false,
        },
        {
          key: "pro",
          label: "Pro",
          cans: 5,
          minJobs: 25,
          minCredits: 3,
          requiresCommercialEligible: false,
        },
        {
          key: "fleet",
          label: "Fleet",
          cans: 10,
          minJobs: 50,
          minCredits: 8,
          requiresCommercialEligible: true,
        },
      ],
    },
    milestonePercent: { type: Number, default: 80, min: 1, max: 99 },
  },
  { timestamps: true },
);

export default model("GrowthProgramConfig", growthProgramConfigSchema);
