import mongoose from "mongoose";

const providerCustomerSchema = new mongoose.Schema(
  {
    provider: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    source: {
      type: String,
      enum: ["created", "followup", "lead", "order", "manual"],
      default: "manual",
    },
    notes: {
      type: String,
      default: "",
    },
  },
  { timestamps: true }
);

providerCustomerSchema.index({ provider: 1, customer: 1 }, { unique: true });

const ProviderCustomer = mongoose.model(
  "ProviderCustomer",
  providerCustomerSchema
);

export default ProviderCustomer;
