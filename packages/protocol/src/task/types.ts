import { z } from "zod";

/**
 * A Task is the planning layer that sits above the Agent execution layer. It is
 * persisted as a markdown file with YAML frontmatter under
 * `$PASEO_HOME/projects/<projectId>/tasks/<id>.md`. The frontmatter holds the
 * queryable metadata defined here; the markdown body holds free-form notes that
 * both the owner and an agent can read and edit.
 *
 * The file is the source of truth. This schema validates only the frontmatter.
 * Markdown (de)serialization lives in the server's TaskStore — the protocol
 * package stays dependency-light (zod only) because it is published.
 *
 * Forward compatibility: every field added after the initial shape is optional
 * with a sensible default so older task files keep parsing. There are no
 * migrations — see docs/data-model.md.
 *
 * The model follows GTD (OmniFocus/Things lineage): the spine is the Action
 * State (what kind of engagement the task needs), layered with context (type,
 * context, attention), priority, and scheduling (doDate).
 */

/**
 * The engagement state — the spine of a task. Not a progress bar:
 * - todo     — actionable now
 * - waiting  — blocked on someone/something else (incl. a dispatched agent)
 * - info     — needs a decision, more info, or attention (e.g. a failed run)
 * - someday  — deferred / maybe; intentionally not now
 * - dropped  — abandoned, won't do
 * - done     — completed
 */
export const ActionStateSchema = z.enum(["todo", "waiting", "info", "someday", "dropped", "done"]);
export type ActionState = z.infer<typeof ActionStateSchema>;

export const TaskPrioritySchema = z.enum(["high", "medium", "low"]);
export type TaskPriority = z.infer<typeof TaskPrioritySchema>;

export const TaskAttentionSchema = z.enum(["full", "medium", "minimal"]);
export type TaskAttention = z.infer<typeof TaskAttentionSchema>;

/** Who runs the task: the owner by hand, or a dispatched agent. */
export const TaskRunModeSchema = z.enum(["self", "agent"]);
export type TaskRunMode = z.infer<typeof TaskRunModeSchema>;

export const WeekdaySchema = z.enum(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]);
export type Weekday = z.infer<typeof WeekdaySchema>;

/**
 * Recurrence rule. When a recurring task is completed the daemon reschedules it
 * in place (resets to ToDo with the next doDate) — see the server's recurrence
 * compute. Supports both relative ("every N units") and absolute (weekday /
 * month-day / year) cadences.
 */
export const RecurrenceSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("relative"),
    every: z.number().int().positive(),
    unit: z.enum(["day", "week", "month", "year"]),
    /** treadmill ("completion") vs fixed cadence ("scheduled"). */
    from: z.enum(["completion", "scheduled"]).default("scheduled"),
  }),
  z.object({ kind: z.literal("weekly"), weekdays: z.array(WeekdaySchema).min(1) }),
  z.object({ kind: z.literal("monthly"), day: z.number().int().min(1).max(31) }),
  z.object({
    kind: z.literal("yearly"),
    month: z.number().int().min(1).max(12),
    day: z.number().int().min(1).max(31),
  }),
]);
export type Recurrence = z.infer<typeof RecurrenceSchema>;

/** Outcome rolled up from an agent run back onto the task. */
export const TaskResultSchema = z.enum(["success", "failed"]);
export type TaskResult = z.infer<typeof TaskResultSchema>;

function nullableString() {
  return z
    .string()
    .nullable()
    .optional()
    .transform((value) => value ?? null);
}

/**
 * Migration shim. Two older vocabularies map onto the current Action State:
 * - the original `status: todo|doing|done`
 * - the first Action State set `do|schedule|waiting|review|park|done`
 * Mapping them on read keeps existing task files loading without migrations.
 */
const LEGACY_STATUS_TO_ACTION_STATE: Record<string, ActionState> = {
  // original status vocabulary
  doing: "waiting",
  // first action-state vocabulary
  do: "todo",
  schedule: "someday",
  review: "info",
  park: "someday",
  // values that are already valid pass through untouched
};

