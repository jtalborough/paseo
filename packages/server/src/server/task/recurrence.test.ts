import { describe, expect, it } from "vitest";

import { computeNextDoDate } from "./recurrence.js";

describe("computeNextDoDate", () => {
  it("relative from scheduled advances the do-date by the interval", () => {
    expect(
      computeNextDoDate(
        { kind: "relative", every: 2, unit: "week", from: "scheduled" },
        { doDate: "2026-06-01", completedAt: "2026-06-10T12:00:00.000Z" },
      ),
    ).toBe("2026-06-15");
  });

  it("relative from completion advances from the completion date", () => {
    expect(
      computeNextDoDate(
        { kind: "relative", every: 3, unit: "day", from: "completion" },
        { doDate: "2026-06-01", completedAt: "2026-06-10T12:00:00.000Z" },
      ),
    ).toBe("2026-06-13");
  });

  it("relative monthly clamps to the end of a shorter month", () => {
    expect(
      computeNextDoDate(
        { kind: "relative", every: 1, unit: "month", from: "scheduled" },
        { doDate: "2026-01-31", completedAt: "2026-01-31T00:00:00.000Z" },
      ),
    ).toBe("2026-02-28");
  });

  it("weekly picks the next matching weekday strictly after completion", () => {
    // 2026-06-10 is a Wednesday; next Monday is 2026-06-15.
    expect(
      computeNextDoDate(
        { kind: "weekly", weekdays: ["mon"] },
        { doDate: null, completedAt: "2026-06-10T09:00:00.000Z" },
      ),
    ).toBe("2026-06-15");
  });

  it("monthly rolls to next month when the day has passed", () => {
    expect(
      computeNextDoDate(
        { kind: "monthly", day: 5 },
        { doDate: null, completedAt: "2026-06-10T00:00:00.000Z" },
      ),
    ).toBe("2026-07-05");
  });

  it("monthly stays in-month when the day is still ahead", () => {
    expect(
      computeNextDoDate(
        { kind: "monthly", day: 20 },
        { doDate: null, completedAt: "2026-06-10T00:00:00.000Z" },
      ),
    ).toBe("2026-06-20");
  });

  it("yearly rolls to next year when the date has passed", () => {
    expect(
      computeNextDoDate(
        { kind: "yearly", month: 4, day: 15 },
        { doDate: null, completedAt: "2026-06-10T00:00:00.000Z" },
      ),
    ).toBe("2027-04-15");
  });
});
