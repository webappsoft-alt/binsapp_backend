import Joi from "joi";

export const createDumbsterSchema = Joi.object({
  usage: Joi.string(),
  weight: Joi.string(),
  dimension: Joi.string(),
  per_dim_rate: Joi.number(),
  seven_days_saved: Joi.number(),
  seven_days_price: Joi.number(),
  three_days_saved: Joi.number(),
  three_days_price: Joi.number(),
  tons: Joi.number(),
  day_price_km: Joi.number(),
  delivery_price_km: Joi.number(),
  company_delivery_price_km: Joi.number(),
  company_day_price_km: Joi.number(),
  company_three_days_price: Joi.number(),
  company_three_days_saved: Joi.number(),
  company_seven_days_price: Joi.number(),
  company_seven_days_saved: Joi.number(),
  company_per_dim_rate: Joi.number(),
  company_price: Joi.number(),
  size: Joi.string()
    .required()
    .valid("6-8", "10-12", "14-16", "18-20", "30", "40"),
  price: Joi.number(),
  description: Joi.string(),
});

export const updateDumbsterSchema = Joi.object({
  usage: Joi.string(),
  weight: Joi.string(),
  dimension: Joi.string(),
  per_dim_rate: Joi.number(),
  seven_days_saved: Joi.number(),
  seven_days_price: Joi.number(),
  three_days_saved: Joi.number(),
  three_days_price: Joi.number(),
  tons: Joi.number(),
  day_price_km: Joi.number(),
  delivery_price_km: Joi.number(),
  company_delivery_price_km: Joi.number(),
  company_day_price_km: Joi.number(),
  company_three_days_price: Joi.number(),
  company_three_days_saved: Joi.number(),
  company_seven_days_price: Joi.number(),
  company_seven_days_saved: Joi.number(),
  company_per_dim_rate: Joi.number(),
  company_price: Joi.number(),
  size: Joi.string()
    .required()
    .valid("6-8", "10-12", "14-16", "18-20", "30", "40"),
  price: Joi.number(),
  description: Joi.string(),
});

export const updateDumbsterStatusSchema = Joi.object({
  status: Joi.string().valid("active", "inactive"),
});

