import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { ProjectAgentProfileStore } from "./profile-store.js";

describe("ProjectAgentProfileStore", () => {
  it("creates and lists validated Project agent profiles", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "paseo-agent-profiles-"));
    try {
      const store = new ProjectAgentProfileStore(root);

      const stored = await store.upsert({
        projectGroupId: "grp_work",
        profile: {
          schemaVersion: 1,
          id: "planner",
          name: "Planner",
          provider: "codex",
          model: null,
          prompt: "prompts/project-manager.md",
          defaultTools: ["project-tasks"],
          folderGrants: [{ projectId: "folder-1", path: ".", mode: "read-write" }],
        },
      });

      expect(stored.path).toBe("agents/planner.yaml");
      await expect(store.list("grp_work")).resolves.toEqual([stored]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects paths outside the portable Project directory", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "paseo-agent-profiles-"));
    try {
      const store = new ProjectAgentProfileStore(root);

      await expect(
        store.upsert({
          projectGroupId: "grp_work",
          path: "../outside.yaml",
          profile: {
            schemaVersion: 1,
            id: "planner",
            name: "Planner",
            provider: null,
            model: null,
            prompt: null,
            defaultTools: [],
            folderGrants: [],
          },
        }),
      ).rejects.toThrow("portable Project-relative path");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects invalid profile files", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "paseo-agent-profiles-"));
    try {
      const profileDir = path.join(root, "projects", "grp_work", "agents");
      await mkdir(profileDir, { recursive: true });
      await writeFile(path.join(profileDir, "bad.yaml"), "id: bad\n", "utf8");

      await expect(new ProjectAgentProfileStore(root).list("grp_work")).rejects.toThrow();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
