import { describe, expect, it } from "vitest";
import type { HostProjectListItem } from "@/projects/host-project-model";
import { resolveProjectLaunchTarget } from "@/projects/project-launch-target";

function folder(input: Partial<HostProjectListItem> & { projectKey: string }): HostProjectListItem {
  return {
    serverId: "srv",
    projectName: input.projectKey,
    projectKind: "git",
    iconWorkingDir: `/repo/${input.projectKey}`,
    workspaceKeys: [],
    canCreateWorktree: true,
    projectGroupId: "grp_1",
    ...input,
  };
}

const group = { displayName: "Tune Paseo", cwd: "/home/projects/grp_1" };

describe("resolveProjectLaunchTarget", () => {
  it("launches in the sole member folder, not the domain dir", () => {
    const target = resolveProjectLaunchTarget({
      group,
      folders: [folder({ projectKey: "paseo" })],
    });
    expect(target.cwd).toBe("/repo/paseo");
    expect(target.folderProjectKey).toBe("paseo");
    expect(target.ambiguous).toBe(false);
  });

  it("falls back to the domain dir when the Project has no folders", () => {
    const target = resolveProjectLaunchTarget({ group, folders: [] });
    expect(target.cwd).toBe("/home/projects/grp_1");
    expect(target.folderProjectKey).toBeNull();
    expect(target.ambiguous).toBe(false);
  });

  it("prefers the designated primary folder over others", () => {
    const target = resolveProjectLaunchTarget({
      group: { ...group, primaryProjectId: "api" },
      folders: [folder({ projectKey: "web" }), folder({ projectKey: "api" })],
    });
    expect(target.cwd).toBe("/repo/api");
    expect(target.folderProjectKey).toBe("api");
    expect(target.ambiguous).toBe(false);
  });

  it("flags ambiguity for multiple folders with no primary", () => {
    const target = resolveProjectLaunchTarget({
      group,
      folders: [folder({ projectKey: "web" }), folder({ projectKey: "api" })],
    });
    expect(target.cwd).toBe("/home/projects/grp_1");
    expect(target.folderProjectKey).toBeNull();
    expect(target.ambiguous).toBe(true);
  });

  it("ignores a primary that no longer exists and falls through precedence", () => {
    const target = resolveProjectLaunchTarget({
      group: { ...group, primaryProjectId: "deleted" },
      folders: [folder({ projectKey: "only" })],
    });
    expect(target.cwd).toBe("/repo/only");
    expect(target.folderProjectKey).toBe("only");
  });
});
