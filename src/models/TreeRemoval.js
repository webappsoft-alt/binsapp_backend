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
const treeRemovalSchema = new Schema(
  {
    companyName: { type: String, default: "", required: true },
    legalBusinessName: { type: String, default: "", required: true },
    sameDayAvailable: { type: Boolean, default: false },
    ein: { type: String, default: "", },
    drivers_license: { type: [String], default: [], required: true },
    isDriversLicenseApproved: { type: Boolean, default: false },
    drivers_license_note: { type: String, default: "" },
    ownerFullName: { type: String, default: "", required: true },
    location: {
      type: {
        type: String,
        enum: ["Point"],
        default: "Point",
      },
      coordinates: { type: [Number], default: [0, 0] },
    },
    address: { type: String, default: "", },
    city: { type: String, default: "", },
    state: { type: String, default: "", },
    zip: { type: String, default: "", },
    country: { type: String, default: "", },
    radius: { type: Number, default: 25, required: true }, // in miles
    COI: { type: String, default: "", required: true },
    isCOIApproved: { type: Boolean, default: false },
    COI_note: { type: String, default: "" },
    License_Type: { type: String, default: "", },
    License_Number: { type: String, default: "", },
    License_State: { type: String, default: "", },
    License_Expiration: { type: Date, default: null, },
    Tree_removal_license: { type: String, default: "", required: true },
    isTreeRemovalLicenseApproved: { type: Boolean, default: false },
    Tree_removal_license_note: { type: String, default: "" },
    Workers_comp: { type: String, default: "", },
    isWorkersCompApproved: { type: Boolean, default: false },
    Workers_comp_note: { type: String, default: "" },
    isArboristCredentialApproved: { type: Boolean, default: false },
    Certified_arborist: { type: Boolean, default: false },
    Certified_arborist_note: { type: String, default: "" },
    Arborist_credential: { type: String, default: "" },
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
  },
  { timestamps: true },
);

treeRemovalSchema.index({ location: "2dsphere" });

const TreeRemoval = model("TreeRemoval", treeRemovalSchema);
export default TreeRemoval;
