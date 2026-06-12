import { describe, expect, test } from "vitest";

import { TaskFrontmatterSchema } from "./types";

describe("Task schemas", () => {
  test("defaults external sources for existing task files", () => {
    expect(
      TaskFrontmatterSchema.parse({
        id: "2026-06-10-existing",
        projectGroupId: "grp_existing",
        title: "Existing task",
        createdAt: "2026-06-10T00:00:00.000Z",
        updatedAt: "2026-06-10T00:00:00.000Z",
      }),
    ).toMatchObject({
      sources: [],
      scheduleIds: [],
      scheduledRuns: [],
    });
  });

  test("normalizes scheduled agent run ledger records", () => {
    expect(
      TaskFrontmatterSchema.parse({
        id: "2026-06-11-nightly",
        projectGroupId: "grp_scheduled",
        title: "Nightly review",
        scheduleIds: ["schedule-a"],
        scheduledRuns: [
          {
            scheduleId: "schedule-a",
            runId: "run-a",
            scheduledFor: "2026-06-11T09:00:00.000Z",
            status: "succeeded",
          },
        ],
        createdAt: "2026-06-11T00:00:00.000Z",
        updatedAt: "2026-06-11T00:00:00.000Z",
      }).scheduledRuns,
    ).toEqual([
      {
        scheduleId: "schedule-a",
        runId: "run-a",
        scheduledFor: "2026-06-11T09:00:00.000Z",
        startedAt: null,
        endedAt: null,
        status: "succeeded",
        agentId: null,
        contextPacket: null,
        provider: null,
        folderGrants: [],
        result: null,
        summary: null,
        changedFiles: [],
        followUpTaskIds: [],
        externalMirrorUpdates: [],
        acknowledgedAt: null,
      },
    ]);
  });

  test("normalizes Notion source records", () => {
    expect(
      TaskFrontmatterSchema.parse({
        id: "2026-06-10-imported",
        projectGroupId: "grp_imported",
        title: "Imported task",
        sources: [
          {
            kind: "notion",
            url: "https://www.notion.so/rfarm/48bd6c20dc71830989910173d2c5d6d5",
            database: "tasks",
          },
        ],
        createdAt: "2026-06-10T00:00:00.000Z",
        updatedAt: "2026-06-10T00:00:00.000Z",
      }).sources,
    ).toEqual([
      {
        kind: "notion",
        pageId: null,
        url: "https://www.notion.so/rfarm/48bd6c20dc71830989910173d2c5d6d5",
        dataSourceId: null,
        database: "tasks",
        importedAt: null,
        lastMirroredAt: null,
      },
    ]);
  });
});
