import { describe, expect, test } from "vitest";
import { resolveProjectInstructionAuthority } from "./project-instruction-authority";

describe("resolveProjectInstructionAuthority", () => {
  test("records readable instruction files from launch cwd and folder grants", async () => {
    const readable = new Set([
      "/tmp/project:AGENTS.md",
      "/tmp/repo:packages/app/CLAUDE.md",
      "/tmp/repo:packages/app/.agents/skills",
    ]);

    const authority = await resolveProjectInstructionAuthority({
      client: {
        async readFile(cwd, path) {
          if (!readable.has(`${cwd}:${path}`)) {
            throw new Error("missing");
          }
          return { bytes: new Uint8Array() };
        },
      },
      launchCwd: "/tmp/project",
      projectDirectory: "/tmp/project",
      folderGrants: [{ projectId: "repo", path: "packages/app", mode: "read-write" }],
      folders: [
        {
          serverId: "mac",
          projectKey: "repo",
          projectName: "Repo",
          projectKind: "git",
          iconWorkingDir: "/tmp/repo",
          workspaceKeys: [],
          canCreateWorktree: true,
          projectGroupId: "grp_work",
        },
      ],
    });

    expect(authority).toEqual({
      launchCwd: "/tmp/project",
      instructionSources: [
        {
          path: "/tmp/project/AGENTS.md",
          sourceType: "agents",
          scope: "project-directory",
          projectId: null,
          note: "Provider-neutral folder instructions",
        },
        {
          path: "/tmp/repo/packages/app/CLAUDE.md",
          sourceType: "claude",
          scope: "folder-grant",
          projectId: "repo",
          note: "Claude folder instructions",
        },
        {
          path: "/tmp/repo/packages/app/.agents/skills",
          sourceType: "provider-skill",
          scope: "folder-grant",
          projectId: "repo",
          note: "Paseo/agent skill directory",
        },
      ],
      instructionWarnings: [
        "Folder/provider instructions may constrain or override Project prompt behavior.",
      ],
    });
  });

  test("does not block launch when instruction files are absent", async () => {
    const authority = await resolveProjectInstructionAuthority({
      client: {
        async readFile() {
          throw new Error("missing");
        },
      },
      launchCwd: "/tmp/project",
      projectDirectory: "/tmp/project",
      folderGrants: [],
      folders: [],
    });

    expect(authority).toEqual({
      launchCwd: "/tmp/project",
      instructionSources: [],
      instructionWarnings: [],
    });
  });
});
