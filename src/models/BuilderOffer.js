import { Schema, model } from "mongoose";
import {
  BUILDER_ADVANCE_NOTICE_OPTIONS,
  BUILDER_EXCHANGE_MODES,
  BUILDER_EXCHANGE_TURNAROUND_OPTIONS,
  BUILDER_FINAL_PICKUP_MODES,
  BUILDER_OFFER_FULFILLMENT_PREFERENCES,
  BUILDER_OFFER_LINE_TYPES,
  BUILDER_OFFER_SERVICE_TYPES,
  BUILDER_OFFER_STATUSES,
  COMMERCIAL_DUMPSTER_SIZES,
  COMMERCIAL_LINE_UNIT_KEYS,
  LINE_TYPE_FEE_ELIGIBLE,
} from "../constants/builderOffer.js";

const pricingScheduleItemSchema = new Schema(
  {
    key: { type: String, required: true },
    label: { type: String, default: "" },
    size: {
      type: String,
      enum: [...COMMERCIAL_LINE_UNIT_KEYS, null],
      default: null,
    },
    /** Optional jobsite-level price override key */
    jobsiteId: {
      type: Schema.Types.ObjectId,
      ref: "JobSites",
      default: null,
    },
    lineType: {
      type: String,
      enum: BUILDER_OFFER_LINE_TYPES,
      default: "bin",
    },
    unitBuilderPrice: { type: Number, required: true, min: 0 },
    feeEligible: { type: Boolean, default: true },
  },
  { _id: false },
);

const offerLineSchema = new Schema(
  {
    jobsite: {
      type: Schema.Types.ObjectId,
      ref: "JobSites",
      required: true,
    },
    siteName: { type: String, default: "" },
    projectName: { type: String, default: "" },
    jobNumber: { type: String, default: "" },
    poNumber: { type: String, default: "" },
    costCode: { type: String, default: "" },
    billingReference: { type: String, default: "" },
    communityName: { type: String, default: "" },
    division: { type: String, default: "" },
    authorizedUsers: { type: String, default: "" },
    serviceInstructions: { type: String, default: "" },
    gateAccessInstructions: { type: String, default: "" },
    deliveryRestrictions: { type: String, default: "" },
    hoursAllowedOnsite: { type: String, default: "" },
    materialRestrictions: { type: String, default: "" },
    address: { type: String, default: "" },
    city: { type: String, default: "" },
    state: { type: String, default: "" },
    zip: { type: String, default: "" },
    location: {
      type: {
        type: String,
        enum: ["Point"],
        default: "Point",
      },
      coordinates: { type: [Number], default: undefined },
    },
    /** Dumpster yard size or service unit key (porta/junk/tree). */
    size: {
      type: String,
      enum: COMMERCIAL_LINE_UNIT_KEYS,
      required: true,
    },
    quantity: { type: Number, required: true, min: 1 },
    quantityCommitted: { type: Number, default: 0, min: 0 },
    quantityRemaining: { type: Number, required: true, min: 0 },
    deliveryDate: { type: Date, required: true },
    deliveryWindow: { type: String, default: "" },
    rentalDays: { type: Number, required: true, min: 1 },
    unitBuilderPrice: { type: Number, required: true, min: 0 },
    lineBuilderTotal: { type: Number, required: true, min: 0 },
    lineType: {
      type: String,
      enum: BUILDER_OFFER_LINE_TYPES,
      default: "bin",
    },
    feeEligible: { type: Boolean, default: true },
    material: { type: String, default: "" },
    materialOther: { type: String, default: "" },
    materialPhotoUrl: { type: String, default: "" },
    placementContactPhone: { type: String, default: "" },
    placementInstructions: { type: String, default: "" },
    placementPhotoUrl: { type: String, default: "" },
    /** Human-readable placement label */
    placementLabel: { type: String, default: "" },
    placementGeo: {
      type: {
        type: String,
        enum: ["Point"],
        default: "Point",
      },
      coordinates: { type: [Number], default: undefined },
    },
    siteContactName: { type: String, default: "" },
    siteContactPhone: { type: String, default: "" },
    status: {
      type: String,
      enum: ["open", "partial", "fulfilled", "cancelled"],
      default: "open",
    },
  },
  { _id: true },
);

