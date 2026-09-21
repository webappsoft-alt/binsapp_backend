import { Schema, model } from "mongoose";

const junkRemovalAdminConfigurationSchema = new Schema(
  {
    description: String,

    // Global pricing constraints
    global_rules: {
      min_price_floor: { type: Number, default: 150 }, // Minimum payout for any job
      max_instant_quote: { type: Number, default: 2500 }, // Over this → manual review
    },

    // 1) Volume Tiers (Base Price) — estimated cubic yards from photos
    volume_tiers: [
      {
        region: { type: String, required: true },
        min_cubic_yards: { type: Number, required: true }, // e.g., 0
        max_cubic_yards: { type: Number, required: true }, // e.g., 3
        base_price: { type: Number, required: true },
        trigger_manual_review: { type: Boolean, default: false }, // e.g., for 20+ cy
      },
    ],

    // 2) Weight / Density Add-on Tiers — estimated lbs (heavy debris surcharge)
    weight_tiers: [
      {
        region: { type: String, required: true },
        min_lbs: { type: Number, required: true },
        max_lbs: { type: Number, required: true },
        add_on_fee: { type: Number, default: 0 },
        trigger_manual_review: { type: Boolean, default: false }, // For extreme weight
      },
    ],

    // 3) Item Type Multipliers — applied to (base + weight add-on)
    item_type_multipliers: [
      {
        region: { type: String, required: true },
        household: { type: Number, default: 1.0 },      // Household junk, clutter
        furniture: { type: Number, default: 1.1 },      // Sofas, mattresses, tables
        construction: { type: Number, default: 1.35 },  // Drywall, concrete, wood debris
        electronics: { type: Number, default: 1.2 },    // TVs, appliances (e-waste fees)
        mixed: { type: Number, default: 1.15 },         // Mix of types — averaged
        unknown: { type: Number, default: 1.1 },        // Could not determine from photos
      },
    ],

    // 4) Access Fees (regional, additive) — Based on pickup location difficulty
    access_fees: [
      {
        region: { type: String, required: true },
        ground_floor: { type: Number, default: 0 },         // Ground level, easy access
        stairs_per_flight: { type: Number, default: 50 },   // Per flight of stairs
        elevator: { type: Number, default: 75 },            // Building with elevator access
        long_carry: { type: Number, default: 100 },         // Carry > 50 ft to truck
      },
    ],

    // 5) Hazard / Special Handling Fees (summable)
    hazard_fees: [
      {
        region: { type: String, required: true },
        hazardous_materials: { type: Number, default: 300 }, // Paint, chemicals, batteries
        heavy_lift_required: { type: Number, default: 150 }, // Pianos, safes, industrial equipment
        same_day_dispatch: { type: Number, default: 200 },   // Urgent same-day service
        requires_permits: { type: Number, default: 175 },    // Municipal permit needed
        trigger_manual_review: { type: Boolean, default: false }, // Force manual review flag
      },
    ],
  },
  { timestamps: true },
);

const JunkRemovalAdminConfiguration = model(
  "JunkRemovalAdminConfiguration",
  junkRemovalAdminConfigurationSchema,
);
export default JunkRemovalAdminConfiguration;
