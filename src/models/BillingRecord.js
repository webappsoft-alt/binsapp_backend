import { Schema, model } from "mongoose";

const lineItemSchema = new Schema(
  {
    type: {
      type: String,
      enum: [
        "order",
        "per_diem",
        "overage",
        "surcharge",
        "swap",
        "adjustment",
        "builder_offer",
        "other",
      ],
      required: true,
    },
    description: { type: String, default: "" },
    amount: { type: Number, required: true, default: 0 },
    order: { type: Schema.Types.ObjectId, ref: "Order", default: null },
    metadata: { type: Schema.Types.Mixed, default: {} },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true },
);

const billingRecordSchema = new Schema(
  {
    company: {
      type: Schema.Types.ObjectId,
      ref: "Company",
      required: true,
      index: true,
    },
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    order: {
      type: Schema.Types.ObjectId,
      ref: "Order",
      default: null,
      index: true,
    },
    contract: {
      type: Schema.Types.ObjectId,
      ref: "BuilderOffer",
      default: null,
      index: true,
    },
    installmentIndex: { type: Number, default: null },
    triggerType: { type: String, default: "" },
    invoiceNumber: { type: String, index: true },
    status: {
      type: String,
      enum: [
        "scheduled",
        "open",
        "due",
        "paid",
        "partial",
        "failed",
        "disputed",
        "void",
      ],
      default: "open",
      index: true,
    },
    amount: { type: Number, default: 0 },
    paidAmount: { type: Number, default: 0 },
    providerEarnedAmount: { type: Number, default: 0 },
    providerDisbursedAmount: { type: Number, default: 0 },
    providerPayoutStatus: {
      type: String,
      enum: ["pending_collection", "eligible", "disbursed", "held"],
      default: "pending_collection",
    },
    currency: { type: String, default: "usd" },
    dueDate: { type: Date, default: null },
    paidAt: { type: Date, default: null },
    lineItems: { type: [lineItemSchema], default: [] },
    paymentAttempts: {
      type: [
        {
          attemptedAt: { type: Date, default: Date.now },
          status: { type: String, default: "" },
          paymentIntentId: { type: String, default: "" },
          amount: { type: Number, default: 0 },
          errorMessage: { type: String, default: "" },
        },
      ],
      default: [],
    },
    adjustments: {
      type: [
        {
          type: {
            type: String,
            enum: ["credit_note", "overage", "dispute", "refund", "manual"],
            default: "manual",
          },
          amount: { type: Number, default: 0 },
          reason: { type: String, default: "" },
          createdAt: { type: Date, default: Date.now },
          createdBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
        },
      ],
      default: [],
    },
    notes: { type: String, default: "" },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
);

billingRecordSchema.index({ company: 1, status: 1, createdAt: -1 });
billingRecordSchema.index({ contract: 1, installmentIndex: 1 });

const BillingRecord = model("BillingRecord", billingRecordSchema);
export default BillingRecord;
