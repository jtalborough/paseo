import type { Recurrence } from "@getpaseo/protocol/task/types";
import { describe, expect, it } from "vitest";

import {
  CUSTOM_RECURRENCE_OPTION,
  WEEKLY_DAYS_RECURRENCE_OPTION,
  taskRecurrenceFromOption,
  taskRecurrenceLabel,
  taskRecurrenceToOption,
} from "./task-recurrence";

describe("task recurrence UI mapping", () => {
  it("maps empty recurrence to a clear select value", () => {
    expect(taskRecurrenceToOption(null)).toBeNull();
    expect(taskRecurrenceFromOption(null)).toBeNull();
  });

  it("maps common fixed-cadence presets both directions", () => {
    const recurrence: Recurrence = { kind: "relative", every: 1, unit: "week", from: "scheduled" };

    expect(taskRecurrenceToOption(recurrence)).toBe("weekly");
    expect(taskRecurrenceFromOption("weekly")).toEqual(recurrence);
  });

  it("maps after-completion presets both directions", () => {
    const recurrence: Recurrence = { kind: "relative", every: 1, unit: "day", from: "completion" };

    expect(taskRecurrenceToOption(recurrence)).toBe("after-completion-daily");
    expect(taskRecurrenceFromOption("after-completion-daily")).toEqual(recurrence);
  });

  it("preserves unsupported recurrence shapes as custom", () => {
    expect(taskRecurrenceToOption({ kind: "monthly", day: 12 })).toBe(CUSTOM_RECURRENCE_OPTION);
    expect(taskRecurrenceFromOption(CUSTOM_RECURRENCE_OPTION)).toBeUndefined();
  });

  it("maps weekly weekday recurrence to the weekday editor option", () => {
    const recurrence: Recurrence = { kind: "weekly", weekdays: ["mon", "wed"] };

    expect(taskRecurrenceToOption(recurrence)).toBe(WEEKLY_DAYS_RECURRENCE_OPTION);
    expect(taskRecurrenceFromOption(WEEKLY_DAYS_RECURRENCE_OPTION)).toEqual({
      kind: "weekly",
      weekdays: ["mon"],
    });
  });

  it("formats a compact row label", () => {
    expect(
      taskRecurrenceLabel({ kind: "relative", every: 1, unit: "month", from: "scheduled" }),
    ).toBe("Monthly");
    expect(taskRecurrenceLabel({ kind: "weekly", weekdays: ["mon", "wed"] })).toBe(
      "Weekly Mon, Wed",
    );
    expect(taskRecurrenceLabel(null)).toBeNull();
  });
});
