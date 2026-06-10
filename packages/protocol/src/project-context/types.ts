import { z } from "zod";

export const ProjectGroupIdSchema = z.string().regex(/^grp_[A-Za-z0-9_-]+$/);
export const ProjectContextFileIdSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/);

function nullableString() {
  return z
    .string()
    .nullable()
    .optional()
    .transform((value) => value ?? null);
}

function nullableNumber() {
  return z
    .number()
    .nullable()
    .optional()
    .transform((value) => value ?? null);
}

function isPortableProjectRelativePath(value: string): boolean {
  if (value.length === 0) {
    return false;
  }
  if (
    value.startsWith("/") ||
    value.startsWith("\\") ||
    /^[A-Za-z]:[\\/]/.test(value) ||
    value.includes("\\") ||
    value.includes("\0")
  ) {
    return false;
  }
  const segments = value.split("/");
  return segments.every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
}

function createProjectPathSchema(options?: { prefix?: string; extensions?: string[] }) {
  return z
    .string()
    .min(1)
    .refine(
      (value) => {
        if (!isPortableProjectRelativePath(value)) {
          return false;
        }
        if (options?.prefix && !value.startsWith(`${options.prefix}/`)) {
          return false;
        }
        if (
          options?.extensions &&
          !options.extensions.some((extension) => value.endsWith(extension))
        ) {
          return false;
        }
        return true;
      },
      {
        message: "Expected a portable Project-relative path",
      },
    );
}

export const ProjectRelativePathSchema = createProjectPathSchema();
export const ProjectPromptPathSchema = createProjectPathSchema({
  prefix: "prompts",
  extensions: [".md"],
});
export const ProjectTaskPathSchema = createProjectPathSchema({
  prefix: "tasks",
  extensions: [".md"],
});
export const ProjectNotePathSchema = createProjectPathSchema({
  prefix: "notes",
  extensions: [".md"],
});
export const ProjectAgentProfilePathSchema = createProjectPathSchema({
  prefix: "agents",
  extensions: [".yaml", ".yml", ".json"],
});
export const ProjectContextPacketPathSchema = createProjectPathSchema({
  prefix: "context/packets",
  extensions: [".yaml", ".yml", ".json"],
});

export const ProjectContextToolGrantSchema = z.string().min(1);
export type ProjectContextToolGrant = z.infer<typeof ProjectContextToolGrantSchema>;

export const ProjectContextFolderGrantSchema = z.object({
  projectId: z.string().min(1),
  path: z.string().min(1).default("."),
  mode: z.enum(["read", "read-write"]).default("read"),
});
export type ProjectContextFolderGrant = z.infer<typeof ProjectContextFolderGrantSchema>;

export const ProjectAgentProfileSchema = z.object({
  schemaVersion: z.literal(1).default(1),
  id: ProjectContextFileIdSchema,
  name: z.string().min(1),
  provider: nullableString(),
  model: nullableString(),
  prompt: ProjectPromptPathSchema.nullable().optional().default(null),
  defaultTools: z.array(ProjectContextToolGrantSchema).optional().default([]),
  folderGrants: z.array(ProjectContextFolderGrantSchema).optional().default([]),
});
export type ProjectAgentProfile = z.infer<typeof ProjectAgentProfileSchema>;

export const ProjectContextPacketBrowserStateSchema = z.object({
  url: z.string().min(1),
  title: z.string().min(1).nullable().optional().default(null),
});
export type ProjectContextPacketBrowserState = z.infer<
  typeof ProjectContextPacketBrowserStateSchema
>;

export const ProjectContextPacketSchema = z.object({
  schemaVersion: z.literal(1).default(1),
  id: ProjectContextFileIdSchema,
  projectGroupId: ProjectGroupIdSchema,
  createdAt: nullableString(),
  createdByAgentId: nullableString(),
  launchedAgentId: nullableString(),
  launchReason: nullableString(),
  profile: ProjectAgentProfilePathSchema.nullable().optional().default(null),
  prompt: ProjectPromptPathSchema.nullable().optional().default(null),
  task: ProjectTaskPathSchema.nullable().optional().default(null),
  notes: z.array(ProjectNotePathSchema).optional().default([]),
  files: z.array(ProjectRelativePathSchema).optional().default([]),
  bookmarks: z.array(z.string().min(1)).optional().default([]),
  browser: z.array(ProjectContextPacketBrowserStateSchema).optional().default([]),
  folderGrants: z.array(ProjectContextFolderGrantSchema).optional().default([]),
});
export type ProjectContextPacket = z.infer<typeof ProjectContextPacketSchema>;

export const ProjectDirectoryManifestChildSchema = z.object({
  projectId: z.string().min(1),
  rootPath: z.string().min(1),
  kind: z.enum(["git", "non_git"]),
  displayName: z.string().min(1),
});
export type ProjectDirectoryManifestChild = z.infer<typeof ProjectDirectoryManifestChildSchema>;

export const ProjectDirectoryManifestSchema = z.object({
  schemaVersion: z.literal(1),
  groupId: ProjectGroupIdSchema,
  displayName: z.string().min(1),
  archetype: z.enum(["code", "records", "ops"]).nullable().optional().default(null),
  color: nullableString(),
  icon: nullableString(),
  order: nullableNumber(),
  children: z.array(ProjectDirectoryManifestChildSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
  archivedAt: nullableString(),
});
export type ProjectDirectoryManifest = z.infer<typeof ProjectDirectoryManifestSchema>;
