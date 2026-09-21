import { Schema, model } from "mongoose";

const lineItemSchema = new Schema(
  {
    type: {
      type: String,
      enum: [
        "order",
        "per_diem",
        "overage",
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
    invoiceNumber: { type: String, index: true },
    status: {
      type: String,
      enum: ["open", "due", "paid", "void", "partial"],
      default: "open",
      index: true,
    },
    amount: { type: Number, default: 0 },
    paidAmount: { type: Number, default: 0 },
    currency: { type: String, default: "usd" },
    dueDate: { type: Date, default: null },
    paidAt: { type: Date, default: null },
    lineItems: { type: [lineItemSchema], default: [] },
    notes: { type: String, default: "" },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
);

billingRecordSchema.index({ company: 1, status: 1, createdAt: -1 });

const BillingRecord = model("BillingRecord", billingRecordSchema);
export default BillingRecord;
