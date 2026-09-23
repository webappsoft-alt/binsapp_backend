import mongoose from "mongoose";

/**
 * Singleton: platform-wide commercial rate cards for builders.
 * Kept in sync when admin saves Commercial Rates on Dumpster Create/Edit.
 * Company.pricingPlan / negotiatedRotationTerms override these when set.
 */
const rateCardSchema = new mongoose.Schema(
  {
    size: {
      type: String,
      enum: ["10", "15", "20", "30", "40"],
      required: true,
    },
    threeDayPrice: { type: Number, default: 0 },
    sevenDayPrice: { type: Number, default: 0 },
    fourteenDayPrice: { type: Number, default: 0 },
    thirtyDayPrice: { type: Number, default: 0 },
    enableFourteenDay: { type: Boolean, default: false },
    enableThirtyDay: { type: Boolean, default: false },
    perDiemRate: { type: Number, default: 0 },
    includedTons: { type: Number, default: 0 },
    overagePerTon: { type: Number, default: 0 },
    overageEnforced: { type: Boolean, default: true },
  },
  { _id: false },
);

const negotiatedSizeSchema = new mongoose.Schema(
  {
    size: {
      type: String,
      enum: ["10", "15", "20", "30", "40"],
      required: true,
    },
    initialDelivery: { type: Number, default: null },
    emptyAndRedeliver: { type: Number, default: null },
  },
  { _id: false },
);

const commercialGlobalPricingSchema = new mongoose.Schema(
  {
    key: { type: String, default: "default", unique: true, index: true },
    rateCards: { type: [rateCardSchema], default: [] },
    negotiatedRotationTerms: {
      enabled: { type: Boolean, default: false },
      includedDaysPerRotation: { type: Number, default: null },
      includedTonsPerRotation: { type: Number, default: null },
      overagePerTon: { type: Number, default: null },
      extraDay: { type: Number, default: null },
      sizes: { type: [negotiatedSizeSchema], default: [] },
    },
    description: {
      type: String,
      default:
        "Global commercial defaults for all builders. Company configuration overrides these when set.",
    },
  },
  { timestamps: true },
);

export default mongoose.model(
  "CommercialGlobalPricing",
  commercialGlobalPricingSchema,
);
