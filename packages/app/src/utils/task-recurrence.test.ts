import type { Recurrence } from "@getpaseo/protocol/task/types";
import { describe, expect, it } from "vitest";

import {
  CUSTOM_RECURRENCE_OPTION,
  WEEKLY_DAYS_RECURRENCE_OPTION,
  computeNextTaskDoDate,
  taskRecurrenceCompletionPreview,
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

  it("previews the daemon reschedule date for completion", () => {
    expect(
      taskRecurrenceCompletionPreview({
        recurrence: { kind: "weekly", weekdays: ["mon", "wed"] },
        doDate: null,
        completedAt: "2026-06-10T09:00:00.000Z",
      }),
    ).toBe("Completing reschedules to 2026-06-15");
    expect(
      taskRecurrenceCompletionPreview({
        recurrence: null,
        doDate: null,
        completedAt: "2026-06-10T09:00:00.000Z",
      }),
    ).toBeNull();
  });

  it("matches server recurrence date math", () => {
    expect(
      computeNextTaskDoDate(
        { kind: "relative", every: 2, unit: "week", from: "scheduled" },
        { doDate: "2026-06-01", completedAt: "2026-06-10T12:00:00.000Z" },
      ),
    ).toBe("2026-06-15");
    expect(
      computeNextTaskDoDate(
        { kind: "relative", every: 3, unit: "day", from: "completion" },
        { doDate: "2026-06-01", completedAt: "2026-06-10T12:00:00.000Z" },
      ),
    ).toBe("2026-06-13");
    expect(
      computeNextTaskDoDate(
        { kind: "relative", every: 1, unit: "month", from: "scheduled" },
        { doDate: "2026-01-31", completedAt: "2026-01-31T00:00:00.000Z" },
      ),
    ).toBe("2026-02-28");
    expect(
      computeNextTaskDoDate(
        { kind: "monthly", day: 5 },
        { doDate: null, completedAt: "2026-06-10T00:00:00.000Z" },
      ),
    ).toBe("2026-07-05");
    expect(
      computeNextTaskDoDate(
        { kind: "yearly", month: 4, day: 15 },
        { doDate: null, completedAt: "2026-06-10T00:00:00.000Z" },
      ),
    ).toBe("2027-04-15");
  });
});
