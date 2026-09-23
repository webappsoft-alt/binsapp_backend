import mongoose from "mongoose";

/**
 * Geographic dumpster pricing configuration.
 *
 * Hierarchy: State → Market → Zone → Size → Material Type → period prices
 *
 * Catalog `Dumbster` prices remain the fallback when no zone matches a location.
 * Nothing here is hardcoded to a specific state — Florida (or any other market)
 * is ordinary admin/seed data.
 */
const pricingRateSchema = new mongoose.Schema(
  {
    /** Catalog size key (e.g. "10-12", "18-20", "30") or commercial key ("10","15","20"). */
    size: { type: String, required: true, trim: true },
    /** Display label, e.g. "10 YD". */
    sizeLabel: { type: String, default: "", trim: true },
    /** Material type this rate applies to (default "standard"). */
    materialType: {
      type: String,
      default: "standard",
      trim: true,
      lowercase: true,
    },
    oneDayPrice: { type: Number, default: 0, min: 0 },
    threeDayPrice: { type: Number, default: 0, min: 0 },
    sevenDayPrice: { type: Number, default: 0, min: 0 },
    includedTons: { type: Number, default: 0, min: 0 },
    overagePerTon: { type: Number, default: 0, min: 0 },
    /** Charge per day beyond the selected rental period. */
    extraDay: { type: Number, default: 0, min: 0 },
    /** Optional absolute provider payout override; null = derive at order time. */
    providerPayout: { type: Number, default: null, min: 0 },
    /**
     * Optional BINS APP fee override.
     * Store as a percentage (e.g. 15). null = use platform default.
     */
    binsAppFee: { type: Number, default: null, min: 0, max: 100 },
  },
  { _id: false },
);

const dumpsterPricingZoneSchema = new mongoose.Schema(
  {
    state: { type: String, required: true, trim: true, index: true },
    stateCode: { type: String, default: "", trim: true, uppercase: true, index: true },
    market: { type: String, required: true, trim: true, index: true },
    /** Same as market — kept for legacy docs / indexes. */
    zone: { type: String, required: true, trim: true, index: true },
    description: { type: String, default: "", trim: true },
    /**
     * Optional center + radius for lat/lng matching.
     * Coordinates are [lng, lat]. Only set when coordinates are valid.
     */
    geo: {
      center: {
        type: { type: String, enum: ["Point"] },
        coordinates: { type: [Number] },
      },
      radiusMiles: { type: Number, min: 0, default: undefined },
    },
    rates: { type: [pricingRateSchema], default: [] },
    /**
     * Single platform-wide Global Rate row in Market Pricing.
     * Cannot be deleted — only updated. Used when no geo market matches.
     */
    isGlobal: { type: Boolean, default: false },
    status: {
      type: String,
      default: "active",
      enum: ["active", "deactive"],
      index: true,
    },
  },
  { timestamps: true },
);

dumpsterPricingZoneSchema.index(
  { state: 1, market: 1 },
  { unique: true },
);
dumpsterPricingZoneSchema.index(
  { isGlobal: 1 },
  { unique: true, partialFilterExpression: { isGlobal: true } },
);
dumpsterPricingZoneSchema.index({ "geo.center": "2dsphere" }, { sparse: true });

/** Drop incomplete geo so Mongo never indexes a Point without coordinates. */
function scrubIncompleteGeo(doc) {
  const coords = doc?.geo?.center?.coordinates;
  const valid =
    Array.isArray(coords) &&
    coords.length === 2 &&
    Number.isFinite(Number(coords[0])) &&
    Number.isFinite(Number(coords[1]));
  if (!valid && doc.geo != null) {
    doc.geo = undefined;
    doc.set?.("geo", undefined);
  }
}

dumpsterPricingZoneSchema.pre("validate", function scrubGeoOnValidate(next) {
  scrubIncompleteGeo(this);
  next();
});

dumpsterPricingZoneSchema.pre("save", function scrubGeoOnSave(next) {
  scrubIncompleteGeo(this);
  next();
});

export default mongoose.model("DumpsterPricingZone", dumpsterPricingZoneSchema);