export const updateJunkRemovalSchema = Joi.object({
  description: Joi.string().allow("", null).optional(),

  // Global pricing constraints
  global_rules: Joi.object({
    min_price_floor: Joi.number().min(0).default(150).optional(),
    max_instant_quote: Joi.number().min(0).default(2500).optional(),
  }).optional(),

  // 1) Volume Tiers (Base Price)
  volume_tiers: Joi.array()
    .items(
      Joi.object({
        region: Joi.string().required(),
        min_cubic_yards: Joi.number().min(0).required(),
        max_cubic_yards: Joi.number().min(0).required(),
        base_price: Joi.number().min(0).required(),
        trigger_manual_review: Joi.boolean().default(false).optional(),
      }),
    )
    .optional(),

  // 2) Weight / Density Add-on Tiers
  weight_tiers: Joi.array()
    .items(
      Joi.object({
        region: Joi.string().required(),
        min_lbs: Joi.number().min(0).required(),
        max_lbs: Joi.number().min(0).required(),
        add_on_fee: Joi.number().min(0).default(0).optional(),
        trigger_manual_review: Joi.boolean().default(false).optional(),
      }),
    )
    .optional(),

  // 3) Item Type Multipliers
  item_type_multipliers: Joi.array()
    .items(
      Joi.object({
        region: Joi.string().required(),
        household: Joi.number().min(0).default(1.0).optional(),
        furniture: Joi.number().min(0).default(1.1).optional(),
        construction: Joi.number().min(0).default(1.35).optional(),
        electronics: Joi.number().min(0).default(1.2).optional(),
        mixed: Joi.number().min(0).default(1.15).optional(),
        unknown: Joi.number().min(0).default(1.1).optional(),
      }),
    )
    .optional(),

  // 4) Access Fees (regional, additive)
  access_fees: Joi.array()
    .items(
      Joi.object({
        region: Joi.string().required(),
        ground_floor: Joi.number().min(0).default(0).optional(),
        stairs_per_flight: Joi.number().min(0).default(50).optional(),
        elevator: Joi.number().min(0).default(75).optional(),
        long_carry: Joi.number().min(0).default(100).optional(),
      }),
    )
    .optional(),

  // 5) Hazard / Special Handling Fees
  hazard_fees: Joi.array()
    .items(
      Joi.object({
        region: Joi.string().required(),
        hazardous_materials: Joi.number().min(0).default(300).optional(),
        heavy_lift_required: Joi.number().min(0).default(150).optional(),
        same_day_dispatch: Joi.number().min(0).default(200).optional(),
        requires_permits: Joi.number().min(0).default(175).optional(),
        trigger_manual_review: Joi.boolean().default(false).optional(),
      }),
    )
    .optional(),
});
export const createPortaPottySchema = Joi.object({
  description: Joi.string().allow("", null),

  // 1. Unit Classification
  unit_type: Joi.string()
    .valid(
      "Standard",
      "Deluxe with Sink",
      "ADA Accessible (Wheelchair)",
      "High-Rise (with Crane Hook)",
      "Luxury Trailer (Multi-stall)",
    )
    .default("Standard"),

  // 2. Rental Rates (Nested Object)
  rates: Joi.object({
    per_dim_rate: Joi.number().min(0).default(0),
    day_price_km: Joi.number().min(0).default(0),
    three_days_price: Joi.number().min(0).default(0),
    three_days_saved: Joi.number().min(0).default(0),
    seven_days_price: Joi.number().min(0).default(0),
    seven_days_saved: Joi.number().min(0).default(0),
    min_rental_period_days: Joi.number().min(1).default(1),
  }).required(),

  // 3. Service & Maintenance
  service_plan: Joi.object({
    cleaning_frequency_label: Joi.string()
      .valid("Once Weekly", "Twice Weekly", "Daily", "On-Call")
      .default("Once Weekly"),
    extra_cleaning_fee: Joi.number().min(0).default(0),
    hand_sanitizer_refill_included: Joi.boolean().default(true),
    paper_towel_refill_included: Joi.boolean().default(true),
  }).required(),

  // 4. Specs & Capacity
  specs: Joi.object({
    user_capacity_estimate: Joi.number().min(0).allow(null),
    tank_volume_gallons: Joi.number().min(0).allow(null),
    dimension: Joi.string().allow("", null),
    weight_lbs: Joi.number().min(0).allow(null),
  }),

  // 5. Logistics Fees
  base_price: Joi.number().min(0).default(0),
  delivery_setup_fee: Joi.number().min(0).default(0),
  pickup_fee: Joi.number().min(0).default(0),
  travel_fee_per_km: Joi.number().min(0).default(0),
  emergency_service_fee: Joi.number().min(0).default(0),

  // 6. Marketplace Logic
  is_addon_only: Joi.boolean().default(false),
  placement_requirements: Joi.string().allow("", null),

  // Status & Usage
  usage: Joi.string()
    .valid("Construction", "Event", "Agricultural", "Residential")
    .allow(null),

  status: Joi.string().valid("active", "deactive").default("active"),
});
export const updatePortaPottySchema = Joi.object({
  description: Joi.string().allow("", null).optional(),

  // 1. Unit Classification
  unit_type: Joi.string()
    .valid(
      "Standard",
      "Deluxe with Sink",
      "ADA Accessible (Wheelchair)",
      "High-Rise (with Crane Hook)",
      "Luxury Trailer (Multi-stall)",
    )
    .default("Standard")
    .optional(),

  // 2. Rental Rates (Nested Object)
  rates: Joi.object({
    per_dim_rate: Joi.number().min(0).default(0).optional(),
    day_price_km: Joi.number().min(0).default(0).optional(),
    three_days_price: Joi.number().min(0).default(0).optional(),
    three_days_saved: Joi.number().min(0).default(0).optional(),
    seven_days_price: Joi.number().min(0).default(0).optional(),
    seven_days_saved: Joi.number().min(0).default(0).optional(),
    min_rental_period_days: Joi.number().min(1).default(1).optional(),
  }).optional(),

  // 3. Service & Maintenance
  service_plan: Joi.object({
    cleaning_frequency_label: Joi.string()
      .valid("Once Weekly", "Twice Weekly", "Daily", "On-Call")
      .default("Once Weekly")
      .optional(),
    extra_cleaning_fee: Joi.number().min(0).default(0).optional(),
    hand_sanitizer_refill_included: Joi.boolean().default(true).optional(),
    paper_towel_refill_included: Joi.boolean().default(true).optional(),
  }).optional(),

  // 4. Specs & Capacity
  specs: Joi.object({
    user_capacity_estimate: Joi.number().min(0).allow(null).optional(),
    tank_volume_gallons: Joi.number().min(0).allow(null).optional(),
    dimension: Joi.string().allow("", null).optional(),
    weight_lbs: Joi.number().min(0).allow(null).optional(),
  }).optional(),

  // 5. Logistics Fees
  base_price: Joi.number().min(0).default(0).optional(),
  delivery_setup_fee: Joi.number().min(0).default(0).optional(),
  pickup_fee: Joi.number().min(0).default(0).optional(),
  travel_fee_per_km: Joi.number().min(0).default(0).optional(),
  emergency_service_fee: Joi.number().min(0).default(0).optional(),

  // 6. Marketplace Logic
  is_addon_only: Joi.boolean().default(false).optional(),
  placement_requirements: Joi.string().allow("", null).optional(),

  // Status & Usage
  usage: Joi.string()
    .valid("Construction", "Event", "Agricultural", "Residential")
    .allow(null)
    .optional(),

  status: Joi.string().valid("active", "deactive").default("active").optional(),
});

