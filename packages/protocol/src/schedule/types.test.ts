import { describe, expect, test } from "vitest";

import { ScheduleCadenceSchema, StoredScheduleSchema } from "./types.js";

describe("ScheduleCadenceSchema", () => {
  test("accepts existing UTC cron cadence without a time zone", () => {
    expect(ScheduleCadenceSchema.parse({ type: "cron", expression: "0 9 * * *" })).toEqual({
      type: "cron",
      expression: "0 9 * * *",
    });
  });

  test("accepts timezone-aware cron cadence", () => {
    expect(
      ScheduleCadenceSchema.parse({
        type: "cron",
        expression: "0 9 * * *",
        timezone: "America/New_York",
      }),
    ).toEqual({
      type: "cron",
      expression: "0 9 * * *",
      timezone: "America/New_York",
    });
  });
});

describe("StoredScheduleSchema", () => {
  test("defaults old schedules to auto approval mode", () => {
    const parsed = StoredScheduleSchema.parse({
      id: "schedule-1",
      name: null,
      prompt: "Run",
      cadence: { type: "every", everyMs: 60_000 },
      target: {
        type: "new-agent",
        config: { provider: "codex", cwd: "/repo" },
      },
      status: "active",
      createdAt: "2026-06-12T00:00:00.000Z",
      updatedAt: "2026-06-12T00:00:00.000Z",
      nextRunAt: "2026-06-12T01:00:00.000Z",
      lastRunAt: null,
      pausedAt: null,
      expiresAt: null,
      maxRuns: null,
      runs: [],
    });
    expect(parsed.approvalMode).toBe("auto");
    expect(parsed.executionMode).toBe("live");
    expect(parsed.missedRunPolicy).toBe("skip");
    expect(parsed.retryPolicy).toEqual({ maxAttempts: 1, backoffMs: 5 * 60_000 });
    expect(parsed.pendingRetry).toBeNull();
  });
});
