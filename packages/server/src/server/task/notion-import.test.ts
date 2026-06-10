import { describe, expect, it } from "vitest";

import { createTaskInputFromNotion } from "./notion-import.js";

describe("createTaskInputFromNotion", () => {
  it("maps a Notion task row into a local Paseo task input", () => {
    expect(
      createTaskInputFromNotion({
        projectGroupId: "grp_paseo",
        task: "Build Notion import",
        status: "Focus",
        actionState: "Do",
        doDate: "2026-06-11",
        recurrence: ["rec-weekly-mon", "rec-weekly-wed"],
        priority: "Now",
        attention: "Full",
        people: ["J"],
        location: "Desktop-CPU",
        type: "coding",
        agents: ["Codex", "Claude"],
        pageId: "48bd6c20dc71830989910173d2c5d6d5",
        url: "https://www.notion.so/rfarm/48bd6c20dc71830989910173d2c5d6d5",
        dataSourceId: "5b7d6c20-dc71-822b-97d8-87d06bbc3520",
        importedAt: "2026-06-10T13:00:00.000Z",
      }),
    ).toEqual({
      projectGroupId: "grp_paseo",
      title: "Build Notion import",
      actionState: "todo",
      priority: "high",
      attention: "full",
      doDate: "2026-06-11",
      recurrence: { kind: "weekly", weekdays: ["mon", "wed"] },
      people: ["J"],
      context: "Desktop-CPU",
      type: "coding",
      provider: "codex",
      links: ["https://www.notion.so/rfarm/48bd6c20dc71830989910173d2c5d6d5"],
      github: null,
      body: undefined,
      sources: [
        {
          kind: "notion",
          pageId: "48bd6c20dc71830989910173d2c5d6d5",
          url: "https://www.notion.so/rfarm/48bd6c20dc71830989910173d2c5d6d5",
          dataSourceId: "5b7d6c20-dc71-822b-97d8-87d06bbc3520",
          database: "tasks",
          importedAt: "2026-06-10T13:00:00.000Z",
          lastMirroredAt: null,
        },
      ],
    });
  });

  it("maps review and parked states onto the local Action State spine", () => {
    expect(
      createTaskInputFromNotion({
        projectGroupId: "grp_paseo",
        task: "Needs decision",
        actionState: "Review",
        url: "https://notion.so/task",
      }).actionState,
    ).toBe("info");
    expect(
      createTaskInputFromNotion({
        projectGroupId: "grp_paseo",
        task: "Maybe later",
        actionState: "Park",
        url: "https://notion.so/task",
      }).actionState,
    ).toBe("someday");
    expect(
      createTaskInputFromNotion({
        projectGroupId: "grp_paseo",
        task: "Finished",
        actionState: "Drop/Done",
        url: "https://notion.so/task",
      }).actionState,
    ).toBe("done");
  });

  it("maps compact recurrence labels into structured rules", () => {
    expect(
      createTaskInputFromNotion({
        projectGroupId: "grp_paseo",
        task: "Every two weeks",
        recurrence: "rec-2w",
        url: "https://notion.so/task",
      }).recurrence,
    ).toEqual({ kind: "relative", every: 2, unit: "week", from: "scheduled" });
    expect(
      createTaskInputFromNotion({
        projectGroupId: "grp_paseo",
        task: "Every six months",
        recurrence: "Recurring-Relative-6M",
        url: "https://notion.so/task",
      }).recurrence,
    ).toEqual({ kind: "relative", every: 6, unit: "month", from: "scheduled" });
  });

  it("requires a Notion task title", () => {
    expect(() =>
      createTaskInputFromNotion({
        projectGroupId: "grp_paseo",
        url: "https://notion.so/task",
      }),
    ).toThrow("Notion task import requires a title or task name");
  });
});
