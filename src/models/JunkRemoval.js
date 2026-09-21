import { Schema, model } from "mongoose";
const bookingSchema = new Schema({
  startDate: {
    type: Date,
    required: true,
  },
  endDate: {
    type: Date,
    required: true,
  },
});
const junkRemovalSchema = new Schema(
  {
    companyName: { type: String, default: "", required: true },
    legalBusinessName: { type: String, default: "", required: true },
    sameDayAvailable: { type: Boolean, default: false },
    ein: { type: String, default: "", required: true },
    drivers_license: { type: [String], default: [] },
    isDriversLicenseApproved: { type: Boolean, default: false },
    drivers_license_note: { type: String, default: "" },
    ownerFullName: { type: String, default: "", required: true },
    email: { type: String, default: "" },
    location: {
      type: {
        type: String,
        enum: ["Point"],
        default: "Point",
      },
      coordinates: { type: [Number], default: [0, 0] },
    },
    address: { type: String, default: "" },
    city: { type: String, default: "" },
    state: { type: String, default: "" },
    zip: { type: String, default: "" },
    country: { type: String, default: "" },
    COI: { type: String, default: "" },
    isCOIAApproved: { type: Boolean, default: false },
    COI_note: { type: String, default: "" },
    Business_license: { type: String, default: "" },
    isBusinessLicenseApproved: { type: Boolean, default: false },
    Business_license_note: { type: String, default: "" },
    minimum_insurance_amount: { type: String, default: "" },
    status: {
      type: String,
      default: "pending",
      enum: ["pending", "approved", "rejected"],
    },
    notes: { type: String, default: "" },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    bookings: {
      type: [bookingSchema],
      default: [],
    },
    radius: {
      type: Number,
      default: 25,
    },
  },
  { timestamps: true },
);
junkRemovalSchema.index({ location: "2dsphere" });
const JunkRemoval = model("JunkRemoval", junkRemovalSchema);
export default JunkRemoval;
