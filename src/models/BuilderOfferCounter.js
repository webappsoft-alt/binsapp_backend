import { Schema, model } from "mongoose";

const counterLineSchema = new Schema(
  {
    lineId: { type: Schema.Types.ObjectId, required: true },
    quantity: { type: Number, required: true, min: 1 },
    requestedUnitPrice: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const builderOfferCounterSchema = new Schema(
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
    },
    provider: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["pending", "accepted", "rejected", "withdrawn"],
      default: "pending",
      index: true,
    },
    message: { type: String, default: "" },
    lines: { type: [counterLineSchema], default: [] },
    requestedBuilderTotal: { type: Number, default: 0 },
    respondedAt: { type: Date, default: null },
    respondedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true },
);

export default model("BuilderOfferCounter", builderOfferCounterSchema);
