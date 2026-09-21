import { Schema, model } from "mongoose";

/**
 * Normalizes any funnel string or variation into a safe, valid SalesConversation enum
 * @param {string} val
 * @returns {string}
 */
export function normalizeSalesFunnel(val) {
  if (!val || typeof val !== "string") return "unknown";
  const normalized = val.trim().toLowerCase().replace(/[-\s]/g, "_");

  const ALLOWED = [
    "unknown",
    "service_booking",
    "dumpster_rental",
    "junk_removal",
    "tree_service",
    "porta_potty",
    "contractor",
    "contractor_professional",
    "provider",
    "provider_onboarding",
    "commercial",
    "commercial_builder",
    "support",
    "general_faq",
    "initial_intent",
    "converted",
  ];

  if (ALLOWED.includes(normalized)) {
    return normalized;
  }
  if (normalized.includes("provider")) return "provider_onboarding";
  if (normalized.includes("contractor")) return "contractor_professional";
  if (normalized.includes("commercial") || normalized.includes("builder")) return "commercial_builder";
  if (normalized.includes("support")) return "support";
  if (normalized.includes("dumpster") || normalized.includes("dumbster") || normalized.includes("booking")) return "dumpster_rental";
  if (normalized.includes("junk")) return "junk_removal";
  if (normalized.includes("tree")) return "tree_service";
  if (normalized.includes("porta") || normalized.includes("potty")) return "porta_potty";
  if (normalized.includes("faq") || normalized.includes("question")) return "general_faq";
  if (normalized.includes("convert")) return "converted";
  return "unknown";
}

const messageSchema = new Schema(
  {
    role: {
      type: String,
      enum: ["system", "user", "assistant", "tool"],
      required: true,
    },
    content: {
      type: String,
      default: "",
    },
    toolCalls: {
      type: [Schema.Types.Mixed],
      default: [],
    },
    actionCards: {
      type: [Schema.Types.Mixed],
      default: [],
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

const salesConversationSchema = new Schema(
  {
    sessionId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    visitorInfo: {
      ip: { type: String, default: "" },
      userAgent: { type: String, default: "" },
      location: { type: Schema.Types.Mixed, default: {} },
    },
    currentFunnel: {
      type: String,
      enum: [
        "unknown",
        "service_booking",
        "dumpster_rental",
        "junk_removal",
        "tree_service",
        "porta_potty",
        "contractor",
        "contractor_professional",
        "provider",
        "provider_onboarding",
        "commercial",
        "commercial_builder",
        "support",
        "general_faq",
        "initial_intent",
        "converted",
      ],
      default: "unknown",
      set: normalizeSalesFunnel,
      index: true,
    },
    leadRef: {
      type: Schema.Types.ObjectId,
      ref: "SalesLead",
      default: null,
      index: true,
    },
    messages: {
      type: [messageSchema],
      default: [],
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true }
);

salesConversationSchema.index({ currentFunnel: 1, createdAt: -1 });

const SalesConversation = model("SalesConversation", salesConversationSchema);
export default SalesConversation;
