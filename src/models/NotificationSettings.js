import { Schema, model } from "mongoose";

/**
 * Singleton (key: "default") — where admin notifications are allowed to go.
 *
 * channels.*            master switch per channel for admin broadcasts
 * audienceDefaults.*    channels pre-selected on the Send page for each audience
 * sms / email           small per-channel options
 */
const channelsShape = {
  push: { type: Boolean, default: true },
  email: { type: Boolean, default: true },
  sms: { type: Boolean, default: true },
};

const notificationSettingsSchema = new Schema(
  {
    key: { type: String, default: "default", unique: true },
    channels: channelsShape,
    audienceDefaults: {
      all: { type: [String], default: ["push"] },
      renter: { type: [String], default: ["push", "email"] },
      rentee: { type: [String], default: ["push", "email"] },
      commercial: { type: [String], default: ["email"] },
      users: { type: [String], default: ["push"] },
    },
    sms: {
      footer: { type: String, default: "Reply STOP to opt out." },
      appendFooter: { type: Boolean, default: true },
      maxLength: { type: Number, default: 320 },
    },
    email: {
      useBrandedLayout: { type: Boolean, default: true },
      replyTo: { type: String, default: "" },
    },
    skipInactiveUsers: { type: Boolean, default: true },
    requireConfirmAbove: { type: Number, default: 100 },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true },
);

const NotificationSettings = model("NotificationSettings", notificationSettingsSchema);
export default NotificationSettings;
