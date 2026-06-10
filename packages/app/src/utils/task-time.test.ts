import { describe, expect, it } from "vitest";
import type { StoredTask } from "@getpaseo/protocol/task/types";
import { aggregateProjectDayTotals, taskSecondsForDay } from "@/utils/task-time";

function task(
  projectGroupId: string,
  timeEntries: StoredTask["metadata"]["timeEntries"],
): StoredTask {
  return {
    metadata: {
      id: "task",
      projectGroupId,
      title: "Task",
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
});
