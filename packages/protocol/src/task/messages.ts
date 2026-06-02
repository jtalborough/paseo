import { z } from "zod";

import {
  TaskResultSchema,
  TaskRunModeSchema,
  TaskStatusSchema,
  TaskWireSchema,
} from "@getpaseo/protocol/task/types";

/**
 * WebSocket RPC schemas for the Task primitive. Dotted-namespace convention per
 * docs/rpc-namespacing.md: `task.<operation>.request` pairs with
 * `task.<operation>.response`. These are additive and capability-gated behind
 * `server_info.features.tasks` — old clients never send them.
 */

// --- task.list ---
export const TaskListRequestSchema = z.object({
  type: z.literal("task.list.request"),
  requestId: z.string(),
  project: z.string().min(1),
});
export const TaskListResponseSchema = z.object({
  type: z.literal("task.list.response"),
  payload: z.object({
    requestId: z.string(),
    tasks: z.array(TaskWireSchema),
  }),
});

// --- task.get ---
export const TaskGetRequestSchema = z.object({
  type: z.literal("task.get.request"),
  requestId: z.string(),
  project: z.string().min(1),
  id: z.string().min(1),
});
export const TaskGetResponseSchema = z.object({
  type: z.literal("task.get.response"),
  payload: z.object({
    requestId: z.string(),
    task: TaskWireSchema.nullable(),
  }),
});

// --- task.create ---
export const TaskCreateRequestSchema = z.object({
  type: z.literal("task.create.request"),
  requestId: z.string(),
  input: z.object({
    project: z.string().min(1),
    title: z.string().min(1),
    status: TaskStatusSchema.optional(),
    run: TaskRunModeSchema.optional(),
    provider: z.string().nullable().optional(),
    due: z.string().nullable().optional(),
    remind: z.array(z.string()).optional(),
    links: z.array(z.string()).optional(),
    body: z.string().optional(),
  }),
});
export const TaskCreateResponseSchema = z.object({
  type: z.literal("task.create.response"),
  payload: z.object({
    requestId: z.string(),
    task: TaskWireSchema,
  }),
});

// --- task.update ---
export const TaskUpdateRequestSchema = z.object({
  type: z.literal("task.update.request"),
  requestId: z.string(),
  project: z.string().min(1),
  id: z.string().min(1),
  patch: z.object({
    title: z.string().min(1).optional(),
    status: TaskStatusSchema.optional(),
    run: TaskRunModeSchema.optional(),
    provider: z.string().nullable().optional(),
    due: z.string().nullable().optional(),
    remind: z.array(z.string()).optional(),
    links: z.array(z.string()).optional(),
    body: z.string().optional(),
    result: TaskResultSchema.nullable().optional(),
  }),
});
export const TaskUpdateResponseSchema = z.object({
  type: z.literal("task.update.response"),
  payload: z.object({
    requestId: z.string(),
    task: TaskWireSchema,
  }),
});

// --- task.delete ---
export const TaskDeleteRequestSchema = z.object({
  type: z.literal("task.delete.request"),
  requestId: z.string(),
  project: z.string().min(1),
  id: z.string().min(1),
});
export const TaskDeleteResponseSchema = z.object({
  type: z.literal("task.delete.response"),
  payload: z.object({
    requestId: z.string(),
    id: z.string(),
  }),
});

// --- task.run --- (the wedge: dispatch a task to a worktree-backed agent)
export const TaskRunRequestSchema = z.object({
  type: z.literal("task.run.request"),
  requestId: z.string(),
  project: z.string().min(1),
  id: z.string().min(1),
  /** Repo root the worktree branches from (the project's code checkout). */
  repoRoot: z.string().min(1),
  /** Base branch to branch off (defaults to the repo's default branch). */
  baseBranch: z.string().min(1).optional(),
});
export const TaskRunResponseSchema = z.object({
  type: z.literal("task.run.response"),
  payload: z.discriminatedUnion("ok", [
    z.object({
      ok: z.literal(true),
      requestId: z.string(),
      task: TaskWireSchema,
      agentId: z.string(),
    }),
    z.object({
      ok: z.literal(false),
      requestId: z.string(),
      error: z.string(),
    }),
  ]),
});

export const TaskRequestSchemas = [
  TaskListRequestSchema,
  TaskGetRequestSchema,
  TaskCreateRequestSchema,
  TaskUpdateRequestSchema,
  TaskDeleteRequestSchema,
  TaskRunRequestSchema,
] as const;

export const TaskResponseSchemas = [
  TaskListResponseSchema,
  TaskGetResponseSchema,
  TaskCreateResponseSchema,
  TaskUpdateResponseSchema,
  TaskDeleteResponseSchema,
  TaskRunResponseSchema,
] as const;