export const updateTreeRemovalSchema = Joi.object({
  description: Joi.string().allow("", null).optional(),

  // 1. Global Rules (Document constraints)
  global_rules: Joi.object({
    min_price_floor: Joi.number().min(0).default(450).optional(),
    max_instant_quote: Joi.number().min(0).default(5000).optional(),
  }).optional(),

  // 2. Height Tiers (Base Price - Document Section 3)
  height_tiers: Joi.array()
    .items(
      Joi.object({
        region: Joi.string().required(),
        minimum_height: Joi.number().min(0).required(),
        maximum_height: Joi.number().min(0).required(),
        base_price: Joi.number().min(0).required(),
        trigger_manual_review: Joi.boolean().default(false),
      }),
    )
    .optional(),

  // 3. DBH (Diameter) Tiers
  dbh_tiers: Joi.array()
    .items(
      Joi.object({
        region: Joi.string().required(),
        minimum_diameter: Joi.number().min(0).required(),
        maximum_diameter: Joi.number().min(0).required(),
        add_on_fee: Joi.number().min(0).required(),
        trigger_manual_review: Joi.boolean().default(false),
      }),
    )
    .optional(),

  // 4. Tree Type Multipliers (Standard, Hardwood, etc.)
  type_multipliers: Joi.array()
    .items(
      Joi.object({
        region: Joi.string().required(),
        standard: Joi.number().min(0).default(1.0),
        hardwood: Joi.number().min(0).default(1.15),
        palm: Joi.number().min(0).default(1.1),
        unknown: Joi.number().min(0).default(1.05),
      }),
    )
    .optional(),

  // 5. Access Fees
  access_fees: Joi.array()
    .items(
      Joi.object({
        region: Joi.string().required(),
        easy: Joi.number().min(0).default(0),
        moderate: Joi.number().min(0).default(200),
        difficult: Joi.number().min(0).default(450),
      }),
    )
    .optional(),

  // 6. Hazard Fees (Summable)
  hazard_fees: Joi.array()
    .items(
      Joi.object({
        region: Joi.string().required(),
        power_lines: Joi.number().min(0).default(500),
        near_structure: Joi.number().min(0).default(400),
        tight_drop_zone: Joi.number().min(0).default(250),
        emergency_same_day: Joi.number().min(0).default(250),
        crane_likely: Joi.object({
          trigger_manual_review: Joi.boolean().default(true),
        }).optional(),
        manual_review: Joi.boolean().default(false),
      }),
    )
    .optional(),

  // Status & Metadata
  status: Joi.string().valid("active", "deactive").default("active").optional(),
  disposal_notes: Joi.string().allow("", null).optional(),
});
