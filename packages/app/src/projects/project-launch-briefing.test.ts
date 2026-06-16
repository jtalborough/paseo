import { describe, expect, test } from "vitest";
import {
  buildPacketLaunchBriefing,
  buildProfileLaunchBriefing,
  formatFolderGrantDisplay,
  formatProviderModel,
} from "./project-launch-briefing";

describe("project launch briefing", () => {
  test("marks complete profiles as ready", () => {
    const briefing = buildProfileLaunchBriefing({
      path: "agents/qa-tester.yaml",
      profile: {
        schemaVersion: 1,
        id: "qa-tester",
        name: "QA Tester",
        provider: "codex",
        model: "gpt-5.4",
        prompt: "prompts/qa-tester.md",
        defaultTools: ["project-files", "project-tasks"],
        folderGrants: [
          {
            projectId: "app",
            path: "packages/app",
            mode: "read-write",
          },
        ],
      },
    });

    expect(briefing.ready).toBe(true);
    expect(briefing.readinessLabel).toBe("Ready");
    expect(briefing.badgeVariant).toBe("success");
    expect(briefing.warnings).toEqual([]);
    expect(briefing.items).toEqual([
      { label: "Profile", value: "agents/qa-tester.yaml" },
      { label: "Provider", value: "codex / gpt-5.4" },
      { label: "Prompt", value: "prompts/qa-tester.md" },
      { label: "Tools", value: "project-files, project-tasks" },
      { label: "Folder grants", value: "1 folder grant" },
      { label: "Packet", value: "Created when launched" },
    ]);
    expect(briefing.accessSummary).toEqual(["2 tools", "1 folder grant"]);
  });

  test("keeps provider-neutral profiles launchable while noting sparse guidance", () => {
    const briefing = buildProfileLaunchBriefing({
      path: "agents/empty.yaml",
      profile: {
        schemaVersion: 1,
        id: "empty",
        name: "Empty",
        provider: null,
        model: null,
        prompt: null,
        defaultTools: [],
        folderGrants: [],
      },
    });

    expect(briefing.ready).toBe(true);
    expect(briefing.readinessLabel).toBe("2 notes");
    expect(briefing.badgeVariant).toBe("warning");
    expect(briefing.warnings).toEqual(["Prompt file is not set", "No default tools"]);
  });

  test("surfaces instruction authority before profile launch", () => {
    const briefing = buildProfileLaunchBriefing({
      path: "agents/qa-tester.yaml",
      profile: {
        schemaVersion: 1,
        id: "qa-tester",
        name: "QA Tester",
        provider: "codex",
        model: "gpt-5.4",
        prompt: "prompts/qa-tester.md",
        defaultTools: ["project-files"],
        folderGrants: [{ projectId: "app", path: ".", mode: "read" }],
      },
      instructionAuthority: {
        launchCwd: "/tmp/project",
        instructionSources: [
          {
            path: "/tmp/project/AGENTS.md",
            sourceType: "agents",
            scope: "project-directory",
            projectId: null,
            note: "Provider-neutral folder instructions",
          },
        ],
        instructionWarnings: [
          "Folder/provider instructions may constrain or override Project prompt behavior.",
        ],
      },
    });

    expect(briefing.readinessLabel).toBe("1 note");
    expect(briefing.badgeVariant).toBe("warning");
    expect(briefing.items).toContainEqual({ label: "Launch cwd", value: "/tmp/project" });
    expect(briefing.items).toContainEqual({
      label: "Instruction sources",
      value: "1 instruction source",
    });
    expect(briefing.warnings).toEqual([
      "Folder/provider instructions may constrain or override Project prompt behavior.",
    ]);
    expect(briefing.accessSummary).toEqual(["1 tool", "1 folder grant", "1 instruction source"]);
  });

  test("summarizes packet audit coverage", () => {
    const briefing = buildPacketLaunchBriefing({
      path: "context/packets/qa-tester.yaml",
      packet: {
        schemaVersion: 1,
        id: "qa-tester",
        projectGroupId: "grp_work",
        createdAt: "2026-06-13T12:00:00.000Z",
        createdByAgentId: "parent",
        launchedAgentId: "child",
        launchReason: "Use profile: QA Tester",
        provider: "codex",
        model: "gpt-5.4",
        profile: "agents/qa-tester.yaml",
        prompt: "prompts/qa-tester.md",
        goal: null,
        thread: null,
        task: null,
        tools: ["project-files"],
        notes: ["notes/brief.md"],
        decisions: [],
        evidence: [],
        memory: [],
        files: ["src/app.ts"],
        bookmarks: [],
        browser: [{ title: "Preview", url: "http://127.0.0.1:6767" }],
        folderGrants: [],
        launchCwd: "/tmp/work",
        instructionSources: [
          {
            path: "/tmp/work/AGENTS.md",
            sourceType: "agents",
            scope: "folder-grant",
            projectId: null,
            note: null,
          },
        ],
        instructionWarnings: ["Folder/provider instructions may constrain Project prompt behavior"],
      },
    });

    expect(briefing.ready).toBe(true);
    expect(briefing.readinessLabel).toBe("1 note");
    expect(briefing.badgeVariant).toBe("warning");
    expect(briefing.items).toContainEqual({ label: "Launch cwd", value: "/tmp/work" });
    expect(briefing.items).toContainEqual({
      label: "Instruction sources",
      value: "1 instruction source",
    });
    expect(briefing.warnings).toEqual([
      "Folder/provider instructions may constrain Project prompt behavior",
    ]);
    expect(briefing.accessSummary).toEqual([
      "1 file",
      "1 note",
      "1 browser state",
      "1 tool",
      "1 instruction source",
    ]);
  });

  test("notes sparse packet audit data without treating optional metadata as failure", () => {
    const briefing = buildPacketLaunchBriefing({
      path: "context/packets/manual.yaml",
      packet: {
        schemaVersion: 1,
        id: "manual",
        projectGroupId: "grp_work",
        createdAt: "2026-06-13T12:00:00.000Z",
        createdByAgentId: null,
        launchedAgentId: null,
        launchReason: null,
        provider: null,
        model: null,
        profile: null,
        prompt: null,
        goal: null,
        thread: null,
        task: null,
        tools: [],
        notes: [],
        decisions: [],
        evidence: [],
        memory: [],
        files: [],
        bookmarks: [],
        browser: [],
        folderGrants: [],
        launchCwd: null,
        instructionSources: [],
        instructionWarnings: [],
      },
    });

    expect(briefing.ready).toBe(true);
    expect(briefing.readinessLabel).toBe("2 notes");
    expect(briefing.badgeVariant).toBe("warning");
    expect(briefing.warnings).toEqual(["No launch context recorded", "No launched agent recorded"]);
  });

  test("accepts packets with context but no launched agent metadata", () => {
    const briefing = buildPacketLaunchBriefing({
      path: "context/packets/manual.yaml",
      packet: {
        schemaVersion: 1,
        id: "manual",
        projectGroupId: "grp_work",
        createdAt: "2026-06-13T12:00:00.000Z",
        createdByAgentId: null,
        launchedAgentId: null,
        launchReason: "Manual packet",
        provider: null,
        model: null,
        profile: null,
        prompt: "prompts/reviewer.md",
        goal: null,
        thread: null,
        task: null,
        tools: [],
        notes: [],
        decisions: [],
        evidence: [],
        memory: [],
        files: [],
        bookmarks: [],
        browser: [],
        folderGrants: [],
        launchCwd: null,
        instructionSources: [],
        instructionWarnings: [],
      },
    });

    expect(briefing.ready).toBe(true);
    expect(briefing.badgeVariant).toBe("warning");
    expect(briefing.warnings).toEqual(["No launched agent recorded"]);
  });

  test("formats provider and model defensively", () => {
    expect(formatProviderModel(" codex ", " gpt-5.4 ")).toBe("codex / gpt-5.4");
    expect(formatProviderModel("codex", null)).toBe("codex");
    expect(formatProviderModel(null, "gpt-5.4")).toBe("gpt-5.4");
    expect(formatProviderModel(null, null)).toBeNull();
  });

  test("formats Folder grants with host and root path context", () => {
    expect(
      formatFolderGrantDisplay({
        grant: { projectId: "paseo", path: "packages/app", mode: "read-write" },
        folders: [
          {
            serverId: "mac",
            projectKey: "paseo",
            projectName: "Paseo",
            iconWorkingDir: "/Users/jta/git-projects/paseo",
          },
        ],
      }),
    ).toEqual({
      title: "Paseo - Read/write",
      detail: "mac - /Users/jta/git-projects/paseo/packages/app",
    });
  });

  test("formats unknown Folder grants without hiding the raw id", () => {
    expect(
      formatFolderGrantDisplay({
        grant: { projectId: "missing-folder", path: ".", mode: "read" },
        folders: [],
      }),
    ).toEqual({
      title: "Unknown Folder (missing-folder) - Read",
      detail: "Unknown host - missing-folder",
    });
  });
});
