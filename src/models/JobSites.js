import { Schema, model } from "mongoose";

const jobSitesSchema = new Schema(
  {
    company: {
      type: Schema.Types.ObjectId,
      ref: "Company",
    },
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    dumbsterId: {
      type: Schema.Types.ObjectId,
      ref: "Dumbster",
    },
    portaPottyId: {
      type: Schema.Types.ObjectId,
      ref: "PortaPotty",
    },
    /** Primary service this jobsite is set up for (dumpster, junk, porta, tree). */
    serviceType: {
      type: String,
      enum: ["dumpster", "junk", "porta", "tree"],
      default: "dumpster",
    },
    siteName: {
      type: String,
      required: true,
    },
    /** Project / community name (builder workflow). */
    projectName: { type: String, default: "" },
    communityName: { type: String, default: "" },
    /** Division / region within the builder org (e.g. Florida Division). */
    division: { type: String, default: "" },
    jobNumber: { type: String, default: "" },
    poNumber: { type: String, default: "" },
    costCode: { type: String, default: "" },
    billingReference: { type: String, default: "" },
    siteContactName: { type: String, default: "" },
    siteContactPhone: { type: String, default: "" },
    /** Names/phones of supers authorized to run field requests from BINS APP. */
    authorizedUsers: { type: String, default: "" },
    /** Standing service notes for drivers / exchanges (beyond placement). */
    serviceInstructions: { type: String, default: "" },
    gateAccessInstructions: { type: String, default: "" },
    deliveryRestrictions: { type: String, default: "" },
    hoursAllowedOnsite: { type: String, default: "" },
    materialRestrictions: { type: String, default: "" },
    address: {
      type: String,
      required: true,
    },
    location: {
      type: {
        type: String,
        enum: ["Point"],
      },
      coordinates: {
        type: [Number],
      },
    },
    city: { type: String },
    state: { type: String },
    notes: String,
    instructions: String,
    /** Exact dumpster / unit placement instructions (reused on exchanges). */
    placementInstructions: { type: String, default: "" },
    placementPhotoUrl: { type: String, default: "" },
    /** Multi-image support for placement and jobsite reference photos */
    placementPhotos: {
      type: [String],
      default: [],
    },
    images: {
      type: [String],
      default: [],
    },
    /** GPS pin for exact placement (separate from human-readable placementLocation). */
    placementGeo: {
      type: {
        type: String,
        enum: ["Point"],
      },
      coordinates: {
        type: [Number],
      },
    },
    num_days: { type: Number },
    quantity: { type: Number },
    time: { type: String },
    materialInformation: { type: String },
    category: { type: String },
    subCategory: { type: String },
    dropoff_image: { type: String },
    image: { type: String },
    status: { type: String, enum: ["active", "deleted"], default: "active" },
    isSiteContactRequired: { type: Boolean, default: false },
    /** Preferred commercial dumpster size for reorders (10–40). */
    defaultSize: {
      type: String,
      enum: ["10", "15", "20", "30", "40"],
      default: undefined,
    },
    /**
     * Delivery windows. Accepts a single legacy string or an array.
     * Mongoose casts a lone string into a one-element array.
     */
    deliveryWindows: {
      type: [String],
      enum: ["Morning", "Afternoon", "Evening", "SpecificTime"],
      default: undefined,
      set(value) {
        if (value == null || value === "") return value;
        return Array.isArray(value) ? value : [value];
      },
    },
    deliveryTime: {
      type: Date,
      required: function () {
        const windows = Array.isArray(this.deliveryWindows)
          ? this.deliveryWindows
          : this.deliveryWindows
            ? [this.deliveryWindows]
            : [];
        return windows.includes("SpecificTime");
      },
    },
    /** Human-readable placement label (e.g. driveway side). */
    placementLocation: { type: String },
    accessNotes: { type: String },
    zip: { type: String, default: "" },
  },
  { timestamps: true },
);

const JobSites = model("JobSites", jobSitesSchema);
export default JobSites;
