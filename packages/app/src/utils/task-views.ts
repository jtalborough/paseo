import type {
  CreateTaskInput,
  StoredTask,
  TaskViewDefinition,
} from "@getpaseo/protocol/task/types";

export const BUILTIN_TASK_VIEWS: TaskViewDefinition[] = [
  { id: "today", label: "Today", filter: { active: true, doDate: "due" } },
  { id: "inbox", label: "Inbox", filter: { active: true, doDate: "missing" } },
  { id: "all", label: "All", filter: {} },
];

export function filterTasksByView(
  tasks: StoredTask[],
  view: TaskViewDefinition,
  now = new Date(),
): StoredTask[] {
  const today = localDateKey(now);
  return tasks.filter((task) => matchesFilter(task, view.filter, today));
}

export function taskCreateInputForView(input: {
  title: string;
  projectGroupId: string;
  view: TaskViewDefinition;
  now?: Date;
}): CreateTaskInput {
  const filter = input.view.filter;
  const task: CreateTaskInput = {
    projectGroupId:
      filter.projectGroupIds?.length === 1 ? filter.projectGroupIds[0]! : input.projectGroupId,
    title: input.title,
  };

  if (filter.actionStates?.length === 1) {
    task.actionState = filter.actionStates[0];
  }
  if (filter.priorities?.length === 1) {
    task.priority = filter.priorities[0];
  }
  if (filter.doDate === "due") {
    task.doDate = localDateKey(input.now ?? new Date());
  } else if (filter.doDate === "missing") {
    task.doDate = null;
  }

  return task;
}

function matchesFilter(
  task: StoredTask,
  filter: TaskViewDefinition["filter"],
  today: string,
): boolean {
  const metadata = task.metadata;
  const active = metadata.actionState !== "done" && metadata.actionState !== "dropped";
  if (filter.active !== undefined && active !== filter.active) return false;
  if (filter.doDate === "missing" && metadata.doDate) return false;
  if (filter.doDate === "due" && (!metadata.doDate || metadata.doDate.slice(0, 10) > today)) {
    return false;
  }
  if (filter.actionStates && !filter.actionStates.includes(metadata.actionState)) return false;
  if (filter.priorities && (!metadata.priority || !filter.priorities.includes(metadata.priority))) {
    return false;
  }
  if (filter.projectGroupIds && !filter.projectGroupIds.includes(metadata.projectGroupId)) {
    return false;
  }
  if (filter.timer === "running" && !metadata.timerStartedAt) return false;
  if (filter.timer === "stopped" && metadata.timerStartedAt) return false;
  return true;
}

function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
