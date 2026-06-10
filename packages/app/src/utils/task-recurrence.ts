import type { Recurrence, Weekday } from "@getpaseo/protocol/task/types";
import type { SelectOption } from "@/components/task-select";

export const CUSTOM_RECURRENCE_OPTION = "custom";
export const WEEKLY_DAYS_RECURRENCE_OPTION = "weekly-days";

export const WEEKDAY_OPTIONS: SelectOption[] = [
  { value: "mon", label: "Mon" },
  { value: "tue", label: "Tue" },
  { value: "wed", label: "Wed" },
  { value: "thu", label: "Thu" },
  { value: "fri", label: "Fri" },
  { value: "sat", label: "Sat" },
  { value: "sun", label: "Sun" },
];

export const TASK_RECURRENCE_OPTIONS: SelectOption[] = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: WEEKLY_DAYS_RECURRENCE_OPTION, label: "Weekly on days..." },
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
  { value: "after-completion-daily", label: "Daily after completion" },
  { value: "after-completion-weekly", label: "Weekly after completion" },
  { value: CUSTOM_RECURRENCE_OPTION, label: "Custom" },
];

const RECURRENCE_BY_OPTION: Record<string, Recurrence> = {
  daily: { kind: "relative", every: 1, unit: "day", from: "scheduled" },
  weekly: { kind: "relative", every: 1, unit: "week", from: "scheduled" },
  monthly: { kind: "relative", every: 1, unit: "month", from: "scheduled" },
  yearly: { kind: "relative", every: 1, unit: "year", from: "scheduled" },
  "after-completion-daily": { kind: "relative", every: 1, unit: "day", from: "completion" },
  "after-completion-weekly": { kind: "relative", every: 1, unit: "week", from: "completion" },
};

export function taskRecurrenceToOption(recurrence: Recurrence | null): string | null {
  if (!recurrence) return null;
  if (recurrence.kind === "weekly") {
    return WEEKLY_DAYS_RECURRENCE_OPTION;
  }
  for (const [option, value] of Object.entries(RECURRENCE_BY_OPTION)) {
    if (matchesRecurrence(recurrence, value)) {
      return option;
    }
  }
  return CUSTOM_RECURRENCE_OPTION;
}

/**
 * `undefined` means "leave the existing custom recurrence unchanged"; `null`
 * means "clear recurrence".
 */
export function taskRecurrenceFromOption(option: string | null): Recurrence | null | undefined {
  if (!option) return null;
  if (option === CUSTOM_RECURRENCE_OPTION) return undefined;
  if (option === WEEKLY_DAYS_RECURRENCE_OPTION) {
    return { kind: "weekly", weekdays: ["mon"] };
  }
  return RECURRENCE_BY_OPTION[option] ?? undefined;
}

export function taskRecurrenceLabel(recurrence: Recurrence | null): string | null {
  if (recurrence?.kind === "weekly") {
    return `Weekly ${recurrence.weekdays.map(formatWeekday).join(", ")}`;
  }
  const option = taskRecurrenceToOption(recurrence);
  if (!option) return null;
  return TASK_RECURRENCE_OPTIONS.find((candidate) => candidate.value === option)?.label ?? "Custom";
}

export function taskRecurrenceCompletionPreview(input: {
  recurrence: Recurrence | null;
  doDate: string | null;
  completedAt: string;
}): string | null {
  if (!input.recurrence) {
    return null;
  }
  return `Completing reschedules to ${computeNextTaskDoDate(input.recurrence, input)}`;
}

export function computeNextTaskDoDate(
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

function formatWeekday(weekday: string): string {
  return WEEKDAY_OPTIONS.find((option) => option.value === weekday)?.label ?? weekday;
}

function matchesRecurrence(left: Recurrence, right: Recurrence): boolean {
  if (left.kind !== right.kind) return false;
  if (left.kind !== "relative" || right.kind !== "relative") return false;
  return left.every === right.every && left.unit === right.unit && left.from === right.from;
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
