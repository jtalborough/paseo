import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import type { ScheduleRun, StoredSchedule } from "@getpaseo/protocol/schedule/types";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ProjectContextPacketStore } from "../project-context/packet-store.js";
import { recordTaskScheduleRun } from "./schedule-run-ledger.js";
import { TaskStore } from "./store.js";

describe("recordTaskScheduleRun", () => {
  let paseoHome: string;
  let taskStore: TaskStore;
  let contextPacketStore: ProjectContextPacketStore;

  beforeEach(async () => {
    paseoHome = await mkdtemp(path.join(tmpdir(), "paseo-task-schedule-ledger-"));
    taskStore = new TaskStore(paseoHome);
    contextPacketStore = new ProjectContextPacketStore(paseoHome);
  });

  afterEach(async () => {
    await rm(paseoHome, { recursive: true, force: true });
  });

  it("records scheduled task runs with a durable context packet path", async () => {
    const task = await taskStore.create({
      projectGroupId: "grp_scheduled",
      title: "Nightly QA",
      run: "agent",
      provider: "codex",
      scheduleIds: ["sched123"],
    });
    const schedule = createSchedule({
      id: "sched123",
      provider: "codex",
      model: "gpt-5.5",
    });
    const runningRun: ScheduleRun = {
      id: "00000000-0000-4000-8000-00000000run1",
      scheduledFor: "2026-06-13T09:00:00.000Z",
      attempt: 1,
      startedAt: "2026-06-13T09:00:05.000Z",
      endedAt: null,
      status: "running",
      agentId: null,
      output: null,
      error: null,
    };

    await recordTaskScheduleRun({
      taskStore,
      contextPacketStore,
      schedule,
      run: runningRun,
    });

    const afterStart = await taskStore.get("grp_scheduled", task.metadata.id);
    const startedLedgerEntry = afterStart?.metadata.scheduledRuns[0];
    expect(startedLedgerEntry).toMatchObject({
      scheduleId: "sched123",
      runId: runningRun.id,
      status: "running",
      contextPacket: expect.stringMatching(/^context\/packets\/scheduled-run-/),
      provider: "codex/gpt-5.5",
    });
    expect(startedLedgerEntry?.agentId).toBeNull();

    const finishedRun: ScheduleRun = {
      ...runningRun,
      endedAt: "2026-06-13T09:08:00.000Z",
      status: "succeeded",
      agentId: "00000000-0000-4000-8000-000000000123",
      output: "QA passed\nNo blockers.",
    };
    await recordTaskScheduleRun({
      taskStore,
      contextPacketStore,
      schedule,
      run: finishedRun,
    });

    const afterFinish = await taskStore.get("grp_scheduled", task.metadata.id);
    expect(afterFinish?.metadata.scheduledRuns).toEqual([
      {
        scheduleId: "sched123",
        runId: runningRun.id,
        scheduledFor: "2026-06-13T09:00:00.000Z",
        startedAt: "2026-06-13T09:00:05.000Z",
        endedAt: "2026-06-13T09:08:00.000Z",
        status: "succeeded",
        agentId: "00000000-0000-4000-8000-000000000123",
        contextPacket: startedLedgerEntry?.contextPacket,
        provider: "codex/gpt-5.5",
        folderGrants: [],
        result: "success",
        summary: "QA passed",
        changedFiles: [],
        followUpTaskIds: [],
        externalMirrorUpdates: [],
        acknowledgedAt: null,
      },
    ]);
    const packetPath = afterFinish?.metadata.scheduledRuns[0]?.contextPacket;
    expect(packetPath).toBe(startedLedgerEntry?.contextPacket);
    const packetText = await readFile(
      path.join(paseoHome, "projects", "grp_scheduled", packetPath),
      "utf8",
    );
    expect(packetText).toContain('launchReason: "Scheduled task: Nightly QA"');
    expect(packetText).toContain(`task: tasks/${task.metadata.id}.md`);
    expect(packetText).toContain("provider: codex");
    expect(packetText).toContain("model: gpt-5.5");
    expect(packetText).toContain("launchedAgentId: 00000000-0000-4000-8000-000000000123");
  });
});

function createSchedule(input: { id: string; provider: "codex"; model: string }): StoredSchedule {
  return {
    id: input.id,
    name: "Nightly QA",
    prompt: "Run QA",
    cadence: { type: "every", everyMs: 86_400_000 },
    executionMode: "live",
    approvalMode: "approval_before_edit",
    missedRunPolicy: "skip",
    retryPolicy: { maxAttempts: 1, backoffMs: 300_000 },
    pendingRetry: null,
    target: {
      type: "new-agent",
      config: {
        provider: input.provider,
        model: input.model,
        cwd: "/tmp/workspace",
        title: "Nightly QA",
      },
    },
    status: "active",
    createdAt: "2026-06-13T08:00:00.000Z",
    updatedAt: "2026-06-13T08:00:00.000Z",
    nextRunAt: "2026-06-13T09:00:00.000Z",
    lastRunAt: null,
    pausedAt: null,
    expiresAt: null,
    maxRuns: null,
    runs: [],
  };
}
