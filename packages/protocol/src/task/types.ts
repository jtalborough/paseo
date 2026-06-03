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
 * The GTD engagement state — the spine of a task. Not a progress bar:
 * - do        — actionable now
 * - schedule  — deferred to a date / not yet actionable
 * - waiting   — blocked on someone/something else (incl. a dispatched agent)
 * - review    — needs a decision or attention (e.g. an agent run that failed)
 * - park      — someday/maybe; intentionally not now
 * - done      — completed or dropped (Notion "Drop/Done")
 */
export const ActionStateSchema = z.enum(["do", "schedule", "waiting", "review", "park", "done"]);
export type ActionState = z.infer<typeof ActionStateSchema>;

export const TaskPrioritySchema = z.enum(["high", "medium", "low"]);
export type TaskPriority = z.infer<typeof TaskPrioritySchema>;

export const TaskAttentionSchema = z.enum(["full", "medium", "minimal"]);
export type TaskAttention = z.infer<typeof TaskAttentionSchema>;

/** Who runs the task: the owner by hand, or a dispatched agent. */
export const TaskRunModeSchema = z.enum(["self", "agent"]);
export type TaskRunMode = z.infer<typeof TaskRunModeSchema>;

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
 * Migration shim: tasks created before Action State used `status: todo|doing|done`.
 * Map any legacy value onto the Action State spine so old files keep parsing.
 */
const LEGACY_STATUS_TO_ACTION_STATE: Record<string, ActionState> = {
  todo: "do",
  doing: "waiting",
  done: "done",
};

export const TaskFrontmatterSchema = z
  .object({
    /** Stable id; also the file stem (`<id>.md`). */
    id: z.string().min(1),
    /** The project this task belongs to (projectId from the workspace registry). */
    project: z.string().min(1),
    title: z.string().min(1),
    /** GTD engagement state — the spine. */
    actionState: ActionStateSchema.default("do"),
    run: TaskRunModeSchema.default("self"),

    // --- GTD context / classification (free-form where the user customizes). ---
    priority: TaskPrioritySchema.nullable()
      .optional()
      .transform((value) => value ?? null),
    /** Category, e.g. chore / rnd / create / meeting / coding. Free-form. */
    type: nullableString(),
    /** Where/how it gets done, e.g. cpu / desktop / outdoors / home. Free-form. */
    context: nullableString(),
    attention: TaskAttentionSchema.nullable()
      .optional()
      .transform((value) => value ?? null),

    // --- Scheduling. ---
    /** When to do it (ISO date or datetime); the GTD defer/do date. */
    doDate: nullableString(),
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

    // COMPAT(tasks-actionstate): legacy `status` field, mapped into actionState
    // below. Tasks predate Action State only within the unreleased feature
    // branch; kept so any locally-created files still load.
    status: z.string().optional(),
  })
  .transform((task) => {
    const { status, ...rest } = task;
    // If a legacy status is present and actionState wasn't explicitly set away
    // from its default, honor the legacy value.
    if (status && rest.actionState === "do" && LEGACY_STATUS_TO_ACTION_STATE[status]) {
      return { ...rest, actionState: LEGACY_STATUS_TO_ACTION_STATE[status] };
    }
    return rest;
  });
export type TaskFrontmatter = z.infer<typeof TaskFrontmatterSchema>;

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
  context?: string | null;
  attention?: TaskAttention | null;
  doDate?: string | null;
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
  context?: string | null;
  attention?: TaskAttention | null;
  doDate?: string | null;
  remind?: string[];
  provider?: string | null;
  links?: string[];
  github?: string | null;
  body?: string;
  // Roll-up fields (set by the daemon, not the UI).
  agentId?: string | null;
  worktree?: string | null;
  lastRunAt?: string | null;
  result?: TaskResult | null;
}
