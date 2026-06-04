import { describe, expect, it } from "vitest";

import type { StoredTask } from "@getpaseo/protocol/task/types";
import { createDefaultsForView, filterTasksForView } from "./tasks-view-filter.js";

const TODAY = "2026-06-04";

function task(partial: Partial<StoredTask["metadata"]> & { id: string }): StoredTask {
  return {
    metadata: {
      project: "p",
      title: partial.id,
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
      provider: null,
      links: [],
      github: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      agentId: null,
      worktree: null,
      lastRunAt: null,
      result: null,
      lastCompletedAt: null,
      completions: [],
      ...partial,
    },
    body: "",
  };
}

const tasks: StoredTask[] = [
  task({ id: "inbox-1" }), // todo, no date
  task({ id: "today-due", doDate: "2026-06-04" }), // due today
  task({ id: "overdue", doDate: "2026-06-01" }), // overdue
  task({ id: "upcoming-1", doDate: "2026-06-10" }), // future
  task({ id: "waiting-1", actionState: "waiting" }),
  task({ id: "someday-1", actionState: "someday" }),
  task({ id: "done-1", actionState: "done" }),
  task({ id: "dropped-1", actionState: "dropped" }),
];

function ids(view: Parameters<typeof filterTasksForView>[1]): string[] {
  return filterTasksForView(tasks, view, TODAY).map((t) => t.metadata.id);
}

describe("filterTasksForView", () => {
  it("Today = actionable and due today or overdue", () => {
    expect(ids("today").sort()).toEqual(["overdue", "today-due"]);
  });

  it("Inbox = todo with no do-date", () => {
    expect(ids("inbox")).toEqual(["inbox-1"]);
  });

  it("Upcoming = actionable with a future do-date", () => {
    expect(ids("upcoming")).toEqual(["upcoming-1"]);
  });

  it("Waiting / Someday / Done filter by action state", () => {
    expect(ids("waiting")).toEqual(["waiting-1"]);
    expect(ids("someday")).toEqual(["someday-1"]);
    expect(ids("done")).toEqual(["done-1"]);
  });

  it("All excludes dropped", () => {
    expect(ids("all")).not.toContain("dropped-1");
    expect(ids("all")).toHaveLength(7);
  });
});

describe("createDefaultsForView", () => {
  it("Today seeds today's do-date", () => {
    expect(createDefaultsForView("today", TODAY)).toEqual({ doDate: TODAY });
  });
  it("Waiting and Someday seed their action state", () => {
    expect(createDefaultsForView("waiting", TODAY)).toEqual({ actionState: "waiting" });
    expect(createDefaultsForView("someday", TODAY)).toEqual({ actionState: "someday" });
  });
  it("Inbox / Upcoming / All capture a plain undated todo", () => {
    expect(createDefaultsForView("inbox", TODAY)).toEqual({});
    expect(createDefaultsForView("upcoming", TODAY)).toEqual({});
    expect(createDefaultsForView("all", TODAY)).toEqual({});
  });
});
