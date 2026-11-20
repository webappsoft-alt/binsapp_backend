import { Schema, model } from "mongoose";

/**
 * One admin "Send notification" action. Keeps what was sent (per channel), to whom and how it
 * went, so the admin History tab can show past broadcasts.
 */
const channelResult = new Schema(
  {
    attempted: { type: Number, default: 0 },
    sent: { type: Number, default: 0 },
    failed: { type: Number, default: 0 },
    skipped: { type: Number, default: 0 },
  },
  { _id: false },
);

const recipientSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "User" },
    name: String,
    email: String,
    phone: String,
    push: { type: String, enum: ["sent", "failed", "skipped", null], default: null },
    email_status: { type: String, enum: ["sent", "failed", "skipped", null], default: null },
    sms: { type: String, enum: ["sent", "failed", "skipped", null], default: null },
    error: String,
  },
  { _id: false },
);

const notificationBroadcastSchema = new Schema(
  {
    channels: { type: [String], enum: ["push", "email", "sms"], default: [] },
    audience: {
      type: String,
      enum: ["all", "renter", "rentee", "commercial", "users"],
      required: true,
    },
    push: {
      title: String,
      description: String,
      imageUrl: String,
    },
    email: {
      subject: String,
      html: String,
      templateId: { type: Schema.Types.ObjectId, ref: "Template", default: null },
      templateTitle: String,
    },
    sms: {
      body: String,
      mediaUrl: String,
    },
    recipientCount: { type: Number, default: 0 },
    recipients: { type: [recipientSchema], default: [] },
    results: {
      push: { type: channelResult, default: () => ({}) },
      email: { type: channelResult, default: () => ({}) },
      sms: { type: channelResult, default: () => ({}) },
    },
    status: {
      type: String,
      enum: ["sending", "sent", "partial", "failed"],
      default: "sending",
      index: true,
    },
    sentBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    completedAt: Date,
  },
  { timestamps: true },
);

notificationBroadcastSchema.index({ createdAt: -1 });

const NotificationBroadcast = model("NotificationBroadcast", notificationBroadcastSchema);
export default NotificationBroadcast;
