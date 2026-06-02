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
 */

export const TaskStatusSchema = z.enum(["todo", "doing", "done"]);
export type TaskStatus = z.infer<typeof TaskStatusSchema>;

/** Who runs the task: the owner by hand, or a dispatched agent. */
export const TaskRunModeSchema = z.enum(["self", "agent"]);
export type TaskRunMode = z.infer<typeof TaskRunModeSchema>;

/** Outcome rolled up from an agent run back onto the task. */
export const TaskResultSchema = z.enum(["success", "failed"]);
export type TaskResult = z.infer<typeof TaskResultSchema>;

export const TaskFrontmatterSchema = z.object({
  /** Stable id; also the file stem (`<id>.md`). */
  id: z.string().min(1),
  /** The project this task belongs to (projectId from the workspace registry). */
  project: z.string().min(1),
  title: z.string().min(1),
  status: TaskStatusSchema.default("todo"),
  run: TaskRunModeSchema.default("self"),
  /** Provider/model used when `run: agent`, e.g. "codex/gpt-5.4". */
  provider: z
    .string()
    .nullable()
    .optional()
    .transform((value) => value ?? null),
  /** Optional due date (ISO date or datetime). */
  due: z
    .string()
    .nullable()
    .optional()
    .transform((value) => value ?? null),
  /** Reminder offsets: absolute ISO datetimes and/or relative like "-3d". */
  remind: z.array(z.string()).default([]),
  /** Related files/URLs (e.g. ./docs/hvac-manual.pdf, PR/issue links). */
  links: z.array(z.string()).default([]),
  createdAt: z.string(),
  updatedAt: z.string(),

  // --- Roll-up fields: written back by the daemon after a run. ---
  /** Id of the most recently dispatched agent run. */
  agentId: z
    .string()
    .nullable()
    .optional()
    .transform((value) => value ?? null),
  /** Worktree path the agent ran in (disposable; recorded for traceability). */
  worktree: z
    .string()
    .nullable()
    .optional()
    .transform((value) => value ?? null),
  /** When the last run started (ISO). */
  lastRunAt: z
    .string()
    .nullable()
    .optional()
    .transform((value) => value ?? null),
  /** Outcome of the last run. */
  result: TaskResultSchema.nullable()
    .optional()
    .transform((value) => value ?? null),
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
  status?: TaskStatus;
  run?: TaskRunMode;
  provider?: string | null;
  due?: string | null;
  remind?: string[];
  links?: string[];
  body?: string;
}

export interface UpdateTaskInput {
  title?: string;
  status?: TaskStatus;
  run?: TaskRunMode;
  provider?: string | null;
  due?: string | null;
  remind?: string[];
  links?: string[];
  body?: string;
  // Roll-up fields (set by the daemon, not the UI).
  agentId?: string | null;
  worktree?: string | null;
  lastRunAt?: string | null;
  result?: TaskResult | null;
}
