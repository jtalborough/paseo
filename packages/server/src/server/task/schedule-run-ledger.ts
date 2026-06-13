import type { ScheduleRun, StoredSchedule } from "@getpaseo/protocol/schedule/types";
import type { TaskScheduledAgentRun } from "@getpaseo/protocol/task/types";

import type { ProjectContextPacketStore } from "../project-context/packet-store.js";
import type { TaskStore } from "./store.js";

const MAX_TASK_SCHEDULED_RUNS = 20;

function summarizeScheduledRun(run: ScheduleRun): string | null {
  const value = run.output ?? run.error;
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }
  return (
    trimmed
      .split("\n")
      .find((line) => line.trim().length > 0)
      ?.trim()
      .slice(0, 240) ?? null
  );
}

function taskResultFromScheduleRun(run: ScheduleRun): TaskScheduledAgentRun["result"] {
  if (run.status === "failed") {
    return "failed";
  }
  if (run.status === "succeeded") {
    return "success";
  }
  return null;
}

function formatScheduleProvider(schedule: StoredSchedule): string | null {
  if (schedule.target.type !== "new-agent") {
    return null;
  }
  const { provider, model } = schedule.target.config;
  return model ? `${provider}/${model}` : provider;
}

function buildScheduledRunPacketId(input: {
  taskId: string;
  scheduleId: string;
  runId: string;
  scheduledFor: string;
}): string {
  const date = input.scheduledFor.slice(0, 10);
  return `scheduled-run-${date}-${input.taskId}-${input.scheduleId}-${input.runId.slice(0, 8)}`;
}

export async function recordTaskScheduleRun(input: {
  taskStore: TaskStore;
  contextPacketStore: ProjectContextPacketStore;
  schedule: StoredSchedule;
  run: ScheduleRun;
}): Promise<void> {
  const { taskStore, contextPacketStore, schedule, run } = input;
  const tasks = (await taskStore.queryAll()).filter((task) =>
    task.metadata.scheduleIds.includes(schedule.id),
  );
  if (tasks.length === 0) {
    return;
  }

  await Promise.all(
    tasks.map(async (task) => {
      const existingRun = task.metadata.scheduledRuns.find(
        (candidate) => candidate.scheduleId === schedule.id && candidate.runId === run.id,
      );
      const packet = await contextPacketStore.create({
        id: buildScheduledRunPacketId({
          taskId: task.metadata.id,
          scheduleId: schedule.id,
          runId: run.id,
          scheduledFor: run.scheduledFor,
        }),
        projectGroupId: task.metadata.projectGroupId,
        launchedAgentId: run.agentId,
        launchReason: `Scheduled task: ${task.metadata.title}`,
        provider: schedule.target.type === "new-agent" ? schedule.target.config.provider : null,
        model: schedule.target.type === "new-agent" ? (schedule.target.config.model ?? null) : null,
        task: `tasks/${task.metadata.id}.md`,
        now: run.startedAt,
      });
      const taskRun: TaskScheduledAgentRun = {
        scheduleId: schedule.id,
        runId: run.id,
        scheduledFor: run.scheduledFor,
        startedAt: run.startedAt,
        endedAt: run.endedAt,
        status: run.status,
        agentId: run.agentId,
        contextPacket: packet.path,
        provider: formatScheduleProvider(schedule),
        folderGrants: [],
        result: taskResultFromScheduleRun(run),
        summary: summarizeScheduledRun(run),
        changedFiles: existingRun?.changedFiles ?? [],
        followUpTaskIds: existingRun?.followUpTaskIds ?? [],
        externalMirrorUpdates: existingRun?.externalMirrorUpdates ?? [],
        acknowledgedAt: existingRun?.acknowledgedAt ?? null,
      };
      const scheduledRuns = [
        ...task.metadata.scheduledRuns.filter(
          (candidate) => !(candidate.scheduleId === schedule.id && candidate.runId === run.id),
        ),
        taskRun,
      ].slice(-MAX_TASK_SCHEDULED_RUNS);
      await taskStore.update(task.metadata.projectGroupId, task.metadata.id, { scheduledRuns });
    }),
  );
}
