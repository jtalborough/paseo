import { execSync } from "node:child_process";
import { mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, expect, test } from "vitest";

import { DaemonClient } from "../test-utils/daemon-client.js";
import { createTestPaseoDaemon, type TestPaseoDaemon } from "../test-utils/paseo-daemon.js";

const cleanupClients = new Set<DaemonClient>();
const cleanupDaemons = new Set<TestPaseoDaemon>();
const cleanupDirs = new Set<string>();

afterEach(async () => {
  for (const client of cleanupClients) {
    await client.close().catch(() => undefined);
  }
  cleanupClients.clear();
  for (const daemon of cleanupDaemons) {
    await daemon.close().catch(() => undefined);
  }
  cleanupDaemons.clear();
  for (const dir of cleanupDirs) {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
  cleanupDirs.clear();
});

function initGitRepo(): string {
  const repoRoot = realpathSync(mkdtempSync(path.join(os.tmpdir(), "paseo-task-repo-")));
  cleanupDirs.add(repoRoot);
  execSync("git init -b main", { cwd: repoRoot, stdio: "pipe" });
  execSync("git config user.email 'test@getpaseo.dev'", { cwd: repoRoot, stdio: "pipe" });
  execSync("git config user.name 'Paseo Test'", { cwd: repoRoot, stdio: "pipe" });
  writeFileSync(path.join(repoRoot, "README.md"), "# repo\n", "utf8");
  execSync("git add README.md", { cwd: repoRoot, stdio: "pipe" });
  execSync("git -c commit.gpgSign=false commit -m 'initial'", { cwd: repoRoot, stdio: "pipe" });
  return repoRoot;
}

test("task CRUD round-trips over the WebSocket protocol", async () => {
  const daemon = await createTestPaseoDaemon();
  cleanupDaemons.add(daemon);
  const client = new DaemonClient({
    url: `ws://127.0.0.1:${daemon.port}/ws`,
    appVersion: "0.1.89",
  });
  cleanupClients.add(client);
  await client.connect();
  await client.fetchAgents({ subscribe: { subscriptionId: "task-crud" } });

  const created = await client.taskCreate({
    project: "proj-crud",
    title: "Write the docs",
    body: "## Notes\nDo the thing.\n",
  });
  expect(created.metadata.actionState).toBe("todo");
  expect(created.metadata.title).toBe("Write the docs");

  const listed = await client.taskList("proj-crud");
  expect(listed.map((t) => t.metadata.id)).toContain(created.metadata.id);

  const updated = await client.taskUpdate("proj-crud", created.metadata.id, {
    actionState: "waiting",
    priority: "high",
  });
  expect(updated.metadata.actionState).toBe("waiting");
  expect(updated.metadata.priority).toBe("high");
  expect(updated.body).toBe("## Notes\nDo the thing.\n");

  const fetched = await client.taskGet("proj-crud", created.metadata.id);
  expect(fetched?.metadata.actionState).toBe("waiting");

  await client.taskDelete("proj-crud", created.metadata.id);
  expect(await client.taskGet("proj-crud", created.metadata.id)).toBeNull();
});

test("task.run dispatches a worktree-backed agent and rolls the result up", async () => {
  const repoRoot = initGitRepo();
  const daemon = await createTestPaseoDaemon();
  cleanupDaemons.add(daemon);
  const client = new DaemonClient({
    url: `ws://127.0.0.1:${daemon.port}/ws`,
    appVersion: "0.1.89",
  });
  cleanupClients.add(client);
  await client.connect();
  await client.fetchAgents({ subscribe: { subscriptionId: "task-run" } });

  const task = await client.taskCreate({
    project: "proj-run",
    title: "Add a greeting",
    run: "agent",
    provider: "claude",
    body: "Say hello.",
  });

  const runResult = await client.taskRun({
    project: "proj-run",
    id: task.metadata.id,
    repoRoot,
  });

  expect(runResult.ok).toBe(true);
  if (!runResult.ok) {
    throw new Error(`task.run failed: ${runResult.error}`);
  }
  expect(runResult.agentId).toBeTruthy();
  // The task is immediately marked waiting (on the agent) with it recorded.
  expect(runResult.task.metadata.actionState).toBe("waiting");
  expect(runResult.task.metadata.agentId).toBe(runResult.agentId);
  expect(runResult.task.metadata.worktree).toContain(path.sep);

  // The roll-up is asynchronous; poll the task file until the fake agent run
  // completes and the result is recorded.
  let rolledUp = await client.taskGet("proj-run", task.metadata.id);
  for (let attempt = 0; attempt < 50 && rolledUp?.metadata.result === null; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 200));
    rolledUp = await client.taskGet("proj-run", task.metadata.id);
  }
  expect(rolledUp?.metadata.result).toBe("success");
  expect(rolledUp?.metadata.actionState).toBe("done");

  // The task file is the source of truth: confirm it landed on disk as markdown.
  const taskFile = path.join(
    daemon.paseoHome,
    "projects",
    "proj-run",
    "tasks",
    `${task.metadata.id}.md`,
  );
  const raw = await readFile(taskFile, "utf-8");
  expect(raw).toContain("result: success");
  expect(raw).toContain("actionState: done");
});

test("task.run reports a clean error when the task has no provider", async () => {
  const repoRoot = initGitRepo();
  const daemon = await createTestPaseoDaemon();
  cleanupDaemons.add(daemon);
  const client = new DaemonClient({
    url: `ws://127.0.0.1:${daemon.port}/ws`,
    appVersion: "0.1.89",
  });
  cleanupClients.add(client);
  await client.connect();
  await client.fetchAgents({ subscribe: { subscriptionId: "task-run-noprovider" } });

  const task = await client.taskCreate({ project: "proj-np", title: "No provider task" });
  const runResult = await client.taskRun({ project: "proj-np", id: task.metadata.id, repoRoot });

  expect(runResult.ok).toBe(false);
  if (runResult.ok) {
    throw new Error("expected task.run to fail without a provider");
  }
  expect(runResult.error).toContain("provider");
});
