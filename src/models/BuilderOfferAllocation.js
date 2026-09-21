import { Schema, model } from "mongoose";

const allocationLineSchema = new Schema(
  {
    lineId: { type: Schema.Types.ObjectId, required: true },
    quantity: { type: Number, required: true, min: 1 },
    size: { type: String, default: "" },
    unitBuilderPrice: { type: Number, default: 0 },
    lineBuilderTotal: { type: Number, default: 0 },
    platformFee: { type: Number, default: 0 },
    providerPayout: { type: Number, default: 0 },
    feeEligible: { type: Boolean, default: true },
    order: {
      type: Schema.Types.ObjectId,
      ref: "Order",
      default: null,
    },
  },
  { _id: false },
);

const builderOfferAllocationSchema = new Schema(
  {
    offer: {
      type: Schema.Types.ObjectId,
      ref: "BuilderOffer",
      required: true,
      index: true,
    },
    company: {
      type: Schema.Types.ObjectId,
      ref: "Company",
      required: true,
      index: true,
    },
    provider: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["accepted", "cancelled"],
      default: "accepted",
    },
    mode: {
      type: String,
      enum: ["full_available", "select_quantity"],
      default: "full_available",
    },
    binsAccepted: { type: Number, default: 0 },
    builderPortion: { type: Number, default: 0 },
    platformFee: { type: Number, default: 0 },
    providerPayout: { type: Number, default: 0 },
    lines: { type: [allocationLineSchema], default: [] },
    billingRecord: {
      type: Schema.Types.ObjectId,
      ref: "BillingRecord",
      default: null,
    },
    paymentHoldId: { type: String, default: null },
    paymentMethod: {
      type: String,
      enum: ["invoice", "card"],
      default: "invoice",
    },
    inventoryHolds: {
      type: [
        {
          dustbinId: { type: Schema.Types.ObjectId, ref: "Dustbin" },
          quantity: { type: Number, default: 1 },
          startDate: { type: Date },
          endDate: { type: Date },
          orderId: { type: Schema.Types.ObjectId, ref: "Order", default: null },
        },
      ],
      default: [],
    },
    acceptedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

builderOfferAllocationSchema.index({ offer: 1, provider: 1 });

export default model("BuilderOfferAllocation", builderOfferAllocationSchema);
