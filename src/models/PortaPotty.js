import { Schema, model } from "mongoose";

const portaPottySchema = new Schema(
  {
    description: String,

    // 1. Unit Classification
    unit_type: {
      type: String,
      enum: [
        "Standard",
        "Deluxe with Sink",
        "ADA Accessible (Wheelchair)",
        "High-Rise (with Crane Hook)",
        "Luxury Trailer (Multi-stall)",
      ],
      default: "Standard",
    },

    // 2. Rental Rates (Duration Based)
    rates: {
      per_dim_rate: { type: Number, default: 0 },
      day_price_km: { type: Number, default: 0 },
      three_days_price: { type: Number, default: 0 },
      three_days_saved: { type: Number, default: 0 },
      seven_days_price: { type: Number, default: 0 },
      seven_days_saved: { type: Number, default: 0 },
      min_rental_period_days: { type: Number, default: 1 },
    },

    // 3. Service & Maintenance (Crucial)
    service_plan: {
      cleaning_frequency_label: {
        type: String,
        enum: ["Once Weekly", "Twice Weekly", "Daily", "On-Call"],
        default: "Once Weekly",
      },
      extra_cleaning_fee: { type: Number, default: 0 },
      hand_sanitizer_refill_included: { type: Boolean, default: true },
      paper_towel_refill_included: { type: Boolean, default: true },
    },

    // 4. Specs & Capacity
    specs: {
      user_capacity_estimate: Number, // e.g., 1 unit per 10 workers/shift
      tank_volume_gallons: Number,
      dimension: String, // e.g., 4ft x 4ft x 7.5ft
      weight_lbs: Number, // Transport purposes ke liye
    },

    // 5. Logistics Fees
    base_price: { type: Number, default: 0 },
    delivery_setup_fee: { type: Number, default: 0 },
    pickup_fee: { type: Number, default: 0 }, // Kuch vendors pickup ka alag charge karty hain
    travel_fee_per_km: { type: Number, default: 0 },
    emergency_service_fee: { type: Number, default: 0 }, // 24-hour delivery

    // 6. Marketplace Logic
    is_addon_only: { type: Boolean, default: false }, // Agar siraf dumpster ke sath dena ho
    placement_requirements: String, // e.g., "Must be on flat level ground"

    // Status & Usage
    usage: {
      type: String,
      enum: ["Construction", "Event", "Agricultural", "Residential"],
    },
    status: {
      type: String,
      default: "active",
      enum: ["active", "deactive"],
    },
  },
  { timestamps: true },
);

const PortaPotty = model("PortaPotty", portaPottySchema);
export default PortaPotty;
