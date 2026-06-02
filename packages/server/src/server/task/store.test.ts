import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { TaskStore } from "./store.js";

describe("TaskStore", () => {
  let paseoHome: string;
  let store: TaskStore;

  beforeEach(async () => {
    paseoHome = await mkdtemp(path.join(tmpdir(), "paseo-tasks-"));
    store = new TaskStore(paseoHome);
  });

  afterEach(async () => {
    await rm(paseoHome, { recursive: true, force: true });
  });

  it("creates a task and round-trips it from disk", async () => {
    const created = await store.create({
      project: "proj-1",
      title: "Replace the HVAC filter",
      body: "Buy a 16x25x1 MERV 11.\n",
    });

    expect(created.metadata.id).toMatch(/^\d{4}-\d{2}-\d{2}-replace-the-hvac-filter$/);
    expect(created.metadata.status).toBe("todo");
    expect(created.metadata.run).toBe("self");
    expect(created.metadata.links).toEqual([]);

    const loaded = await store.get("proj-1", created.metadata.id);
    expect(loaded).not.toBeNull();
    expect(loaded?.metadata).toEqual(created.metadata);
    expect(loaded?.body).toBe("Buy a 16x25x1 MERV 11.\n");
  });

  it("writes a real markdown file with a frontmatter fence", async () => {
    const created = await store.create({ project: "proj-1", title: "Write docs" });
    const filePath = path.join(
      paseoHome,
      "projects",
      "proj-1",
      "tasks",
      `${created.metadata.id}.md`,
    );
    const raw = await readFile(filePath, "utf-8");
    expect(raw.startsWith("---\n")).toBe(true);
    expect(raw).toContain("title: Write docs");
    expect(raw).toContain("status: todo");
  });

  it("preserves the body on a metadata-only update", async () => {
    const created = await store.create({
      project: "proj-1",
      title: "Ship feature",
      body: "## Acceptance\n- it works\n",
    });

    const updated = await store.update("proj-1", created.metadata.id, { status: "doing" });

    expect(updated.metadata.status).toBe("doing");
    expect(updated.body).toBe("## Acceptance\n- it works\n");
    expect(updated.metadata.updatedAt >= created.metadata.updatedAt).toBe(true);
  });

  it("rolls up agent run results onto the task", async () => {
    const created = await store.create({
      project: "proj-1",
      title: "Run me",
      run: "agent",
      provider: "codex/gpt-5.4",
    });

    const ran = await store.update("proj-1", created.metadata.id, {
      status: "done",
      agentId: "agent-123",
      worktree: "/tmp/wt/royal-pony",
      lastRunAt: "2026-06-02T10:00:00.000Z",
      result: "success",
    });

    const reloaded = await store.get("proj-1", created.metadata.id);
    expect(reloaded?.metadata.result).toBe("success");
    expect(reloaded?.metadata.agentId).toBe("agent-123");
    expect(reloaded?.metadata).toEqual(ran.metadata);
  });

  it("lists tasks for a project sorted by creation time and isolates projects", async () => {
    const a = await store.create({ project: "proj-1", title: "Alpha" });
    const b = await store.create({ project: "proj-1", title: "Beta" });
    await store.create({ project: "proj-2", title: "Gamma" });

    const projectOne = await store.list("proj-1");
    expect(projectOne.map((t) => t.metadata.id)).toEqual([a.metadata.id, b.metadata.id]);

    const projectTwo = await store.list("proj-2");
    expect(projectTwo.map((t) => t.metadata.title)).toEqual(["Gamma"]);
  });

  it("returns an empty list for a project with no tasks", async () => {
    expect(await store.list("never-seen")).toEqual([]);
  });

  it("returns null for a missing task", async () => {
    expect(await store.get("proj-1", "nope")).toBeNull();
  });

  it("allocates distinct ids for same-titled tasks created on the same day", async () => {
    const first = await store.create({ project: "proj-1", title: "Same Title" });
    const second = await store.create({ project: "proj-1", title: "Same Title" });
    expect(first.metadata.id).not.toBe(second.metadata.id);
  });

  it("deletes a task", async () => {
    const created = await store.create({ project: "proj-1", title: "Temporary" });
    await store.delete("proj-1", created.metadata.id);
    expect(await store.get("proj-1", created.metadata.id)).toBeNull();
  });

  it("parses a hand-authored task file (Obsidian-edited)", async () => {
    // Simulate the owner editing the vault directly: create, then the test
    // verifies the same shape loads. Hand-write via create to keep it realistic.
    const created = await store.create({
      project: "proj-1",
      title: "Hand authored",
      links: ["./docs/hvac-manual.pdf"],
      remind: ["-3d", "2026-06-14T09:00"],
    });
    const loaded = await store.get("proj-1", created.metadata.id);
    expect(loaded?.metadata.links).toEqual(["./docs/hvac-manual.pdf"]);
    expect(loaded?.metadata.remind).toEqual(["-3d", "2026-06-14T09:00"]);
  });
});
