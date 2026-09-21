/**
 * Builder Offer contracts — parallel path to residential race-to-accept.
 * Do not overload update-request-renter for partial quantity accepts.
 */

export const BUILDER_OFFER_STATUSES = Object.freeze([
  "draft",
  "open",
  "partially_fulfilled",
  "fulfilled",
  "needs_adjustment",
  "cancelled",
  "expired",
]);

export const BUILDER_OFFER_FULFILLMENT_PREFERENCES = Object.freeze([
  "single_provider",
  "multiple_providers",
]);

export const BUILDER_OFFER_SERVICE_TYPES = Object.freeze([
  "dumpster",
  "junk",
  "porta",
  "tree",
]);

export const BUILDER_OFFER_SERVICE_LABELS = Object.freeze({
  dumpster: "Dumpster Rental",
  junk: "Junk Removal & Site Cleanup",
  porta: "Portable Sanitation",
  tree: "Tree Services",
});

export const BUILDER_OFFER_LINE_TYPES = Object.freeze([
  "bin",
  "exchange_pull",
  "additional_day",
  "additional_ton",
  "pass_through",
  "service_visit",
  "servicing",
]);

/** Default fee eligibility by line type (tax/disposal = pass-through). */
export const LINE_TYPE_FEE_ELIGIBLE = Object.freeze({
  bin: true,
  exchange_pull: true,
  additional_day: true,
  additional_ton: true,
  pass_through: false,
  service_visit: true,
  servicing: true,
});

export const BUILDER_OFFER_EVENT_TYPES = Object.freeze([
  "created",
  "submitted",
  "matched",
  "portion_notified",
  "accepted",
  "rejected_portion",
  "adjusted",
  "counter_submitted",
  "counter_accepted",
  "counter_rejected",
  "needs_adjustment",
  "fulfilled",
  "cancelled",
  "blanket_saved",
  "recommendation_viewed",
]);

export const BUILDER_OFFER_SOCKET_EVENTS = Object.freeze({
  created: "builder-offer:created",
  updated: "builder-offer:updated",
  portion: "builder-offer:portion",
  accepted: "builder-offer:accepted",
  counter: "builder-offer:counter",
  needsAdjustment: "builder-offer:needs-adjustment",
});

/** Hours with remaining bins and no accepts before needs_adjustment. */
export const BUILDER_OFFER_STUCK_HOURS = 24;

/** Default offer open window before auto-expire. */
export const BUILDER_OFFER_EXPIRE_DAYS = 14;

/** Commercial dumpster yard sizes (includes 10 / 15 per builder workflow). */
export const COMMERCIAL_DUMPSTER_SIZES = Object.freeze([
  "10",
  "15",
  "20",
  "30",
  "40",
]);

export const COMMERCIAL_PORTA_UNIT_TYPES = Object.freeze([
  "standard",
  "ada",
  "flushable",
  "sink_station",
  "handwash",
]);

export const COMMERCIAL_JUNK_UNIT_TYPES = Object.freeze([
  "truck_load",
  "half_load",
  "full_load",
  "custom",
]);

export const COMMERCIAL_TREE_UNIT_TYPES = Object.freeze([
  "removal",
  "trimming",
  "stump",
  "debris_haul",
  "custom",
]);

/** All unit keys allowed on an offer line `size` field (service-specific). */
export const COMMERCIAL_LINE_UNIT_KEYS = Object.freeze([
  ...COMMERCIAL_DUMPSTER_SIZES,
  ...COMMERCIAL_PORTA_UNIT_TYPES,
  ...COMMERCIAL_JUNK_UNIT_TYPES,
  ...COMMERCIAL_TREE_UNIT_TYPES,
]);

export const BUILDER_MATERIAL_OPTIONS = Object.freeze([
  "Construction Debris",
  "Roofing Shingles",
  "Concrete",
  "Dirt",
  "Brick / Block",
  "Wood",
  "Drywall",
  "Household / General Debris",
  "Yard / Tree Debris",
  "Mixed C&D",
  "Other",
]);

export const BUILDER_ADVANCE_NOTICE_OPTIONS = Object.freeze([
  "same_day",
  "next_day",
  "2_days",
  "3_plus",
]);

export const BUILDER_RENTAL_DAY_PRESETS = Object.freeze([3, 7, 10, 14, 30]);

export const BUILDER_INCLUDED_TONNAGE_PRESETS = Object.freeze([1, 2, 3, 4]);

export const BUILDER_EXCHANGE_MODES = Object.freeze(["manual", "automatic"]);

export const BUILDER_EXCHANGE_CADENCE_DAYS = Object.freeze([2, 3, 5, 7]);

export const BUILDER_EXCHANGE_TURNAROUND_OPTIONS = Object.freeze([
  "same_day",
  "within_24_hours",
  "within_48_hours",
  "scheduled_day",
  "custom",
]);

export const BUILDER_FINAL_PICKUP_MODES = Object.freeze([
  "manual",
  "scheduled_end_date",
  "authorized_user",
]);

export const BUILDER_DELIVERY_WINDOWS = Object.freeze([
  "Morning",
  "Afternoon",
  "Evening",
  "SpecificTime",
]);

export function unitKeysForService(serviceType) {
  switch (serviceType) {
    case "dumpster":
      return [...COMMERCIAL_DUMPSTER_SIZES];
    case "porta":
      return [...COMMERCIAL_PORTA_UNIT_TYPES];
    case "junk":
      return [...COMMERCIAL_JUNK_UNIT_TYPES];
    case "tree":
      return [...COMMERCIAL_TREE_UNIT_TYPES];
    default:
      return [...COMMERCIAL_DUMPSTER_SIZES];
  }
}
