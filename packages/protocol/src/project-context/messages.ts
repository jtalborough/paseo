import { z } from "zod";

import {
  ProjectAgentProfilePathSchema,
  ProjectAgentProfileSchema,
  ProjectContextFileIdSchema,
  ProjectContextFolderGrantSchema,
  ProjectContextPacketPathSchema,
  ProjectContextPacketBrowserStateSchema,
  ProjectContextPacketSchema,
  ProjectContextToolGrantSchema,
  ProjectNotePathSchema,
  ProjectPromptPathSchema,
  ProjectRelativePathSchema,
  ProjectTaskPathSchema,
} from "@getpaseo/protocol/project-context/types";

const ProjectGroupIdSchema = z.string().regex(/^grp_[A-Za-z0-9_-]+$/);
const NullableStringFieldSchema = z
  .string()
  .nullable()
  .optional()
  .transform((value) => value ?? null);

export const ProjectContextPacketListRequestSchema = z.object({
  type: z.literal("project.context.packets.list.request"),
  requestId: z.string(),
  projectGroupId: ProjectGroupIdSchema,
});

export const ProjectContextPacketListResponseSchema = z.object({
  type: z.literal("project.context.packets.list.response"),
  payload: z.object({
    requestId: z.string(),
    packets: z.array(
      z.object({
        path: ProjectContextPacketPathSchema,
        packet: ProjectContextPacketSchema,
      }),
    ),
  }),
});

export const ProjectContextPacketCreateRequestSchema = z.object({
  type: z.literal("project.context.packets.create.request"),
  requestId: z.string(),
  projectGroupId: ProjectGroupIdSchema,
  id: ProjectContextFileIdSchema.optional(),
  createdByAgentId: NullableStringFieldSchema,
  launchedAgentId: NullableStringFieldSchema,
  launchReason: NullableStringFieldSchema,
  provider: NullableStringFieldSchema,
  model: NullableStringFieldSchema,
  profile: ProjectAgentProfilePathSchema.nullable().optional().default(null),
  prompt: ProjectPromptPathSchema.nullable().optional().default(null),
  task: ProjectTaskPathSchema.nullable().optional().default(null),
  tools: z.array(ProjectContextToolGrantSchema).optional().default([]),
  notes: z.array(ProjectNotePathSchema).optional().default([]),
  files: z.array(ProjectRelativePathSchema).optional().default([]),
  bookmarks: z.array(z.string().min(1)).optional().default([]),
  browser: z.array(ProjectContextPacketBrowserStateSchema).optional().default([]),
  folderGrants: z.array(ProjectContextFolderGrantSchema).optional().default([]),
});

export const ProjectContextPacketCreateResponseSchema = z.object({
  type: z.literal("project.context.packets.create.response"),
  payload: z.object({
    requestId: z.string(),
    path: ProjectContextPacketPathSchema,
    packet: ProjectContextPacketSchema,
  }),
});

export const ProjectAgentProfileListRequestSchema = z.object({
  type: z.literal("project.agent.profiles.list.request"),
  requestId: z.string(),
  projectGroupId: ProjectGroupIdSchema,
});

export const ProjectAgentProfileListResponseSchema = z.object({
  type: z.literal("project.agent.profiles.list.response"),
  payload: z.object({
    requestId: z.string(),
    profiles: z.array(
      z.object({
        path: ProjectAgentProfilePathSchema,
        profile: ProjectAgentProfileSchema,
      }),
    ),
  }),
});

export const ProjectAgentProfileUpsertRequestSchema = z.object({
  type: z.literal("project.agent.profiles.upsert.request"),
  requestId: z.string(),
  projectGroupId: ProjectGroupIdSchema,
  path: ProjectAgentProfilePathSchema.optional(),
  profile: ProjectAgentProfileSchema,
});

export const ProjectAgentProfileUpsertResponseSchema = z.object({
  type: z.literal("project.agent.profiles.upsert.response"),
  payload: z.object({
    requestId: z.string(),
    path: ProjectAgentProfilePathSchema,
    profile: ProjectAgentProfileSchema,
  }),
});

export const ProjectAgentProfileDeleteRequestSchema = z.object({
  type: z.literal("project.agent.profiles.delete.request"),
  requestId: z.string(),
  projectGroupId: ProjectGroupIdSchema,
  path: ProjectAgentProfilePathSchema,
});

export const ProjectAgentProfileDeleteResponseSchema = z.object({
  type: z.literal("project.agent.profiles.delete.response"),
  payload: z.object({
    requestId: z.string(),
    path: ProjectAgentProfilePathSchema,
  }),
});

export const ProjectContextRequestSchemas = [
  ProjectContextPacketListRequestSchema,
  ProjectContextPacketCreateRequestSchema,
  ProjectAgentProfileListRequestSchema,
  ProjectAgentProfileUpsertRequestSchema,
  ProjectAgentProfileDeleteRequestSchema,
] as const;

export const ProjectContextResponseSchemas = [
  ProjectContextPacketListResponseSchema,
  ProjectContextPacketCreateResponseSchema,
  ProjectAgentProfileListResponseSchema,
  ProjectAgentProfileUpsertResponseSchema,
  ProjectAgentProfileDeleteResponseSchema,
] as const;
