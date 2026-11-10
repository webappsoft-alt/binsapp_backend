/**
 * Provider (renter) job status groups.
 * Shared by the jobs list filter (fetchRenterOrder) and renterStats() so the
 * Jobs tabs, their counts and the dashboard always count the same orders.
 */
export const RENTER_ACTIVE_STATUSES = ["accepted", "active", "dispatched", "en_route", "arrived"];

export const RENTER_STATUS_GROUPS = {
  pending: ["pending"],
  accepted: RENTER_ACTIVE_STATUSES,
  active: RENTER_ACTIVE_STATUSES,
  completed: ["completed"],
  cancelled: ["cancelled", "canceled"],
  all: ["pending", ...RENTER_ACTIVE_STATUSES, "completed", "cancelled", "canceled"],
};
