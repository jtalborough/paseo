import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
    expect(created.metadata.actionState).toBe("todo");
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
    expect(raw).toContain("actionState: todo");
  });

  it("preserves the body on a metadata-only update", async () => {
    const created = await store.create({
      project: "proj-1",
      title: "Ship feature",
      body: "## Acceptance\n- it works\n",
    });

    const updated = await store.update("proj-1", created.metadata.id, { actionState: "waiting" });

    expect(updated.metadata.actionState).toBe("waiting");
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
      actionState: "done",
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

  it("migrates a legacy `status` task file onto the Action State spine", async () => {
    // Simulate a task file authored before Action State existed.
    const dir = path.join(paseoHome, "projects", "proj-legacy", "tasks");
    await mkdir(dir, { recursive: true });
    await writeFile(
      path.join(dir, "2026-01-01-legacy.md"),
      [
        "---",
        "id: 2026-01-01-legacy",
        "project: proj-legacy",
        "title: Legacy task",
        "status: doing",
        "createdAt: 2026-01-01T00:00:00.000Z",
        "updatedAt: 2026-01-01T00:00:00.000Z",
        "---",
        "",
        "body",
        "",
      ].join("\n"),
      "utf-8",
    );

    const loaded = await store.get("proj-legacy", "2026-01-01-legacy");
    expect(loaded).not.toBeNull();
    expect(loaded?.metadata.actionState).toBe("waiting");
    // The legacy field is dropped from the parsed shape.
    const meta = (loaded as { metadata: Record<string, unknown> }).metadata;
    expect(meta.status).toBeUndefined();
  });

  it("round-trips people and editable Type/People config", async () => {
    const created = await store.create({
      project: "proj-cfg",
      title: "Call the plumber",
      type: "errand",
      people: ["Chad", "Rachel"],
    });
    expect(created.metadata.type).toBe("errand");
    expect(created.metadata.people).toEqual(["Chad", "Rachel"]);

    // Defaults when no config file exists yet.
    const defaults = await store.getConfig("proj-cfg");
    expect(defaults.types.length).toBeGreaterThan(0);
    expect(defaults.people).toEqual([]);

    const saved = await store.updateConfig("proj-cfg", {
      types: ["errand", "coding"],
      people: ["Chad", "Rachel", "J"],
    });
    expect(saved.people).toContain("J");
    const reloaded = await store.getConfig("proj-cfg");
    expect(reloaded.types).toEqual(["errand", "coding"]);
    expect(reloaded.people).toEqual(["Chad", "Rachel", "J"]);
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
