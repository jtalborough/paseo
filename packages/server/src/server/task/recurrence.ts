import type { Recurrence, Weekday } from "@getpaseo/protocol/task/types";

/**
 * Compute the next do-date (YYYY-MM-DD) for a recurring task, given the rule,
 * the task's current doDate, and the completion timestamp. Pure and deterministic
 * — all date math is done on calendar dates (no time-of-day), so it is stable
 * across timezones for day-granularity scheduling.
 */
export function computeNextDoDate(
  recurrence: Recurrence,
  input: { doDate: string | null; completedAt: string },
): string {
  const completed = parseDate(input.completedAt) ?? today();
  const scheduled = parseDate(input.doDate);

  if (recurrence.kind === "relative") {
    const base = recurrence.from === "completion" ? completed : (scheduled ?? completed);
    return formatDate(addInterval(base, recurrence.every, recurrence.unit));
  }
  if (recurrence.kind === "weekly") {
    return formatDate(nextWeekday(completed, recurrence.weekdays));
  }
  if (recurrence.kind === "monthly") {
    return formatDate(nextMonthly(completed, recurrence.day));
  }
  return formatDate(nextYearly(completed, recurrence.month, recurrence.day));
}

const WEEKDAY_INDEX: Record<Weekday, number> = {
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
};

function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function today(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function formatDate(date: Date): string {
  const year = date.getFullYear().toString().padStart(4, "0");
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const day = date.getDate().toString().padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addInterval(base: Date, every: number, unit: "day" | "week" | "month" | "year"): Date {
  if (unit === "day") return addDays(base, every);
  if (unit === "week") return addDays(base, every * 7);
  if (unit === "month") return addMonths(base, every);
  return addMonths(base, every * 12);
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

/** Add months, clamping the day to the target month's length (Jan 31 + 1 → Feb 28/29). */
function addMonths(date: Date, months: number): Date {
  const targetMonthFirst = new Date(date.getFullYear(), date.getMonth() + months, 1);
  const lastDay = new Date(
    targetMonthFirst.getFullYear(),
    targetMonthFirst.getMonth() + 1,
    0,
  ).getDate();
  return new Date(
    targetMonthFirst.getFullYear(),
    targetMonthFirst.getMonth(),
    Math.min(date.getDate(), lastDay),
  );
}

function nextWeekday(after: Date, weekdays: Weekday[]): Date {
  const wanted = new Set(weekdays.map((day) => WEEKDAY_INDEX[day]));
  for (let offset = 1; offset <= 7; offset++) {
    const candidate = addDays(after, offset);
    if (wanted.has(candidate.getDay())) {
      return candidate;
    }
  }
  return addDays(after, 7);
}

function nextMonthly(after: Date, day: number): Date {
  for (let monthOffset = 0; monthOffset <= 12; monthOffset++) {
    const monthFirst = new Date(after.getFullYear(), after.getMonth() + monthOffset, 1);
    const lastDay = new Date(monthFirst.getFullYear(), monthFirst.getMonth() + 1, 0).getDate();
    const candidate = new Date(
      monthFirst.getFullYear(),
      monthFirst.getMonth(),
      Math.min(day, lastDay),
    );
    if (candidate > after) {
      return candidate;
    }
  }
  return addMonths(after, 1);
}

function nextYearly(after: Date, month: number, day: number): Date {
  for (let yearOffset = 0; yearOffset <= 1; yearOffset++) {
    const year = after.getFullYear() + yearOffset;
    const lastDay = new Date(year, month, 0).getDate();
    const candidate = new Date(year, month - 1, Math.min(day, lastDay));
    if (candidate > after) {
      return candidate;
    }
  }
  return new Date(after.getFullYear() + 1, month - 1, day);
}
