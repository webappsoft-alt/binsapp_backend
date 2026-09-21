/**
 * Shared on-time logic for operator scoring.
 *
 * `end_date` is stored at UTC midnight (the start of the rental's final day), so
 * a job completed any time *during* that day should still count as on-time. We
 * therefore treat the deadline as the end of the end-date day (end_date + 24h).
 *
 * @param {Date|string|null} effectiveEnd - order.new_end_date || order.end_date
 * @param {number} [completedAtMs=Date.now()] - completion timestamp (ms)
 * @returns {boolean} true when completed on/before the end-date day (or no end date)
 */
export function isDeliveredOnTime(effectiveEnd, completedAtMs = Date.now()) {
  if (!effectiveEnd) return true;
  const end = new Date(effectiveEnd);
  if (Number.isNaN(end.getTime())) return true;
  const deadlineMs = end.getTime() + 24 * 60 * 60 * 1000; // through the end day
  return completedAtMs < deadlineMs;
}
