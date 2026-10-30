import mongoose from "mongoose";

const smsLogSchema = new mongoose.Schema(
  {
    to: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },
    from: {
      type: String,
      default: "BINSAPP",
      trim: true,
    },
    body: {
      type: String,
      required: true,
      trim: true,
    },
    sid: {
      type: String,
      default: null,
      index: true,
    },
    status: {
      type: String,
      enum: [
        "queued",
        "sending",
        "sent",
        "delivered",
        "undelivered",
        "failed",
        "mocked",
      ],
      default: "sent",
      index: true,
    },
    errorCode: {
      type: String,
      default: null,
    },
    errorMessage: {
      type: String,
      default: null,
    },
    mediaUrl: {
      type: String,
      default: null,
    },
    channel: {
      type: String,
      enum: ["SMS", "MMS"],
      default: "SMS",
    },
    type: {
      type: String,
      enum: [
        "lead_alert",
        "estimate_sent",
        "estimate_accepted",
        "dispatch_alert",
        "test_sms",
        "general",
      ],
      default: "general",
      index: true,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for fast searching and sorting
smsLogSchema.index({ createdAt: -1 });
smsLogSchema.index({ to: 1, createdAt: -1 });

const SmsLog = mongoose.models.SmsLog || mongoose.model("SmsLog", smsLogSchema);

export default SmsLog;
