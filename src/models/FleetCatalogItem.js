import { Schema, model } from "mongoose";

const financingConfigSchema = new Schema(
  {
    termMonths: { type: Number, default: 36, min: 1 },
    aprPercent: { type: Number, default: 0, min: 0 },
    estMonthlyPayment: { type: Number, default: null },
    downPaymentPercent: { type: Number, default: 0, min: 0, max: 100 },
  },
  { _id: false },
);

const fleetCatalogItemSchema = new Schema(
  {
    manufacturer: { type: String, required: true, trim: true },
    size: {
      type: String,
      required: true,
      enum: ["10", "12", "14", "15", "16", "18", "20", "30", "40"],
    },
    color: { type: String, default: "", trim: true },
    branded: { type: Boolean, default: false },
    specs: { type: String, default: "" },
    photos: { type: [String], default: [] },
    cashPrice: { type: Number, required: true, min: 0 },
    financing: { type: financingConfigSchema, default: () => ({}) },
    stockStatus: {
      type: String,
      enum: ["in_stock", "low_stock", "out_of_stock", "preorder"],
      default: "in_stock",
    },
    active: { type: Boolean, default: true, index: true },
    packageKeys: { type: [String], default: [] },
  },
  { timestamps: true },
);

fleetCatalogItemSchema.index({ active: 1, branded: 1, size: 1 });

export default model("FleetCatalogItem", fleetCatalogItemSchema);
