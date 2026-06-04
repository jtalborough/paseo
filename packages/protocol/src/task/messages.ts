import { z } from "zod";

import {
  ActionStateSchema,
  RecurrenceSchema,
  TaskAttentionSchema,
  TaskConfigSchema,
  TaskPrioritySchema,
  TaskResultSchema,
  TaskRunModeSchema,
  TaskWireSchema,
} from "@getpaseo/protocol/task/types";

/** Editable GTD fields shared by create input and update patch. */
const TaskEditableFields = {
  actionState: ActionStateSchema.optional(),
  run: TaskRunModeSchema.optional(),
  priority: TaskPrioritySchema.nullable().optional(),
  type: z.string().nullable().optional(),
  people: z.array(z.string()).optional(),
  context: z.string().nullable().optional(),
  attention: TaskAttentionSchema.nullable().optional(),
  doDate: z.string().nullable().optional(),
  recurrence: RecurrenceSchema.nullable().optional(),
  remind: z.array(z.string()).optional(),
  provider: z.string().nullable().optional(),
  links: z.array(z.string()).optional(),
  github: z.string().nullable().optional(),
  body: z.string().optional(),
} as const;

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

// --- tasks.query --- (cross-project: powers Inbox / Today / … views)
export const TaskQueryRequestSchema = z.object({
  type: z.literal("tasks.query.request"),
  requestId: z.string(),
});
export const TaskQueryResponseSchema = z.object({
  type: z.literal("tasks.query.response"),
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
    ...TaskEditableFields,
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
    ...TaskEditableFields,
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

// --- task.move --- (reassign a task to a different project / vault folder)
export const TaskMoveRequestSchema = z.object({
  type: z.literal("task.move.request"),
  requestId: z.string(),
  project: z.string().min(1),
  id: z.string().min(1),
  newProject: z.string().min(1),
});
export const TaskMoveResponseSchema = z.object({
  type: z.literal("task.move.response"),
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

// --- task.config.get / task.config.update --- (editable Type/People option lists)
export const TaskConfigGetRequestSchema = z.object({
  type: z.literal("task.config.get.request"),
  requestId: z.string(),
  project: z.string().min(1),
});
export const TaskConfigGetResponseSchema = z.object({
  type: z.literal("task.config.get.response"),
  payload: z.object({
    requestId: z.string(),
    config: TaskConfigSchema,
  }),
});
export const TaskConfigUpdateRequestSchema = z.object({
  type: z.literal("task.config.update.request"),
  requestId: z.string(),
  project: z.string().min(1),
  config: TaskConfigSchema,
});
export const TaskConfigUpdateResponseSchema = z.object({
  type: z.literal("task.config.update.response"),
  payload: z.object({
    requestId: z.string(),
    config: TaskConfigSchema,
  }),
});

export const TaskRequestSchemas = [
  TaskListRequestSchema,
  TaskQueryRequestSchema,
  TaskGetRequestSchema,
  TaskCreateRequestSchema,
  TaskUpdateRequestSchema,
  TaskMoveRequestSchema,
  TaskDeleteRequestSchema,
  TaskRunRequestSchema,
  TaskConfigGetRequestSchema,
  TaskConfigUpdateRequestSchema,
] as const;

export const TaskResponseSchemas = [
  TaskListResponseSchema,
  TaskQueryResponseSchema,
  TaskGetResponseSchema,
  TaskCreateResponseSchema,
  TaskUpdateResponseSchema,
  TaskMoveResponseSchema,
  TaskDeleteResponseSchema,
  TaskRunResponseSchema,
  TaskConfigGetResponseSchema,
  TaskConfigUpdateResponseSchema,
] as const;
