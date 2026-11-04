import { Schema, model } from "mongoose";

const cenzoInquirySchema = new Schema(
  {
    fullName: {
      type: String,
      required: true,
      trim: true,
    },
    company: {
      type: String,
      trim: true,
      default: "",
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    phone: {
      type: String,
      required: true,
      trim: true,
    },
    inquiryType: {
      type: String,
      trim: true,
      default: "General Inquiry",
    },
    projectLocation: {
      type: String,
      trim: true,
      default: "",
    },
    heardAbout: {
      type: String,
      trim: true,
      default: "",
    },
    message: {
      type: String,
      trim: true,
      default: "",
    },
    status: {
      type: String,
      enum: ["new", "reviewed", "contacted", "archived"],
      default: "new",
      index: true,
    },
    adminEmailSent: {
      type: Boolean,
      default: false,
    },
    clientEmailSent: {
      type: Boolean,
      default: false,
    },
    emailErrors: {
      type: [String],
      default: [],
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  },
);

cenzoInquirySchema.index({ createdAt: -1 });
cenzoInquirySchema.index({ email: 1, status: 1 });

const CenzoInquiry = model("CenzoInquiry", cenzoInquirySchema);
export default CenzoInquiry;

