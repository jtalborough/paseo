import { describe, expect, test } from "vitest";
import type { ProjectAgentProfileEntry } from "@getpaseo/client/internal/daemon-client";
import type { ProviderSnapshotEntry } from "@getpaseo/protocol/agent-types";
import type { ScheduleSummary } from "@getpaseo/protocol/schedule/types";
import type { StoredTask } from "@getpaseo/protocol/task/types";
import {
  buildTaskAgentOptions,
  upsertScheduleInList,
  upsertTaskInList,
} from "./project-tasks-screen-core";

function task(id: string, provider: string | null = null, scheduleIds: string[] = []): StoredTask {
  return {
    metadata: {
      id,
      projectGroupId: "grp_work",
      title: `Task ${id}`,
      actionState: "todo",
      run: provider ? "agent" : "self",
      priority: null,
      type: null,
      people: [],
      context: null,
      attention: null,
      doDate: null,
      recurrence: null,
      remind: [],
      scheduleIds,
      scheduledRuns: [],
      timerStartedAt: null,
      trackedSeconds: 0,
      timeEntries: [],
      provider,
      links: [],
      github: null,
      sources: [],
      createdAt: "2026-06-13T00:00:00.000Z",
      updatedAt: "2026-06-13T00:00:00.000Z",
      agentId: null,
      worktree: null,
      contextPacket: null,
      lastRunAt: null,
      result: null,
      lastCompletedAt: null,
      completions: [],
    },
    body: "",
  };
}

function schedule(id: string, name = id): ScheduleSummary {
  return {
    id,
    name,
    prompt: "Run the task",
    cadence: { type: "every", everyMs: 60_000 },
    executionMode: "live",
    approvalMode: "auto",
    missedRunPolicy: "skip",
    retryPolicy: { maxAttempts: 1, backoffMs: 300_000 },
    target: {
      type: "new-agent",
      config: { provider: "codex", cwd: "/repo", title: name },
    },
    status: "active",
    createdAt: "2026-06-13T00:00:00.000Z",
    updatedAt: "2026-06-13T00:00:00.000Z",
    nextRunAt: null,
    lastRunAt: null,
    pausedAt: null,
    expiresAt: null,
    maxRuns: null,
  };
}

describe("project tasks screen helpers", () => {
  test("upserts tasks into a possibly stale query cache", () => {
    const original = task("one", "codex");
    const replacement = task("one", "codex/gpt-5.5", ["sched_one"]);
    const added = task("two", "claude");

    expect(upsertTaskInList([original], replacement)).toEqual([replacement]);
    expect(upsertTaskInList([replacement], added)).toEqual([replacement, added]);
    expect(upsertTaskInList(undefined, added)).toEqual([added]);
  });

  test("upserts schedules into a possibly stale query cache", () => {
    const original = schedule("sched_one", "Original");
    const replacement = schedule("sched_one", "Updated");
    const added = schedule("sched_two", "Second");

    expect(upsertScheduleInList([original], replacement)).toEqual([replacement]);
    expect(upsertScheduleInList([replacement], added)).toEqual([replacement, added]);
    expect(upsertScheduleInList(undefined, added)).toEqual([added]);
  });

  test("builds agent dropdown options from profiles, ready providers, and existing tasks", () => {
    const profiles: ProjectAgentProfileEntry[] = [
      {
        path: "agents/qa-tester.yaml",
        profile: {
          schemaVersion: 1,
          id: "qa-tester",
          name: "QA Tester",
          provider: "codex",
          model: "gpt-5.5",
          prompt: "prompts/qa.md",
          defaultTools: [],
          folderGrants: [],
        },
      },
      {
        path: "agents/prompt-only.yaml",
        profile: {
          schemaVersion: 1,
          id: "prompt-only",
          name: "Prompt Only",
          provider: null,
          model: null,
          prompt: "prompts/only.md",
          defaultTools: [],
          folderGrants: [],
        },
      },
    ];
    const providerEntries: ProviderSnapshotEntry[] = [
      {
        provider: "codex",
        label: "Codex",
        status: "ready",
        enabled: true,
        models: [
          { provider: "codex", id: "gpt-5.5", label: "GPT-5.5" },
          { provider: "codex", id: "gpt-5.4", label: "GPT-5.4" },
        ],
      },
      {
        provider: "claude",
        label: "Claude",
        status: "ready",
        enabled: true,
        models: [],
      },
      {
        provider: "opencode",
        label: "OpenCode",
        status: "unavailable",
        enabled: true,
      },
    ];

    expect(
      buildTaskAgentOptions({
        profiles,
        providerEntries,
        tasks: [task("existing", "custom-provider/custom-model")],
      }),
    ).toEqual([
      { value: "codex/gpt-5.5", label: "QA Tester - codex/gpt-5.5" },
      { value: "codex/gpt-5.4", label: "Codex / GPT-5.4" },
      { value: "claude", label: "Claude default" },
      { value: "custom-provider/custom-model", label: "custom-provider/custom-model" },
    ]);
  });
});
