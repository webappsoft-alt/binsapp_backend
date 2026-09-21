import { Schema, model } from "mongoose";

const leadSchema = new Schema(
  {
    companyName: { type: String, required: true, trim: true },
    contactName: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    phone: { type: String, required: true, trim: true },
    serviceArea: { type: String, default: "" },
    estimatedMonthlyVolume: { type: Number, default: 0 },
    numberOfLocations: { type: Number, default: 1 },
    notes: { type: String, default: "" },
    status: {
      type: String,
      enum: ["new", "contacted", "converted"],
      default: "new",
      index: true,
    },
    convertedCompany: {
      type: Schema.Types.ObjectId,
      ref: "Company",
      default: null,
    },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
);

leadSchema.index({ createdAt: -1 });
leadSchema.index({ email: 1, status: 1 });

const Lead = model("Lead", leadSchema);
export default Lead;
