import mongoose from "mongoose";
const notificationSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  to_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  type: {
    type: String,
    default: "request",
    enum: [
      "request",
      "order",
      "rating",
      "message",
      "offer",
      "dustbin",
      "admin-noti",
      "support",
      "user",
      "company",
      // Commercial portal deep-link types
      "swap_requested",
      "swap_accepted",
      "swap_completed",
      "invoice_created",
      "invoice_due",
      "overage_recorded",
      "lead_received",
      "plan_assigned",
      "weight_recorded",
      // Growth platform
      "growth_tier_unlocked",
      "growth_progress_milestone",
      "growth_gate_failed",
      "growth_tier_lost",
      "financing_application_received",
      "financing_application_approved",
      "financing_application_denied",
      "financing_application_submitted",
      "order_reassigned",
    ],
  },
  order: { type: mongoose.Schema.Types.ObjectId, ref: "Order" },
  request: { type: mongoose.Schema.Types.ObjectId, ref: "Request" },
  dustbin: { type: mongoose.Schema.Types.ObjectId, ref: "Dustbin" },
  description: {
    type: String,
    required: true,
  },
  isImportant: {
    type: Boolean,
    default: false,
  },
  title: {
    type: String,
    required: true,
  },
  seen: {
    type: Boolean,
    default: false,
  },
  /** Deep-link / routing payload (e.g. builder_offer offerId, screen) */
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: null,
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true,
  },
});

export default mongoose.model("Notification", notificationSchema);
