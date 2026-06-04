import type { StoredTask } from "@getpaseo/protocol/task/types";

/** The cross-project views, in display order. */
export const TASK_VIEWS = [
  "today",
  "inbox",
  "upcoming",
  "waiting",
  "someday",
  "done",
  "all",
] as const;
export type TaskView = (typeof TASK_VIEWS)[number];

export const TASK_VIEW_LABEL: Record<TaskView, string> = {
  today: "Today",
  inbox: "Inbox",
  upcoming: "Upcoming",
  waiting: "Waiting",
  someday: "Someday",
  done: "Done",
  all: "All",
};

const ACTIONABLE = new Set(["todo", "waiting", "info"]);

function dateOnly(value: string | null): string | null {
  if (!value) return null;
  return value.slice(0, 10);
}

/**
 * Pure filter powering the global views. `todayIso` is the YYYY-MM-DD for "today"
 * so the logic is deterministic and testable.
 */
export function filterTasksForView(
  tasks: StoredTask[],
  view: TaskView,
  todayIso: string,
): StoredTask[] {
  return tasks.filter((task) => matchesView(task, view, todayIso));
}

function matchesView(task: StoredTask, view: TaskView, todayIso: string): boolean {
  const { actionState } = task.metadata;
  const due = dateOnly(task.metadata.doDate);
  switch (view) {
    case "today":
      return ACTIONABLE.has(actionState) && due !== null && due <= todayIso;
    case "inbox":
      return actionState === "todo" && due === null;
    case "upcoming":
      return ACTIONABLE.has(actionState) && due !== null && due > todayIso;
    case "waiting":
      return actionState === "waiting";
    case "someday":
      return actionState === "someday";
    case "done":
      return actionState === "done";
    case "all":
      return actionState !== "dropped";
  }
}

/** Count per view, for badges on the view switcher. */
export function countTasksByView(tasks: StoredTask[], todayIso: string): Record<TaskView, number> {
  const counts = {} as Record<TaskView, number>;
  for (const view of TASK_VIEWS) {
    counts[view] = filterTasksForView(tasks, view, todayIso).length;
  }
  return counts;
}
