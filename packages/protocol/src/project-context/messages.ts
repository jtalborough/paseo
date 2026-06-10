import { z } from "zod";

import {
  ProjectContextPacketPathSchema,
  ProjectContextPacketSchema,
} from "@getpaseo/protocol/project-context/types";

const ProjectGroupIdSchema = z.string().regex(/^grp_[A-Za-z0-9_-]+$/);

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

export const ProjectContextRequestSchemas = [ProjectContextPacketListRequestSchema] as const;

export const ProjectContextResponseSchemas = [ProjectContextPacketListResponseSchema] as const;