export const TaskFrontmatterSchema = z
  .object({
    /** Stable id; also the file stem (`<id>.md`). */
    id: z.string().min(1),
    /** The project this task belongs to (projectId from the workspace registry). */
    project: z.string().min(1),
    title: z.string().min(1),
    /**
     * Engagement state — the spine. Accepted leniently as a string so legacy
     * vocabularies parse; normalized to a valid ActionState in the transform.
     */
    actionState: z.string().optional(),
    run: TaskRunModeSchema.default("self"),

    // --- GTD context / classification (free-form where the user customizes). ---
    priority: TaskPrioritySchema.nullable()
      .optional()
      .transform((value) => value ?? null),
    /** Category, e.g. chore / coding / meeting. Picked from the project's list. */
    type: nullableString(),
    /** People associated with the task. Picked from the project's list. */
    people: z.array(z.string()).default([]),
    /** Where/how it gets done, e.g. cpu / desktop / outdoors / home. Free-form. */
    context: nullableString(),
    attention: TaskAttentionSchema.nullable()
      .optional()
      .transform((value) => value ?? null),

    // --- Scheduling. ---
    /** When to do it (ISO date or datetime); the GTD defer/do date. */
    doDate: nullableString(),
    /** Recurrence rule; null for one-off tasks. */
    recurrence: RecurrenceSchema.nullable()
      .optional()
      .transform((value) => value ?? null),
    /** Reminder offsets: absolute ISO datetimes and/or relative like "-3d". */
    remind: z.array(z.string()).default([]),

    // --- Execution. ---
    /** Provider/model used when `run: agent`, e.g. "codex/gpt-5.4". */
    provider: nullableString(),

    // --- Links / sources. ---
    /** Related files/URLs (e.g. ./docs/hvac-manual.pdf). */
    links: z.array(z.string()).default([]),
    /** GitHub issue/PR this task was seeded from or tracks. */
    github: nullableString(),

    createdAt: z.string(),
    updatedAt: z.string(),

    // --- Roll-up fields: written back by the daemon after a run. ---
    /** Id of the most recently dispatched agent run. */
    agentId: nullableString(),
    /** Worktree path the agent ran in (disposable; recorded for traceability). */
    worktree: nullableString(),
    /** When the last run started (ISO). */
    lastRunAt: nullableString(),
    /** Outcome of the last run. */
    result: TaskResultSchema.nullable()
      .optional()
      .transform((value) => value ?? null),

    // --- Completion history (for recurring tasks reset in place). ---
    /** ISO timestamp of the most recent completion. */
    lastCompletedAt: nullableString(),
    /** Recent completion timestamps (most recent last), capped by the daemon. */
    completions: z.array(z.string()).default([]),

    // COMPAT(tasks-actionstate): legacy `status` field, folded into actionState
    // in the transform. Kept so files from before Action State still load.
    status: z.string().optional(),
  })
  .transform((task) => {
    const { status, actionState, ...rest } = task;
    return { ...rest, actionState: resolveActionState(actionState, status) };
  });
export type TaskFrontmatter = z.infer<typeof TaskFrontmatterSchema>;

/** Resolve a valid ActionState from the (possibly legacy/empty) raw fields. */
function resolveActionState(
  raw: string | undefined,
  legacyStatus: string | undefined,
): ActionState {
  for (const candidate of [raw, legacyStatus]) {
    if (!candidate) continue;
    const parsed = ActionStateSchema.safeParse(candidate);
    if (parsed.success) return parsed.data;
    const mapped = LEGACY_STATUS_TO_ACTION_STATE[candidate];
    if (mapped) return mapped;
  }
  return "todo";
}

/**
 * Wire shape of a task: queryable frontmatter + free-form markdown body. Used
 * both as the in-memory `StoredTask` (server) and the over-the-wire payload.
 */
export const TaskWireSchema = z.object({
  metadata: TaskFrontmatterSchema,
  body: z.string(),
});

/** A fully materialized task: queryable frontmatter + free-form markdown body. */
export type StoredTask = z.infer<typeof TaskWireSchema>;

export interface CreateTaskInput {
  project: string;
  title: string;
  actionState?: ActionState;
  run?: TaskRunMode;
  priority?: TaskPriority | null;
  type?: string | null;
  people?: string[];
  context?: string | null;
  attention?: TaskAttention | null;
  doDate?: string | null;
  recurrence?: Recurrence | null;
  remind?: string[];
  provider?: string | null;
  links?: string[];
  github?: string | null;
  body?: string;
}

export interface UpdateTaskInput {
  title?: string;
  actionState?: ActionState;
  run?: TaskRunMode;
  priority?: TaskPriority | null;
  type?: string | null;
  people?: string[];
  context?: string | null;
  attention?: TaskAttention | null;
  doDate?: string | null;
  recurrence?: Recurrence | null;
  remind?: string[];
  provider?: string | null;
  links?: string[];
  github?: string | null;
  body?: string;
  // Roll-up / completion fields (set by the daemon, not the UI).
  agentId?: string | null;
  worktree?: string | null;
  lastRunAt?: string | null;
  result?: TaskResult | null;
  lastCompletedAt?: string | null;
  completions?: string[];
}

/**
 * Per-project, user-editable option lists that back the Type and People
 * pickers. Stored at `projects/<id>/tasks/task-config.json`. Free-form: the
 * owner adds/removes values; tasks reference them by string.
 */
export const TaskConfigSchema = z.object({
  types: z.array(z.string()).default([]),
  people: z.array(z.string()).default([]),
  contexts: z.array(z.string()).default([]),
});
export type TaskConfig = z.infer<typeof TaskConfigSchema>;

/** Sensible starter Type options for a new project (owner can edit). */
export const DEFAULT_TASK_TYPES: string[] = [
  "chore",
  "coding",
  "create",
  "research",
  "meeting",
  "errand",
];

/** Sensible starter Context options for a new project (owner can edit). */
export const DEFAULT_TASK_CONTEXTS: string[] = ["cpu", "desktop", "home", "outdoors", "errands"];
