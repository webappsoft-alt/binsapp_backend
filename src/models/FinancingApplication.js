import { Schema, model } from "mongoose";

const requestedItemSchema = new Schema(
  {
    catalogItem: {
      type: Schema.Types.ObjectId,
      ref: "FleetCatalogItem",
      required: true,
    },
    qty: { type: Number, default: 1, min: 1 },
    branded: { type: Boolean, default: false },
    cashPriceSnapshot: { type: Number, default: 0 },
    manufacturerSnapshot: { type: String, default: "" },
    sizeSnapshot: { type: String, default: "" },
  },
  { _id: false },
);

const profileSnapshotSchema = new Schema(
  {
    completedJobs60d: { type: Number, default: 0 },
    gmv60d: { type: Number, default: 0 },
    fleetCredits: { type: Number, default: 0 },
    currentPackageKey: { type: String, default: null },
    qualityGate: { type: Schema.Types.Mixed, default: {} },
    computedAt: { type: Date, default: null },
  },
  { _id: false },
);

const decisionTermsSchema = new Schema(
  {
    approvedAmount: { type: Number, default: null },
    termMonths: { type: Number, default: null },
    aprPercent: { type: Number, default: null },
    monthlyPayment: { type: Number, default: null },
    notes: { type: String, default: "" },
  },
  { _id: false },
);

const financingApplicationSchema = new Schema(
  {
    operator: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    packageKey: { type: String, required: true },
    profileSnapshot: { type: profileSnapshotSchema, default: () => ({}) },
    requestedItems: { type: [requestedItemSchema], default: [] },
    status: {
      type: String,
      enum: ["pending", "in_review", "approved", "denied", "withdrawn"],
      default: "pending",
      index: true,
    },
    adminNotes: { type: String, default: "" },
    decisionTerms: { type: decisionTermsSchema, default: () => ({}) },
    decidedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    decidedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

financingApplicationSchema.index({ status: 1, createdAt: -1 });
financingApplicationSchema.index({ operator: 1, createdAt: -1 });

export default model("FinancingApplication", financingApplicationSchema);
