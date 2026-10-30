import mongoose from "mongoose";

const providerLeadSchema = new mongoose.Schema(
  {
    leadNumber: {
      type: String,
      unique: true,
      index: true,
    },
    provider: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    customerInfo: {
      name: { type: String, required: true, trim: true },
      email: { type: String, required: true, trim: true, lowercase: true },
      phone: { type: String, default: "", trim: true },
      address: { type: String, default: "" },
      city: { type: String, default: "" },
      state: { type: String, default: "" },
      zip: { type: String, default: "" },
      coordinates: {
        type: [Number], // [lng, lat]
        default: undefined,
      },
    },
    serviceType: {
      type: String,
      enum: ["Dumbster", "Junk Removal", "Tree Removal", "Porta Potty"],
      default: "Dumbster",
    },
    dumpsterSize: {
      type: String,
      default: "20",
    },
    dumpster: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Dumbster",
      default: null,
    },
    projectType: {
      type: String,
      default: "General Cleanout",
    },
    startDate: {
      type: Date,
      default: null,
    },
    numDays: {
      type: Number,
      default: 3,
    },
    placementNotes: {
      type: String,
      default: "",
    },
    drivewayProtection: {
      type: Boolean,
      default: true,
    },
    status: {
      type: String,
      enum: [
        "pending",
        "estimate_sent",
        "estimate_accepted",
        "converted",
        "declined",
        "cancelled",
      ],
      default: "pending",
      index: true,
    },
    estimate: {
      estimatedPrice: { type: Number, default: 0 },
      includedTons: { type: Number, default: 2 },
      rentalDays: { type: Number, default: 3 },
      extraDayPrice: { type: Number, default: 20 },
      overagePerTon: { type: Number, default: 75 },
      deliveryFee: { type: Number, default: 0 },
      validUntil: { type: Date, default: null },
      providerNotes: { type: String, default: "" },
      sentAt: { type: Date, default: null },
      respondedAt: { type: Date, default: null },
    },
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      default: null,
    },
    source: {
      type: String,
      default: "provider_profile",
    },
  },
  {
    timestamps: true,
  }
);

providerLeadSchema.pre("save", async function (next) {
  if (!this.leadNumber) {
    const randomSuffix = Math.floor(100000 + Math.random() * 900000);
    this.leadNumber = `LEAD-${randomSuffix}`;
  }
  next();
});

const ProviderLead =
  mongoose.models.ProviderLead || mongoose.model("ProviderLead", providerLeadSchema);

export default ProviderLead;
