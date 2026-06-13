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
                provider: "codex",
                model: "gpt-5.4",
                profile: "agents/project-manager.yaml",
                task: "tasks/task-1.md",
                prompt: "prompts/project-manager.md",
                tools: ["project-files"],
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
              model: "gpt-5.4",
              notes: [],
              profile: "agents/project-manager.yaml",
              provider: "codex",
              tools: ["project-files"],
            },
          },
        ],
      },
    });

    expect(
      SessionInboundMessageSchema.parse({
        type: "project.context.packets.create.request",
        requestId: "ctx-2",
        projectGroupId: "grp_work",
        launchReason: "Use profile: QA Tester",
        provider: "codex",
        model: "gpt-5.4",
        profile: "agents/qa-tester.yaml",
        prompt: "prompts/qa-tester.md",
        tools: ["project-files"],
        folderGrants: [{ projectId: "project-1", path: ".", mode: "read-write" }],
      }),
    ).toMatchObject({
      type: "project.context.packets.create.request",
      requestId: "ctx-2",
      projectGroupId: "grp_work",
      launchReason: "Use profile: QA Tester",
      provider: "codex",
      model: "gpt-5.4",
      profile: "agents/qa-tester.yaml",
      prompt: "prompts/qa-tester.md",
      tools: ["project-files"],
    });

    expect(
      SessionOutboundMessageSchema.parse({
        type: "project.context.packets.create.response",
        payload: {
          requestId: "ctx-2",
          path: "context/packets/run-2.yaml",
          packet: {
            id: "run-2",
            projectGroupId: "grp_work",
            createdAt: "2026-06-10T12:05:00.000Z",
            launchReason: "Use profile: QA Tester",
            provider: "codex",
            model: "gpt-5.4",
            profile: "agents/qa-tester.yaml",
            prompt: "prompts/qa-tester.md",
            tools: ["project-files"],
          },
        },
      }),
    ).toMatchObject({
      type: "project.context.packets.create.response",
      payload: {
        requestId: "ctx-2",
        path: "context/packets/run-2.yaml",
        packet: {
          id: "run-2",
          provider: "codex",
          tools: ["project-files"],
        },
      },
    });
  });
});

describe("project agent profile messages", () => {
  test("parses profile list, upsert, and delete frames", () => {
    expect(
      SessionInboundMessageSchema.parse({
        type: "project.agent.profiles.list.request",
        requestId: "profiles-1",
        projectGroupId: "grp_work",
      }),
    ).toEqual({
      type: "project.agent.profiles.list.request",
      requestId: "profiles-1",
      projectGroupId: "grp_work",
    });

    expect(
      SessionOutboundMessageSchema.parse({
        type: "project.agent.profiles.list.response",
        payload: {
          requestId: "profiles-1",
          profiles: [
            {
              path: "agents/project-manager.yaml",
              profile: {
                id: "project-manager",
                name: "Project Manager",
                provider: "codex",
                prompt: "prompts/project-manager.md",
              },
            },
          ],
        },
      }),
    ).toMatchObject({
      type: "project.agent.profiles.list.response",
      payload: {
        requestId: "profiles-1",
        profiles: [
          {
            path: "agents/project-manager.yaml",
            profile: {
              id: "project-manager",
              name: "Project Manager",
              model: null,
              defaultTools: [],
            },
          },
        ],
      },
    });

    expect(
      SessionInboundMessageSchema.parse({
        type: "project.agent.profiles.upsert.request",
        requestId: "profiles-2",
        projectGroupId: "grp_work",
        profile: { id: "reviewer", name: "Reviewer" },
      }),
    ).toMatchObject({
      type: "project.agent.profiles.upsert.request",
      profile: { id: "reviewer", name: "Reviewer", provider: null },
    });

    expect(
      SessionOutboundMessageSchema.parse({
        type: "project.agent.profiles.delete.response",
        payload: {
          requestId: "profiles-3",
          path: "agents/reviewer.yaml",
        },
      }),
    ).toEqual({
      type: "project.agent.profiles.delete.response",
      payload: {
        requestId: "profiles-3",
        path: "agents/reviewer.yaml",
      },
    });
  });
});
