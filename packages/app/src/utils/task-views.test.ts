import { describe, expect, it } from "vitest";
import type { StoredTask, TaskViewDefinition } from "@getpaseo/protocol/task/types";
import { filterTasksByView, taskCreateInputForView } from "@/utils/task-views";

describe("task view definitions", () => {
  it("supports adding a view as a definition without changing the Tasks screen", () => {
    const task = { metadata: { priority: "high" } } as StoredTask;
    const highPriority: TaskViewDefinition = {
      id: "high-priority",
      label: "High priority",
      filter: { priorities: ["high"] },
    };

    expect(filterTasksByView([task], highPriority)).toEqual([task]);
  });

  it("applies Today view defaults to new tasks", () => {
    const today: TaskViewDefinition = {
      id: "today",
      label: "Today",
      filter: { active: true, doDate: "due" },
    };

    expect(
      taskCreateInputForView({
        title: "Ship it",
        projectGroupId: "grp_one",
        view: today,
        now: new Date("2026-06-09T12:00:00"),
      }),
    ).toEqual({
      projectGroupId: "grp_one",
      title: "Ship it",
      doDate: "2026-06-09",
    });
  });

  it("applies Inbox view defaults to new tasks", () => {
    const inbox: TaskViewDefinition = {
      id: "inbox",
      label: "Inbox",
      filter: { active: true, doDate: "missing" },
    };

    expect(
      taskCreateInputForView({
        title: "Capture this",
        projectGroupId: "grp_one",
        view: inbox,
      }),
    ).toEqual({
      projectGroupId: "grp_one",
      title: "Capture this",
      doDate: null,
    });
  });

  it("applies single-value custom view filters to new tasks", () => {
    const highPriorityReview: TaskViewDefinition = {
      id: "review",
      label: "Review",
      filter: {
        actionStates: ["info"],
        priorities: ["high"],
        projectGroupIds: ["grp_two"],
      },
    };

    expect(
      taskCreateInputForView({
        title: "Check deploy",
        projectGroupId: "grp_one",
        view: highPriorityReview,
      }),
    ).toEqual({
      projectGroupId: "grp_two",
      title: "Check deploy",
      actionState: "info",
      priority: "high",
    });
  });
});
