import { Schema, model } from "mongoose";

const rateCardSchema = new Schema(
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
    overageEnforced: { type: Boolean, default: false },
  },
  { _id: false },
);

const pricingRegionSchema = new Schema(
  {
    name: { type: String, required: true },
    zips: { type: [String], default: [] },
    geo: {
      type: {
        type: String,
        enum: ["Point"],
        default: "Point",
      },
      coordinates: { type: [Number], default: undefined },
    },
    rateCards: { type: [rateCardSchema], default: [] },
  },
  { _id: true },
);

const pricingPlanSchema = new Schema(
  {
    planType: {
      type: String,
      enum: ["blanket", "regional", "multi_region"],
      default: "blanket",
    },
    // Blanket: one card set for the whole company
    rateCards: { type: [rateCardSchema], default: [] },
    // Regional / multi-region: cards nested per region
    regions: { type: [pricingRegionSchema], default: [] },
    assignedAt: { type: Date, default: null },
    assignedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { _id: false },
);

const companySchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    companyName: { type: String, default: "", required: true },
    location: {
      type: {
        type: String,
        enum: ["Point"],
        default: "Point",
      },
      coordinates: { type: [Number], default: [0, 0] },
    },
    email: { type: String, default: "" },
    address: { type: String, default: "" },
    city: { type: String, default: "" },
    state: { type: String, default: "" },
    zip: { type: String, default: "" },
    country: { type: String, default: "" },
    phone: { type: String, default: "" },
    legalBusinessName: { type: String, default: "", required: true },
    COI: { type: String },
    isCOIApproved: { type: Boolean, default: false },
    COI_notes: { type: String },
    W9: { type: String },
    isW9Approved: { type: Boolean, default: false },
    W9_notes: { type: String },
    logo: { type: String },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    EIN: { type: String },
    reason: { type: String },
    companyPrice: { type: Number, default: 10 },
    primaryContact: {
      name: { type: String, default: "N/A" },
      email: { type: String, default: "N/A" },
      phone: { type: String, default: "N/A" },
      title: { type: String, default: "N/A" },
    },
    accountsPayableEmail: { type: String, default: "N/A", required: true },
    expectedMonthlyVolume: { type: Number, default: 0, required: true },
    PO: { type: Boolean, default: false },
    taxExempt: { type: String, default: "N/A" },
    isTaxExempt: { type: Boolean, default: false },

    // --- Commercial portal config (admin-controlled) ---
    paymentMethod: {
      type: String,
      enum: ["card", "invoice"],
      default: "card",
    },
    invoiceTerms: {
      netDays: { type: Number, default: 30 },
      creditLimit: { type: Number, default: 0 },
    },
    serviceAreas: {
      type: [
        {
          name: { type: String, default: "" },
          zips: { type: [String], default: [] },
        },
      ],
      default: [],
    },
    /** When set, commercial dispatch hard-filters operators at/above this tier. */
    minOperatorTier: { type: Number, default: null },
    requiredDocs: {
      w9: { type: Boolean, default: true },
      coi: { type: Boolean, default: true },
    },
    authorizedSigner: {
      name: { type: String, default: "N/A" },
      email: { type: String, default: "N/A" },
      phone: { type: String, default: "N/A" },
      title: { type: String, default: "N/A" },
    },
    pricingPlan: { type: pricingPlanSchema, default: undefined },

    /**
     * Optional builder negotiated rotation terms.
     * When enabled, commercial quotes prefer these over blanket/regional rate cards
     * for Initial Delivery vs Empty & Redeliver, plus included days/tons / overage / extra day.
     */
    negotiatedRotationTerms: {
      enabled: { type: Boolean, default: false },
      includedDaysPerRotation: { type: Number, default: null },
      includedTonsPerRotation: { type: Number, default: null },
      overagePerTon: { type: Number, default: null },
      extraDay: { type: Number, default: null },
      sizes: {
        type: [
          {
            size: {
              type: String,
              enum: ["10", "15", "20", "30", "40"],
              required: true,
            },
            initialDelivery: { type: Number, default: null },
            emptyAndRedeliver: { type: Number, default: null },
          },
        ],
        default: [],
      },
    },
  },
  {
    timestamps: true,
  },
);

const Company = model("Company", companySchema);
export default Company;
