/**
 * Resolve service window for commercial empty & redeliver turnaround SLAs.
 * @returns {{ windowStart: Date, windowEnd: Date }}
 */
export function resolveExchangeTurnaroundWindow(
  turnaround,
  {
    now = new Date(),
    scheduledDate = null,
    customHours = 24,
  } = {},
) {
  const start = new Date(now);
  const end = new Date(now);
  const mode = String(turnaround || "within_24_hours");

  if (mode === "same_day") {
    end.setHours(23, 59, 59, 999);
    return { windowStart: start, windowEnd: end };
  }

  if (mode === "within_48_hours") {
    end.setHours(end.getHours() + 48);
    return { windowStart: start, windowEnd: end };
  }

  if (mode === "scheduled_day") {
    const target = nextScheduledDayWindow(scheduledDate, now);
    return target;
  }

  if (mode === "custom") {
    const hours = Math.max(1, Number(customHours) || 24);
    end.setHours(end.getHours() + hours);
    return { windowStart: start, windowEnd: end };
  }

  // within_24_hours (default)
  end.setHours(end.getHours() + 24);
  return { windowStart: start, windowEnd: end };
}

/**
 * Use the given calendar date if still upcoming; otherwise the next
 * occurrence of that weekday (Mon–Sun).
 */
export function nextScheduledDayWindow(scheduledDate, now = new Date()) {
  const base = scheduledDate ? new Date(scheduledDate) : null;
  let day = base && !Number.isNaN(base.getTime()) ? new Date(base) : new Date(now);

  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);

  if (day < startOfToday) {
    // Roll forward to the next matching weekday from today.
    const wantDow = day.getDay();
    day = new Date(startOfToday);
    const delta = (wantDow - day.getDay() + 7) % 7;
    day.setDate(day.getDate() + (delta === 0 ? 7 : delta));
  }

  const windowStart = new Date(day);
  windowStart.setHours(8, 0, 0, 0);
  const windowEnd = new Date(day);
  windowEnd.setHours(17, 0, 0, 0);
  return { windowStart, windowEnd };
}
