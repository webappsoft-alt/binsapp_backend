import { Schema, model } from "mongoose";

const contactSchema = new Schema(
  {
    name: { type: String, trim: true, default: "" },
    phone: { type: String, trim: true, default: "" },
    email: { type: String, trim: true, lowercase: true, default: "" },
    zipCode: { type: String, trim: true, default: "" },
    address: { type: String, trim: true, default: "" },
    city: { type: String, trim: true, default: "" },
    state: { type: String, trim: true, default: "" },
    lat: { type: Number, default: null },
    lng: { type: Number, default: null },
  },
  { _id: false }
);

export function normalizeSalesServiceType(val) {
  if (!val || typeof val !== "string") return "Dumbster";
  const normalized = val.trim().toLowerCase().replace(/[-_]/g, " ");
  if (normalized.includes("tree")) {
    return "Tree Removal";
  }
  if (normalized.includes("junk") || normalized.includes("haul away") || normalized.includes("cleanout")) {
    return "Junk Removal";
  }
  if (normalized.includes("porta") || normalized.includes("potty") || normalized.includes("toilet") || normalized.includes("restroom")) {
    return "Porta Potty";
  }
  if (normalized.includes("dumpster") || normalized.includes("dumbster") || normalized.includes("roll off") || /\b(bin|bins)\b/.test(normalized)) {
    return "Dumbster";
  }
  return "Other";
}

const serviceDetailsSchema = new Schema(
  {
    serviceType: {
      type: String,
      enum: ["Dumbster", "Porta Potty", "Junk Removal", "Tree Removal", "Other"],
      default: "Dumbster",
      set: normalizeSalesServiceType,
    },
    sizeOrVolume: { type: String, default: "" },
    deliveryDate: { type: Date, default: null },
    projectDescription: { type: String, default: "" },
    photos: { type: [String], default: [] },
  },
  { _id: false }
);

const salesLeadSchema = new Schema(
  {
    contact: {
      type: contactSchema,
      default: () => ({}),
    },
    classification: {
      type: String,
      enum: ["HOT", "WARM", "COMMERCIAL", "PROVIDER", "SUPPORT"],
      default: "WARM",
      index: true,
    },
    serviceDetails: {
      type: serviceDetailsSchema,
      default: () => ({}),
    },
    status: {
      type: String,
      enum: ["new", "active_chat", "contacted", "converted", "abandoned", "handed_off", "rejected"],
      default: "new",
      index: true,
    },
    prefilledCheckoutToken: {
      type: String,
      default: null,
      index: true,
    },
    checkoutInitiated: {
      type: Boolean,
      default: false,
    },
    attributedRevenue: {
      type: Number,
      default: 0,
      min: 0,
    },
    conversationRef: {
      type: Schema.Types.ObjectId,
      ref: "SalesConversation",
      default: null,
      index: true,
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true }
);

salesLeadSchema.index({ "contact.email": 1, status: 1 });
salesLeadSchema.index({ "contact.phone": 1, status: 1 });
salesLeadSchema.index({ classification: 1, createdAt: -1 });

const SalesLead = model("SalesLead", salesLeadSchema);
export default SalesLead;