const builderOfferSchema = new Schema(
  {
    company: {
      type: Schema.Types.ObjectId,
      ref: "Company",
      required: true,
      index: true,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    title: { type: String, default: "Builder Offer" },
    regionLabel: { type: String, default: "" },
    status: {
      type: String,
      enum: BUILDER_OFFER_STATUSES,
      default: "draft",
      index: true,
    },
    fulfillmentPreference: {
      type: String,
      enum: BUILDER_OFFER_FULFILLMENT_PREFERENCES,
      default: "multiple_providers",
    },
    serviceType: {
      type: String,
      enum: BUILDER_OFFER_SERVICE_TYPES,
      default: "dumpster",
      index: true,
    },
    rentalPeriodDays: { type: Number, default: 30 },
    material: { type: String, default: "" },
    materialOther: { type: String, default: "" },
    materialPhotoUrl: { type: String, default: "" },
    includedTonnage: { type: Number, default: null },
    additionalTonnageRate: { type: Number, default: null },
    additionalDayRate: { type: Number, default: null },
    exchangeRequirements: { type: String, default: "" },
    estimatedRecurringVolume: { type: String, default: "" },
    advanceNotice: {
      type: String,
      enum: [...BUILDER_ADVANCE_NOTICE_OPTIONS, null],
      default: null,
    },
    deliveryWindow: { type: String, default: "" },
    exchangeMode: {
      type: String,
      enum: [...BUILDER_EXCHANGE_MODES, null],
      default: "manual",
    },
    exchangeEveryDays: { type: Number, default: null, min: 1 },
    exchangeTurnaround: {
      type: String,
      enum: [...BUILDER_EXCHANGE_TURNAROUND_OPTIONS, null],
      default: null,
    },
    exchangeTurnaroundCustom: { type: String, default: "" },
    /** Preferred calendar day when exchangeTurnaround === scheduled_day */
    exchangeTurnaroundDate: { type: Date, default: null },
    finalPickupMode: {
      type: String,
      enum: [...BUILDER_FINAL_PICKUP_MODES, null],
      default: "manual",
    },
    finalPickupDate: { type: Date, default: null },
    /** When finalPickupMode === authorized_user */
    authorizedPickupName: { type: String, default: "" },
    authorizedPickupPhone: { type: String, default: "" },
    placementContactPhone: { type: String, default: "" },
    /**
     * Billing clarity flag — each delivery and each exchange/revisit
     * is a separate order and additional charge.
     */
    eachServiceIsSeparateOrder: { type: Boolean, default: true },
    pricingSchedule: { type: [pricingScheduleItemSchema], default: [] },
    lines: { type: [offerLineSchema], default: [] },
    builderTotal: { type: Number, default: 0 },
    platformFeeTotal: { type: Number, default: 0 },
    providerPayoutTotal: { type: Number, default: 0 },
    passThroughTotal: { type: Number, default: 0 },
    binsRequested: { type: Number, default: 0 },
    binsCommitted: { type: Number, default: 0 },
    binsRemaining: { type: Number, default: 0 },
    fulfillmentPct: { type: Number, default: 0 },
    allowCounteroffers: { type: Boolean, default: false },
    countersEnabledAt: { type: Date, default: null },
    lastMatchedAt: { type: Date, default: null },
    lastAcceptAt: { type: Date, default: null },
    needsAdjustmentAt: { type: Date, default: null },
    needsAdjustmentReason: { type: String, default: "" },
    sourceBlanketPlanId: { type: String, default: null },
    savedAsBlanketAt: { type: Date, default: null },
    notifiedProviderIds: {
      type: [{ type: Schema.Types.ObjectId, ref: "User" }],
      default: [],
    },
    lastMatchSnapshot: { type: Schema.Types.Mixed, default: null },
    cancelledAt: { type: Date, default: null },
    cancelledReason: { type: String, default: "" },
    expiresAt: { type: Date, default: null, index: true },
  },
  { timestamps: true },
);

builderOfferSchema.index({ company: 1, status: 1, createdAt: -1 });
builderOfferSchema.index({ "lines.status": 1, status: 1 });
builderOfferSchema.index({ serviceType: 1, status: 1 });

builderOfferSchema.statics.defaultFeeEligible = function defaultFeeEligible(
  lineType,
) {
  return LINE_TYPE_FEE_ELIGIBLE[lineType] !== false;
};

/** @deprecated Use COMMERCIAL_DUMPSTER_SIZES from constants — kept for import safety */
export { COMMERCIAL_DUMPSTER_SIZES };

export default model("BuilderOffer", builderOfferSchema);
