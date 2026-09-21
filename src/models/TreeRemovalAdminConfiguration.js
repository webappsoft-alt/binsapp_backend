import { Schema, model } from "mongoose";

const treeRemovalAdminConfigurationSchema = new Schema(
  {
    description: String,

    // Document Rule: Pricing logic thresholds
    global_rules: {
      min_price_floor: { type: Number, default: 450 }, // Minimum payout
      max_instant_quote: { type: Number, default: 5000 }, // Threshold for manual review
    },

    // 1) Height Tiers (Base Price) - Based on Document "Height base price"
    height_tiers: [
      {
        region: { type: String, required: true },
        minimum_height: { type: Number, required: true }, // e.g., 0
        maximum_height: { type: Number, required: true }, // e.g., 20
        base_price: { type: Number, required: true },
        trigger_manual_review: { type: Boolean, default: false }, // For 80+ ft
      },
    ],

    // 2) DBH (Diameter at Breast Height) Add-ons
    dbh_tiers: [
      {
        region: { type: String, required: true },
        minimum_diameter: { type: Number, required: true }, // e.g., 0
        maximum_diameter: { type: Number, required: true }, // e.g., 12
        add_on_fee: { type: Number, default: 0 },
        trigger_manual_review: { type: Boolean, default: false }, // For 48+ in
      },
    ],

    // 3) Tree Type Multipliers - Based on Document "Type multipliers"
    type_multipliers: [
      {
        region: { type: String, required: true },
        standard: { type: Number, default: 1.0 },
        hardwood: { type: Number, default: 1.15 },
        palm: { type: Number, default: 1.1 },
        unknown: { type: Number, default: 1.05 },
      },
    ],

    // 4) Access Fees - Based on Document "Access add-ons"
    access_fees: [
      {
        region: { type: String, required: true },
        easy: { type: Number, default: 0 },
        moderate: { type: Number, default: 200 },
        difficult: { type: Number, default: 450 },
      },
    ],

    // 5) Hazard Fees (Summable) - Based on Document "Hazard add-ons"
    hazard_fees: [{
      region: { type: String, required: true },
      power_lines: { type: Number, default: 500 },
      near_structure: { type: Number, default: 400 },
      tight_drop_zone: { type: Number, default: 250 },
      emergency_same_day: { type: Number, default: 250 },
      crane_likely: { trigger_manual_review: { type: Boolean, default: true } },
      manual_review: { type: Boolean, default: false },
    }],

    // Document mentions Partners bring their own dumpsters,
    // so disposal is simplified or removed from individual bins logic.
    // disposal_notes: {
    //   type: String,
    //   default: "Partner provides own equipment/dumpster",
    // },
  },
  { timestamps: true },
);

const TreeRemovalAdminConfiguration = model(
  "TreeRemovalAdminConfiguration",
  treeRemovalAdminConfigurationSchema,
);
export default TreeRemovalAdminConfiguration;
