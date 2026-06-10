import type { Recurrence } from "@getpaseo/protocol/task/types";
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

function formatWeekday(weekday: string): string {
  return WEEKDAY_OPTIONS.find((option) => option.value === weekday)?.label ?? weekday;
}

function matchesRecurrence(left: Recurrence, right: Recurrence): boolean {
  if (left.kind !== right.kind) return false;
  if (left.kind !== "relative" || right.kind !== "relative") return false;
  return left.every === right.every && left.unit === right.unit && left.from === right.from;
}
