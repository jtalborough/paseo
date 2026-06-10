import { describe, expect, it } from "vitest";
import type { StoredTask } from "@getpaseo/protocol/task/types";
import {
  addTaskTimeDays,
  aggregateProjectDayTotals,
  aggregateTaskDayTotals,
  formatTaskTimeDayLabel,
  taskSecondsForDay,
} from "@/utils/task-time";

function task(
  projectGroupId: string,
  timeEntries: StoredTask["metadata"]["timeEntries"],
  options: { id?: string; title?: string } = {},
): StoredTask {
  return {
    metadata: {
      id: options.id ?? "task",
      projectGroupId,
      title: options.title ?? "Task",
      actionState: "todo",
      run: "self",
      priority: null,
      type: null,
      people: [],
      context: null,
      attention: null,
      doDate: null,
      recurrence: null,
      remind: [],
      timerStartedAt:
        timeEntries.at(-1)?.endedAt === null ? (timeEntries.at(-1)?.startedAt ?? null) : null,
      trackedSeconds: 0,
      timeEntries,
      provider: null,
      links: [],
      github: null,
      sources: [],
      createdAt: "2026-06-08T00:00:00.000Z",
      updatedAt: "2026-06-08T00:00:00.000Z",
      agentId: null,
      worktree: null,
      contextPacket: null,
      lastRunAt: null,
      result: null,
      lastCompletedAt: null,
      completions: [],
    },
    body: "",
  };
}

describe("task time aggregation", () => {
  it("formats and shifts local timesheet days", () => {
    const today = new Date(2026, 5, 10, 9, 30, 0);

    expect(formatTaskTimeDayLabel(today, today)).toBe("Today");
    expect(formatTaskTimeDayLabel(addTaskTimeDays(today, -1), today)).toBe("Yesterday");
    expect(formatTaskTimeDayLabel(addTaskTimeDays(today, 1), today)).toBe("Tomorrow");
    expect(formatTaskTimeDayLabel(new Date(2026, 5, 1), today)).toBe("Jun 1");
  });

  it("clips intervals to the requested local day and groups by Project", () => {
    const day = new Date(2026, 5, 8);
    const now = new Date(2026, 5, 8, 12, 0, 0);
    const first = task("grp_one", [
      {
        startedAt: new Date(2026, 5, 8, 9, 0, 0).toISOString(),
        endedAt: new Date(2026, 5, 8, 10, 0, 0).toISOString(),
      },
    ]);
    const running = task("grp_two", [
      { startedAt: new Date(2026, 5, 8, 11, 30, 0).toISOString(), endedAt: null },
    ]);

    expect(taskSecondsForDay(first, day, now)).toBe(3600);
    expect(aggregateProjectDayTotals([first, running], day, now)).toEqual([
      { projectGroupId: "grp_one", seconds: 3600 },
      { projectGroupId: "grp_two", seconds: 1800 },
    ]);
  });

  it("aggregates daily task totals for a Project timesheet", () => {
    const day = new Date(2026, 5, 8);
    const now = new Date(2026, 5, 8, 12, 0, 0);
    const first = task(
      "grp_one",
      [
        {
          startedAt: new Date(2026, 5, 8, 9, 0, 0).toISOString(),
          endedAt: new Date(2026, 5, 8, 10, 0, 0).toISOString(),
        },
      ],
      { id: "a", title: "Alpha" },
    );
    const second = task(
      "grp_one",
      [
        {
          startedAt: new Date(2026, 5, 8, 10, 0, 0).toISOString(),
          endedAt: new Date(2026, 5, 8, 10, 30, 0).toISOString(),
        },
      ],
      { id: "b", title: "Beta" },
    );

    expect(aggregateTaskDayTotals([second, first], day, now)).toEqual([
      {
        taskKey: "grp_one:a",
        taskId: "a",
        projectGroupId: "grp_one",
        title: "Alpha",
        seconds: 3600,
      },
      {
        taskKey: "grp_one:b",
        taskId: "b",
        projectGroupId: "grp_one",
        title: "Beta",
        seconds: 1800,
      },
    ]);
  });
});
