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
});
