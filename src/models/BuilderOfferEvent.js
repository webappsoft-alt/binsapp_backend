import { Schema, model } from "mongoose";
import { BUILDER_OFFER_EVENT_TYPES } from "../constants/builderOffer.js";

const builderOfferEventSchema = new Schema(
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
      default: null,
      index: true,
    },
    actor: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    actorRole: {
      type: String,
      enum: ["company", "provider", "admin", "system"],
      default: "system",
    },
    type: {
      type: String,
      enum: BUILDER_OFFER_EVENT_TYPES,
      required: true,
      index: true,
    },
    payload: { type: Schema.Types.Mixed, default: {} },
    // Denormalized dimensions for market intelligence
    zip: { type: String, default: "" },
    size: { type: String, default: "" },
    quantity: { type: Number, default: null },
    rentalDays: { type: Number, default: null },
    material: { type: String, default: "" },
    tonnage: { type: Number, default: null },
    unitPrice: { type: Number, default: null },
    responseTimeMs: { type: Number, default: null },
    season: { type: String, default: "" },
  },
  { timestamps: true },
);

builderOfferEventSchema.index({ type: 1, zip: 1, size: 1, createdAt: -1 });

export default model("BuilderOfferEvent", builderOfferEventSchema);
