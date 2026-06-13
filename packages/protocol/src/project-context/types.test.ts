import { describe, expect, test } from "vitest";

import {
  ProjectAgentProfileSchema,
  ProjectContextPacketSchema,
  ProjectDirectoryManifestSchema,
} from "./types";

describe("Project context schemas", () => {
  test("normalizes a minimal agent profile", () => {
    expect(ProjectAgentProfileSchema.parse({ id: "planner", name: "Planner" })).toEqual({
      schemaVersion: 1,
      id: "planner",
      name: "Planner",
      provider: null,
      model: null,
      prompt: null,
      defaultTools: [],
      folderGrants: [],
    });
  });

  test("normalizes an explicit context packet", () => {
    expect(
      ProjectContextPacketSchema.parse({
        id: "run-1",
        projectGroupId: "grp_work",
        provider: "codex",
        model: "gpt-5.4",
        profile: "agents/planner.yaml",
        prompt: "prompts/plan.md",
        task: "tasks/task.md",
        tools: ["project-files"],
        notes: ["notes/architecture.md"],
        files: ["context/reference.json"],
        browser: [{ url: "https://example.com" }],
        folderGrants: [{ projectId: "folder-1", mode: "read-write" }],
      }),
    ).toEqual({
      schemaVersion: 1,
      id: "run-1",
      projectGroupId: "grp_work",
      createdAt: null,
      createdByAgentId: null,
      launchedAgentId: null,
      launchReason: null,
      provider: "codex",
      model: "gpt-5.4",
      profile: "agents/planner.yaml",
      prompt: "prompts/plan.md",
      task: "tasks/task.md",
      tools: ["project-files"],
      notes: ["notes/architecture.md"],
      files: ["context/reference.json"],
      bookmarks: [],
      browser: [{ url: "https://example.com", title: null }],
      folderGrants: [{ projectId: "folder-1", path: ".", mode: "read-write" }],
    });
  });

  test("rejects context packets outside Project group identity", () => {
    expect(() =>
      ProjectContextPacketSchema.parse({ id: "run-1", projectGroupId: "../outside" }),
    ).toThrow();
  });

  test("rejects path traversal and absolute paths in Project context files", () => {
    expect(() =>
      ProjectAgentProfileSchema.parse({
        id: "planner",
        name: "Planner",
        prompt: "../prompts/plan.md",
      }),
    ).toThrow("portable Project-relative path");
    expect(() =>
      ProjectContextPacketSchema.parse({
        id: "run-1",
        projectGroupId: "grp_work",
        profile: "/tmp/profile.yaml",
      }),
    ).toThrow("portable Project-relative path");
  });

  test("parses a Project directory manifest", () => {
    expect(
      ProjectDirectoryManifestSchema.parse({
        schemaVersion: 1,
        groupId: "grp_work",
        displayName: "Work",
        archetype: "code",
        color: null,
        icon: null,
        order: null,
        children: [
          {
            projectId: "child-1",
            rootPath: "/tmp/child-1",
            kind: "git",
            displayName: "Child One",
          },
        ],
        createdAt: "2026-06-09T00:00:00.000Z",
        updatedAt: "2026-06-09T00:00:00.000Z",
        archivedAt: null,
      }),
    ).toMatchObject({
      groupId: "grp_work",
      children: [{ projectId: "child-1", kind: "git" }],
    });
  });
});
