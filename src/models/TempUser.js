import mongoose from "mongoose";
const { Schema, model } = mongoose;

const tempUserSchema = new Schema(
  {
    email: {
      type: String,
      // required: true,
      default: "",
      trim: true,
      unique: true,
      lowercase: true,
    },
    type: {
      type: String,
      required: true,
      enum: [
        "verification",
        "forgot",
        "mfa",
        "invite",
        "magic-login",
        "email-change",
        "pre-register",
        "mobile-verify",
        "consent",
      ],
    },
    code: {
      type: String,
      required: true,
    },
    phone: String,
    expiresAt: {
      type: Date,
      required: true,
    },
    attempts: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// Auto-delete expired records (TTL index)
tempUserSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const TempUser = model("TempUser", tempUserSchema);
export default TempUser;
