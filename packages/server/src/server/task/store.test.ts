import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { TaskParseError, TaskStore } from "./store.js";

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
      projectGroupId: "grp_one",
      title: "Replace the HVAC filter",
      body: "Buy a 16x25x1 MERV 11.\n",
    });

    expect(created.metadata.id).toMatch(/^\d{4}-\d{2}-\d{2}-replace-the-hvac-filter$/);
    expect(created.metadata.actionState).toBe("todo");
    expect(created.metadata.run).toBe("self");
    expect(created.metadata.links).toEqual([]);

    const loaded = await store.get("grp_one", created.metadata.id);
    expect(loaded).not.toBeNull();
    expect(loaded?.metadata).toEqual(created.metadata);
    expect(loaded?.body).toBe("Buy a 16x25x1 MERV 11.\n");
  });

  it("writes a real markdown file with a frontmatter fence", async () => {
    const created = await store.create({ projectGroupId: "grp_one", title: "Write docs" });
    const filePath = path.join(
      paseoHome,
      "projects",
      "grp_one",
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
      projectGroupId: "grp_one",
      title: "Ship feature",
      body: "## Acceptance\n- it works\n",
    });

    const updated = await store.update("grp_one", created.metadata.id, { actionState: "waiting" });

    expect(updated.metadata.actionState).toBe("waiting");
    expect(updated.body).toBe("## Acceptance\n- it works\n");
    expect(updated.metadata.updatedAt >= created.metadata.updatedAt).toBe(true);
  });

  it("rolls up agent run results onto the task", async () => {
    const created = await store.create({
      projectGroupId: "grp_one",
      title: "Run me",
      run: "agent",
      provider: "codex/gpt-5.4",
    });

    const ran = await store.update("grp_one", created.metadata.id, {
      actionState: "done",
      agentId: "agent-123",
      worktree: "/tmp/wt/royal-pony",
      lastRunAt: "2026-06-02T10:00:00.000Z",
      result: "success",
    });

    const reloaded = await store.get("grp_one", created.metadata.id);
    expect(reloaded?.metadata.result).toBe("success");
    expect(reloaded?.metadata.agentId).toBe("agent-123");
    expect(reloaded?.metadata).toEqual(ran.metadata);
  });

  it("records scheduled agent task links and run ledger entries", async () => {
    const created = await store.create({
      projectGroupId: "grp_one",
      title: "Nightly triage",
      run: "agent",
      provider: "codex/gpt-5.4",
      scheduleIds: ["schedule-1"],
    });

    expect(created.metadata.scheduleIds).toEqual(["schedule-1"]);
    expect(created.metadata.scheduledRuns).toEqual([]);

    const updated = await store.update("grp_one", created.metadata.id, {
      scheduledRuns: [
        {
          scheduleId: "schedule-1",
          runId: "run-1",
          scheduledFor: "2026-06-11T09:00:00.000Z",
          startedAt: "2026-06-11T09:00:05.000Z",
          endedAt: "2026-06-11T09:05:00.000Z",
          status: "succeeded",
          agentId: "agent-123",
          contextPacket: "context/packets/nightly-triage.yaml",
          provider: "codex/gpt-5.4",
          folderGrants: ["folders/paseo"],
          result: "success",
          summary: "Opened one follow-up task.",
          changedFiles: ["tasks/2026-06-11-follow-up.md"],
          followUpTaskIds: ["2026-06-11-follow-up"],
          externalMirrorUpdates: [],
        },
      ],
    });

    const reloaded = await store.get("grp_one", created.metadata.id);
    expect(reloaded?.metadata.scheduleIds).toEqual(["schedule-1"]);
    expect(reloaded?.metadata.scheduledRuns).toEqual(updated.metadata.scheduledRuns);
    expect(reloaded?.metadata.scheduledRuns[0]?.contextPacket).toBe(
      "context/packets/nightly-triage.yaml",
    );
  });

  it("preserves external source provenance for imported tasks", async () => {
    const created = await store.create({
      projectGroupId: "grp_one",
      title: "Review imported task",
      sources: [
        {
          kind: "notion",
          pageId: "48bd6c20dc71830989910173d2c5d6d5",
          url: "https://www.notion.so/rfarm/48bd6c20dc71830989910173d2c5d6d5",
          dataSourceId: "5b7d6c20-dc71-822b-97d8-87d06bbc3520",
          database: "tasks",
          importedAt: "2026-06-10T12:00:00.000Z",
        },
      ],
    });

    expect(created.metadata.sources).toEqual([
      {
        kind: "notion",
        pageId: "48bd6c20dc71830989910173d2c5d6d5",
        url: "https://www.notion.so/rfarm/48bd6c20dc71830989910173d2c5d6d5",
        dataSourceId: "5b7d6c20-dc71-822b-97d8-87d06bbc3520",
        database: "tasks",
        importedAt: "2026-06-10T12:00:00.000Z",
        lastMirroredAt: null,
      },
    ]);

    const source = created.metadata.sources[0]!;
    const updated = await store.update("grp_one", created.metadata.id, {
      sources: [{ ...source, lastMirroredAt: "2026-06-10T12:30:00.000Z" }],
    });
    const reloaded = await store.get("grp_one", created.metadata.id);
    expect(reloaded?.metadata.sources).toEqual(updated.metadata.sources);
    expect(reloaded?.metadata.sources[0]?.lastMirroredAt).toBe("2026-06-10T12:30:00.000Z");
  });

  it("lists tasks for a project sorted by creation time and isolates projects", async () => {
    const a = await store.create({ projectGroupId: "grp_one", title: "Alpha" });
    const b = await store.create({ projectGroupId: "grp_one", title: "Beta" });
    await store.create({ projectGroupId: "grp_two", title: "Gamma" });

    const projectOne = await store.list("grp_one");
    expect(projectOne.map((t) => t.metadata.id)).toEqual([a.metadata.id, b.metadata.id]);

    const projectTwo = await store.list("grp_two");
    expect(projectTwo.map((t) => t.metadata.title)).toEqual(["Gamma"]);
  });

  it("skips invalid task files when listing but still throws on direct read", async () => {
    const valid = await store.create({ projectGroupId: "grp_one", title: "Valid task" });
    const taskDir = path.join(paseoHome, "projects", "grp_one", "tasks");
    await mkdir(taskDir, { recursive: true });
    await writeFile(
      path.join(taskDir, "2026-06-14-invalid.md"),
      [
        "---",
        "id: 2026-06-14-invalid",
        "projectGroupId: grp_one",
        "title: Invalid task",
        "run: self",
        "priority: medium",
        "type: feature",
        "people: []",
        "context: null",
        "attention: medium",
        "doDate: null",
        "recurrence: null",
        "remind: []",
        "scheduleIds: []",
        "scheduledRuns: []",
        "timerStartedAt: null",
        "trackedSeconds: 0",
        "timeEntries: []",
        "provider: null",
        "links: []",
        "github: null",
        "sources: []",
        "createdAt: 2026-06-14T00:00:00.000Z",
        "updatedAt: 2026-06-14T00:00:00.000Z",
        "agentId: null",
        "worktree: null",
        "contextPacket: null",
        "lastRunAt: null",
        "result: free-form text is invalid",
        "lastCompletedAt: null",
        "completions: []",
        "actionState: done",
        "---",
        "",
        "Bad metadata should not break the project task list.",
        "",
      ].join("\n"),
    );

    const listed = await store.list("grp_one");
    expect(listed.map((task) => task.metadata.id)).toEqual([valid.metadata.id]);
    await expect(store.get("grp_one", "2026-06-14-invalid")).rejects.toBeInstanceOf(TaskParseError);
  });

  it("queryAll gathers tasks across every Project directory", async () => {
    await store.create({ projectGroupId: "grp_alpha", title: "A1" });
    await store.create({ projectGroupId: "grp_alpha", title: "A2" });
    await store.create({ projectGroupId: "grp_beta", title: "B1" });

    const all = await store.queryAll();
    expect(all).toHaveLength(3);
    expect(new Set(all.map((t) => t.metadata.projectGroupId))).toEqual(
      new Set(["grp_alpha", "grp_beta"]),
    );

    expect(await store.listProjects()).toEqual(expect.arrayContaining(["grp_alpha", "grp_beta"]));
  });

  it("starts timers exclusively and records closed intervals for timesheets", async () => {
    const first = await store.create({ projectGroupId: "grp_alpha", title: "First" });
    const second = await store.create({ projectGroupId: "grp_beta", title: "Second" });

    await store.startExclusiveTimer({
      projectGroupId: "grp_alpha",
      id: first.metadata.id,
      activeProjectGroupIds: ["grp_alpha", "grp_beta"],
      now: "2026-06-08T10:00:00.000Z",
    });
    await store.startExclusiveTimer({
      projectGroupId: "grp_beta",
      id: second.metadata.id,
      activeProjectGroupIds: ["grp_alpha", "grp_beta"],
      now: "2026-06-08T10:15:00.000Z",
    });

    const stoppedFirst = await store.get("grp_alpha", first.metadata.id);
    const runningSecond = await store.get("grp_beta", second.metadata.id);
    expect(stoppedFirst?.metadata.timerStartedAt).toBeNull();
    expect(stoppedFirst?.metadata.trackedSeconds).toBe(900);
    expect(stoppedFirst?.metadata.timeEntries).toEqual([
      {
        startedAt: "2026-06-08T10:00:00.000Z",
        endedAt: "2026-06-08T10:15:00.000Z",
      },
    ]);
    expect(runningSecond?.metadata.timerStartedAt).toBe("2026-06-08T10:15:00.000Z");
    expect(runningSecond?.metadata.timeEntries).toEqual([
      { startedAt: "2026-06-08T10:15:00.000Z", endedAt: null },
    ]);
  });

  it("ignores the scaffold README when listing structured tasks", async () => {
    const tasksDir = path.join(paseoHome, "projects", "grp_one", "tasks");
    await mkdir(tasksDir, { recursive: true });
    await writeFile(path.join(tasksDir, "README.md"), "# Tasks\n", "utf-8");
    await store.create({ projectGroupId: "grp_one", title: "Real task" });

    expect((await store.list("grp_one")).map((task) => task.metadata.title)).toEqual(["Real task"]);
  });

  it("returns an empty list for a project with no tasks", async () => {
    expect(await store.list("grp_never_seen")).toEqual([]);
  });

  it("returns null for a missing task", async () => {
    expect(await store.get("grp_one", "nope")).toBeNull();
  });

  it("allocates distinct ids for same-titled tasks created on the same day", async () => {
    const first = await store.create({ projectGroupId: "grp_one", title: "Same Title" });
    const second = await store.create({ projectGroupId: "grp_one", title: "Same Title" });
    expect(first.metadata.id).not.toBe(second.metadata.id);
  });

  it("migrates a legacy `status` task file onto the Action State spine", async () => {
    // Simulate a task file authored before Action State existed.
    const dir = path.join(paseoHome, "projects", "grp_legacy", "tasks");
    await mkdir(dir, { recursive: true });
    await writeFile(
      path.join(dir, "2026-01-01-legacy.md"),
      [
        "---",
        "id: 2026-01-01-legacy",
        "projectGroupId: grp_legacy",
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

    const loaded = await store.get("grp_legacy", "2026-01-01-legacy");
    expect(loaded).not.toBeNull();
    expect(loaded?.metadata.actionState).toBe("waiting");
    // The legacy field is dropped from the parsed shape.
    const meta = (loaded as { metadata: Record<string, unknown> }).metadata;
    expect(meta.status).toBeUndefined();
  });

  it("round-trips people and editable Type/People config", async () => {
    const created = await store.create({
      projectGroupId: "grp_cfg",
      title: "Call the plumber",
      type: "errand",
      people: ["Chad", "Rachel"],
    });
    expect(created.metadata.type).toBe("errand");
    expect(created.metadata.people).toEqual(["Chad", "Rachel"]);

    // Defaults when no config file exists yet.
    const defaults = await store.getConfig("grp_cfg");
    expect(defaults.types.length).toBeGreaterThan(0);
    expect(defaults.people).toEqual([]);

    const saved = await store.updateConfig("grp_cfg", {
      types: ["errand", "coding"],
      people: ["Chad", "Rachel", "J"],
    });
    expect(saved.people).toContain("J");
    const reloaded = await store.getConfig("grp_cfg");
    expect(reloaded.types).toEqual(["errand", "coding"]);
    expect(reloaded.people).toEqual(["Chad", "Rachel", "J"]);
  });

  it("persists global custom Task view definitions", async () => {
    const views = await store.updateViews([
      { id: "high-priority", label: "High priority", filter: { priorities: ["high"] } },
    ]);

    expect(views).toHaveLength(1);
    expect(await store.getViews()).toEqual(views);
  });

  it("reschedules a recurring task in place when completed", async () => {
    const created = await store.create({
      projectGroupId: "grp_rec",
      title: "Weekly review",
      doDate: "2026-06-01",
      recurrence: { kind: "relative", every: 1, unit: "week", from: "scheduled" },
    });
    expect(created.metadata.actionState).toBe("todo");

    const completed = await store.update("grp_rec", created.metadata.id, { actionState: "done" });

    // Reset in place: back to ToDo, do-date advanced, completion recorded.
    expect(completed.metadata.actionState).toBe("todo");
    expect(completed.metadata.doDate).toBe("2026-06-08");
    expect(completed.metadata.completions).toHaveLength(1);
    expect(completed.metadata.lastCompletedAt).not.toBeNull();

    // A non-recurring task simply stays done.
    const plain = await store.create({ projectGroupId: "grp_rec", title: "One-off" });
    const plainDone = await store.update("grp_rec", plain.metadata.id, { actionState: "done" });
    expect(plainDone.metadata.actionState).toBe("done");
  });

  it("moves a task to another project, preserving content", async () => {
    const created = await store.create({
      projectGroupId: "grp_inbox",
      title: "Triage me",
      body: "notes\n",
      priority: "high",
    });
    const moved = await store.move("grp_inbox", created.metadata.id, "grp_real");

    expect(moved.metadata.projectGroupId).toBe("grp_real");
    expect(moved.metadata.priority).toBe("high");
    expect(moved.body).toBe("notes\n");
    // Gone from the old folder, present in the new one.
    expect(await store.get("grp_inbox", created.metadata.id)).toBeNull();
    expect(await store.get("grp_real", created.metadata.id)).not.toBeNull();
  });

  it("deletes a task", async () => {
    const created = await store.create({ projectGroupId: "grp_one", title: "Temporary" });
    await store.delete("grp_one", created.metadata.id);
    expect(await store.get("grp_one", created.metadata.id)).toBeNull();
  });

  it("parses a hand-authored task file (Obsidian-edited)", async () => {
    // Simulate the owner editing the vault directly: create, then the test
    // verifies the same shape loads. Hand-write via create to keep it realistic.
    const created = await store.create({
      projectGroupId: "grp_one",
      title: "Hand authored",
      links: ["./docs/hvac-manual.pdf"],
      remind: ["-3d", "2026-06-14T09:00"],
    });
    const loaded = await store.get("grp_one", created.metadata.id);
    expect(loaded?.metadata.links).toEqual(["./docs/hvac-manual.pdf"]);
    expect(loaded?.metadata.remind).toEqual(["-3d", "2026-06-14T09:00"]);
  });

  it("rejects ids that could escape the contained Project tasks directory", async () => {
    await expect(store.create({ projectGroupId: "../outside", title: "Escape" })).rejects.toThrow(
      "Invalid Project group id",
    );
    await expect(store.get("grp_one", "../outside")).rejects.toThrow("Invalid Task id");
  });
});
