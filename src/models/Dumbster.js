import mongoose from "mongoose";
const dumbsterSchema = new mongoose.Schema({
  description: String,
  price: {
    type: Number,
    default: 0,
  },
  company_price: {
    type: Number,
    default: 0,
  },
  size: {
    type: String,
    default: "10-12",
    enum: ["6-8", "10-12", "14-16", "18-20", "30", "40"],
  },
  delivery_price_km: {
    type: Number,
    default: 0,
  },
  day_price_km: {
    type: Number,
    default: 0,
  },
  company_delivery_price_km: {
    type: Number,
    default: 0,
  },
  company_day_price_km: {
    type: Number,
    default: 0,
  },
  tons: {
    type: Number,
    default: 0,
  },
  three_days_price: {
    type: Number,
    default: 0,
  },
  three_days_saved: {
    type: Number,
    default: 0,
  },
  seven_days_price: {
    type: Number,
    default: 0,
  },
  seven_days_saved: {
    type: Number,
    default: 0,
  },
  per_dim_rate: {
    type: Number,
    default: 0,
  },
  company_three_days_price: {
    type: Number,
    default: 0,
  },
  company_three_days_saved: {
    type: Number,
    default: 0,
  },
  company_seven_days_price: {
    type: Number,
    default: 0,
  },
  company_seven_days_saved: {
    type: Number,
    default: 0,
  },
  company_per_dim_rate: {
    type: Number,
    default: 0,
  },
  dimension: String,
  weight: String,
  usage: String,
  status: {
    type: String,
    default: "active",
    enum: ["active", "deactive"],
  },
  // Growth platform: branded wrap / BINS-branded can line
  branded: {
    type: Boolean,
    default: false,
    index: true,
  },
  brandedApprovedAt: {
    type: Date,
    default: null,
  },
  createdAt: { type: Date, default: Date.now, index: true }, // Timestamp for post creation
  updatedAt: { type: Date, default: Date.now, index: true }, // Timestamp for post creation
});

export default mongoose.model("Dumbster", dumbsterSchema);
