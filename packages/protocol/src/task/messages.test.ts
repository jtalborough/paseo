import { describe, expect, test } from "vitest";

import { SessionInboundMessageSchema, SessionOutboundMessageSchema } from "../messages";

describe("Task message schemas", () => {
  test("parses task.run request and response frames", () => {
    expect(
      SessionInboundMessageSchema.parse({
        type: "task.run.request",
        requestId: "req-run",
        projectGroupId: "grp_project",
        id: "task-1",
        repoRoot: "/repo",
        provider: "codex",
        baseBranch: "main",
      }),
    ).toMatchObject({
      type: "task.run.request",
      provider: "codex",
    });

    expect(
      SessionOutboundMessageSchema.parse({
        type: "task.run.response",
        payload: {
          ok: true,
          requestId: "req-run",
          agentId: "agent-1",
          contextPacket: "context/packets/task-run.yaml",
          task: {
            metadata: {
              id: "task-1",
              projectGroupId: "grp_project",
              title: "Run me",
              createdAt: "2026-06-10T00:00:00.000Z",
              updatedAt: "2026-06-10T00:00:00.000Z",
            },
            body: "",
          },
        },
      }),
    ).toMatchObject({
      type: "task.run.response",
      payload: {
        ok: true,
        agentId: "agent-1",
        contextPacket: "context/packets/task-run.yaml",
      },
    });
  });

  test("parses task.schedule.create request and response frames", () => {
    expect(
      SessionInboundMessageSchema.parse({
        type: "task.schedule.create.request",
        requestId: "req-schedule",
        projectGroupId: "grp_project",
        id: "task-1",
        repoRoot: "/repo",
        provider: "codex",
        cadence: { type: "cron", expression: "0 9 * * *", timezone: "America/New_York" },
        approvalMode: "approval_before_edit",
        missedRunPolicy: "run_once",
        retryPolicy: { maxAttempts: 2, backoffMs: 300000 },
        name: "Daily task",
      }),
    ).toMatchObject({
      type: "task.schedule.create.request",
      cadence: { type: "cron", expression: "0 9 * * *" },
      approvalMode: "approval_before_edit",
      missedRunPolicy: "run_once",
      retryPolicy: { maxAttempts: 2, backoffMs: 300000 },
    });

    expect(
      SessionOutboundMessageSchema.parse({
        type: "task.schedule.create.response",
        payload: {
          ok: true,
          requestId: "req-schedule",
          schedule: {
            id: "abc12345",
            name: "Daily task",
            prompt: "Run the task",
            cadence: { type: "cron", expression: "0 9 * * *" },
            approvalMode: "approval_before_edit",
            missedRunPolicy: "run_once",
            retryPolicy: { maxAttempts: 2, backoffMs: 300000 },
            target: {
              type: "new-agent",
              config: { provider: "codex", cwd: "/repo" },
            },
            status: "active",
            createdAt: "2026-06-11T00:00:00.000Z",
            updatedAt: "2026-06-11T00:00:00.000Z",
            nextRunAt: "2026-06-12T09:00:00.000Z",
            lastRunAt: null,
            pausedAt: null,
            expiresAt: null,
            maxRuns: null,
          },
          task: {
            metadata: {
              id: "task-1",
              projectGroupId: "grp_project",
              title: "Run me",
              scheduleIds: ["abc12345"],
              createdAt: "2026-06-10T00:00:00.000Z",
              updatedAt: "2026-06-10T00:00:00.000Z",
            },
            body: "",
          },
        },
      }),
    ).toMatchObject({
      type: "task.schedule.create.response",
      payload: {
        ok: true,
        schedule: {
          id: "abc12345",
          approvalMode: "approval_before_edit",
          missedRunPolicy: "run_once",
          retryPolicy: { maxAttempts: 2, backoffMs: 300000 },
        },
        task: { metadata: { scheduleIds: ["abc12345"] } },
      },
    });
  });
});
