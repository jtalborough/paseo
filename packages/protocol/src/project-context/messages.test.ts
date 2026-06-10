import { describe, expect, test } from "vitest";
import { SessionInboundMessageSchema, SessionOutboundMessageSchema } from "../messages";

describe("project context packet messages", () => {
  test("parses context packet list request and response frames", () => {
    expect(
      SessionInboundMessageSchema.parse({
        type: "project.context.packets.list.request",
        requestId: "ctx-1",
        projectGroupId: "grp_work",
      }),
    ).toEqual({
      type: "project.context.packets.list.request",
      requestId: "ctx-1",
      projectGroupId: "grp_work",
    });

    expect(
      SessionOutboundMessageSchema.parse({
        type: "project.context.packets.list.response",
        payload: {
          requestId: "ctx-1",
          packets: [
            {
              path: "context/packets/run-1.yaml",
              packet: {
                id: "run-1",
                projectGroupId: "grp_work",
                createdAt: "2026-06-10T12:00:00.000Z",
                createdByAgentId: "agent:planner",
                launchReason: "Run task",
                task: "tasks/task-1.md",
                prompt: "prompts/project-manager.md",
                folderGrants: [{ projectId: "project-1", path: ".", mode: "read-write" }],
              },
            },
          ],
        },
      }),
    ).toMatchObject({
      type: "project.context.packets.list.response",
      payload: {
        requestId: "ctx-1",
        packets: [
          {
            path: "context/packets/run-1.yaml",
            packet: {
              id: "run-1",
              browser: [],
              files: [],
              folderGrants: [{ projectId: "project-1", path: ".", mode: "read-write" }],
              notes: [],
            },
          },
        ],
      },
    });
  });
});
