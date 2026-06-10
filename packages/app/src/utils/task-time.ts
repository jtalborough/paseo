import type { StoredTask, TaskTimeEntry } from "@getpaseo/protocol/task/types";

export interface ProjectDayTotal {
  projectGroupId: string;
  seconds: number;
}

export interface TaskDayTotal {
  taskKey: string;
  taskId: string;
  projectGroupId: string;
  title: string;
  seconds: number;
}

export function taskSecondsForDay(task: StoredTask, day: Date, now = new Date()): number {
  const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime();
  const dayEnd = dayStart + 24 * 60 * 60 * 1000;
  return task.metadata.timeEntries.reduce(
    (total, entry) => total + entrySecondsWithin(entry, dayStart, dayEnd, now.getTime()),
    0,
  );
}

export function aggregateProjectDayTotals(
  tasks: StoredTask[],
  day: Date,
  now = new Date(),
): ProjectDayTotal[] {
  const totals = new Map<string, number>();
  for (const task of tasks) {
    const seconds = taskSecondsForDay(task, day, now);
    if (seconds > 0) {
      totals.set(
        task.metadata.projectGroupId,
        (totals.get(task.metadata.projectGroupId) ?? 0) + seconds,
      );
    }
  }
  return Array.from(totals, ([projectGroupId, seconds]) => ({ projectGroupId, seconds })).sort(
    (left, right) => right.seconds - left.seconds,
  );
}

export function aggregateTaskDayTotals(
  tasks: StoredTask[],
  day: Date,
  now = new Date(),
): TaskDayTotal[] {
  return tasks
    .map((task) => ({
      taskKey: `${task.metadata.projectGroupId}:${task.metadata.id}`,
      taskId: task.metadata.id,
      projectGroupId: task.metadata.projectGroupId,
      title: task.metadata.title,
      seconds: taskSecondsForDay(task, day, now),
    }))
    .filter((total) => total.seconds > 0)
    .sort((left, right) => right.seconds - left.seconds || left.title.localeCompare(right.title));
}

export function totalSecondsForDay(tasks: StoredTask[], day: Date, now = new Date()): number {
  return aggregateProjectDayTotals(tasks, day, now).reduce(
    (total, item) => total + item.seconds,
    0,
  );
}

function entrySecondsWithin(
  entry: TaskTimeEntry,
  rangeStartMs: number,
  rangeEndMs: number,
  nowMs: number,
): number {
  const startedMs = Date.parse(entry.startedAt);
  const endedMs = entry.endedAt ? Date.parse(entry.endedAt) : nowMs;
  if (!Number.isFinite(startedMs) || !Number.isFinite(endedMs)) {
    return 0;
  }
  const overlapStart = Math.max(startedMs, rangeStartMs);
  const overlapEnd = Math.min(endedMs, rangeEndMs);
  return Math.max(0, Math.floor((overlapEnd - overlapStart) / 1000));
}
