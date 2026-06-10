import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { ProjectContextPacketStore } from "./packet-store.js";

describe("ProjectContextPacketStore", () => {
  it("creates and lists validated Project context packets", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "paseo-context-packets-"));
    try {
      const store = new ProjectContextPacketStore(root);

      const stored = await store.create({
        id: "run-1",
        projectGroupId: "grp_work",
        createdByAgentId: "agent-planner",
        launchedAgentId: "agent-impl",
        launchReason: "Implement task",
        profile: "agents/implementation.yaml",
        prompt: "prompts/implementation.md",
        task: "tasks/2026-06-10-build.md",
        notes: ["notes/architecture.md"],
        files: ["context/reference.json"],
        bookmarks: ["https://example.com"],
        browser: [{ url: "https://example.com", title: "Example" }],
        folderGrants: [{ projectId: "folder-1", mode: "read-write" }],
        now: "2026-06-10T13:00:00.000Z",
      });

      expect(stored.path).toBe("context/packets/run-1.yaml");
      expect(stored.packet).toMatchObject({
        schemaVersion: 1,
        id: "run-1",
        projectGroupId: "grp_work",
        createdAt: "2026-06-10T13:00:00.000Z",
        createdByAgentId: "agent-planner",
        launchedAgentId: "agent-impl",
        launchReason: "Implement task",
        task: "tasks/2026-06-10-build.md",
        folderGrants: [{ projectId: "folder-1", path: ".", mode: "read-write" }],
      });

      await expect(store.list("grp_work")).resolves.toEqual([stored]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects paths outside the portable Project directory", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "paseo-context-packets-"));
    try {
      const store = new ProjectContextPacketStore(root);

      await expect(
        store.create({
          id: "run-1",
          projectGroupId: "grp_work",
          task: "../outside.md",
        }),
      ).rejects.toThrow("portable Project-relative path");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects packet files that claim another Project", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "paseo-context-packets-"));
    try {
      const packetDir = path.join(root, "projects", "grp_work", "context", "packets");
      await mkdir(packetDir, { recursive: true });
      await writeFile(
        path.join(packetDir, "bad.yaml"),
        "id: bad\nprojectGroupId: grp_other\n",
        "utf8",
      );

      await expect(new ProjectContextPacketStore(root).list("grp_work")).rejects.toThrow(
        "belongs to grp_other",
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
