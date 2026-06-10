import { constants, promises as fs } from "node:fs";
import path from "node:path";
import {
  ProjectDirectoryManifestSchema,
  type ProjectDirectoryManifest,
} from "@getpaseo/protocol/project-context/types";
import { writeFileAtomic } from "./atomic-file.js";
import type { PersistedGroupRecord, PersistedProjectRecord } from "./workspace-registry.js";

const PROJECT_MANIFEST_FILENAME = "project.json";
const PROJECT_NOTES_FILENAME = "project.md";
const AGENTS_README_CONTENT = `# Agent Profiles

Project agent profiles are durable, syncable definitions for reusable agent roles.
Runtime agent sessions still live under $PASEO_HOME/agents and are not stored here.

\`\`\`yaml
schemaVersion: 1
id: implementation-agent
name: Implementation Agent
provider: codex
prompt: prompts/implementation.md
defaultTools:
  - project-files
  - project-tasks
folderGrants:
  - projectId: child-1
    path: .
    mode: read-write
\`\`\`
`;
const CONTEXT_PACKETS_README_CONTENT = `# Context Packets

Context packets are explicit launch bundles for agents. They list the prompt, task, notes,
bookmarks, files, and folder grants the user selected for a run.

\`\`\`yaml
schemaVersion: 1
id: 2026-06-09-example-run
projectGroupId: grp_example
profile: agents/implementation-agent.yaml
prompt: prompts/implementation.md
task: tasks/2026-06-09-example-task.md
notes:
  - notes/architecture.md
folderGrants:
  - projectId: child-1
    path: .
    mode: read-write
\`\`\`
`;
const CONTEXT_README_CONTENT = `# Context

Project context files are durable, local-only authoring files. Packets under \`packets/\` record
the explicit prompt/profile/file bundle a user chose for a launch. Runtime agent state still lives
under $PASEO_HOME/agents.
`;
const PROMPTS_README_CONTENT = `# Prompts

Reusable Project prompts live here as plain Markdown. Agent profiles and context packets can
reference these files with Project-root-relative paths such as \`prompts/implementation.md\`.
`;
const PROJECT_MANAGER_PROMPT_CONTENT = `# Project Manager

You are the Project manager for this Paseo Project. Keep the local Project files useful for both
the human and future agents.

Responsibilities:
- Keep active work in \`tasks/\` as Markdown-backed Project Tasks.
- Keep durable context, decisions, and reference material in \`notes/\`.
- Use \`context/packets/\` to explain what was handed to an agent run.
- Prefer local Project files as the execution source of truth. External tools such as Notion can be
  provenance or mirror surfaces, but they are not required to run the Project.

Before launching or briefing an agent, identify the task, relevant notes/files, browser state if
available, and explicit Folder grants. After an agent finishes, update the task and add or revise
notes only when they preserve durable context.
`;
const PROJECT_MANAGER_AGENT_CONTENT = `schemaVersion: 1
id: project-manager
name: Project Manager
provider: null
model: null
prompt: prompts/project-manager.md
defaultTools:
  - project-tasks
  - project-notes
  - project-context-packets
folderGrants: []
`;
const TASKS_README_CONTENT = `# Tasks

Each structured Task is a Markdown file with YAML frontmatter and a free-form Markdown body.
The file is authoritative and syncs with the rest of this Project.

\`\`\`markdown
---
id: 2026-06-08-example-task
projectGroupId: grp_example
title: Example task
actionState: todo
run: self
createdAt: 2026-06-08T00:00:00.000Z
updatedAt: 2026-06-08T00:00:00.000Z
---

Notes, context, and acceptance criteria.
\`\`\`
`;

export function projectDirectoryPath(paseoHome: string, groupId: string): string {
  assertProjectGroupId(groupId);
  return path.join(paseoHome, "projects", groupId);
}

export function archivedProjectDirectoryPath(
  paseoHome: string,
  groupId: string,
  archivedAt: string,
): string {
  assertProjectGroupId(groupId);
  const suffix = archivedAt.replace(/[:.]/g, "-");
  return path.join(paseoHome, "projects", "archived", `${groupId}-${suffix}`);
}

export async function syncProjectDirectory(input: {
  paseoHome: string;
  group: PersistedGroupRecord;
  children: PersistedProjectRecord[];
}): Promise<string> {
  const cwd = projectDirectoryPath(input.paseoHome, input.group.groupId);
  await fs.mkdir(path.join(cwd, "agents"), { recursive: true });
  await fs.mkdir(path.join(cwd, "context", "packets"), { recursive: true });
  await fs.mkdir(path.join(cwd, "prompts"), { recursive: true });
  await fs.mkdir(path.join(cwd, "tasks"), { recursive: true });
  await fs.mkdir(path.join(cwd, "notes"), { recursive: true });
  await writeFileIfMissing(
    path.join(cwd, PROJECT_NOTES_FILENAME),
    `# ${input.group.displayName}\n\n`,
  );
  await writeFileIfMissing(path.join(cwd, "agents", "README.md"), AGENTS_README_CONTENT);
  await writeFileIfMissing(path.join(cwd, "context", "README.md"), CONTEXT_README_CONTENT);
  await writeFileIfMissing(
    path.join(cwd, "context", "packets", "README.md"),
    CONTEXT_PACKETS_README_CONTENT,
  );
  await writeFileIfMissing(path.join(cwd, "prompts", "README.md"), PROMPTS_README_CONTENT);
  await writeFileIfMissing(
    path.join(cwd, "prompts", "project-manager.md"),
    PROJECT_MANAGER_PROMPT_CONTENT,
  );
  await writeFileIfMissing(
    path.join(cwd, "agents", "project-manager.yaml"),
    PROJECT_MANAGER_AGENT_CONTENT,
  );
  await writeFileIfMissing(path.join(cwd, "tasks", "README.md"), TASKS_README_CONTENT);
  await writeFileIfMissing(path.join(cwd, "notes", "README.md"), "# Notes\n\n");
  const manifest: ProjectDirectoryManifest = ProjectDirectoryManifestSchema.parse({
    schemaVersion: 1,
    groupId: input.group.groupId,
    displayName: input.group.displayName,
    archetype: input.group.archetype,
    color: input.group.color,
    icon: input.group.icon,
    order: input.group.order,
    children: input.children.map((child) => ({
      projectId: child.projectId,
      rootPath: child.rootPath,
      kind: child.kind,
      displayName: child.displayName,
    })),
    createdAt: input.group.createdAt,
    updatedAt: input.group.updatedAt,
    archivedAt: input.group.archivedAt,
  });
  await writeManifestIfChanged(path.join(cwd, PROJECT_MANIFEST_FILENAME), manifest);
  return cwd;
}

export async function archiveProjectDirectory(input: {
  paseoHome: string;
  groupId: string;
  archivedAt: string;
}): Promise<void> {
  const current = projectDirectoryPath(input.paseoHome, input.groupId);
  try {
    await fs.access(current, constants.F_OK);
  } catch {
    return;
  }

  const archived = archivedProjectDirectoryPath(input.paseoHome, input.groupId, input.archivedAt);
  await fs.mkdir(path.dirname(archived), { recursive: true });
  await fs.rename(current, archived);
}

async function writeFileIfMissing(filePath: string, contents: string): Promise<void> {
  try {
    await fs.writeFile(filePath, contents, { flag: "wx" });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      return;
    }
    throw error;
  }
}

async function writeManifestIfChanged(
  filePath: string,
  manifest: ProjectDirectoryManifest,
): Promise<void> {
  const contents = JSON.stringify(manifest, null, 2);
  try {
    if ((await fs.readFile(filePath, "utf8")) === contents) {
      return;
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }
  await writeFileAtomic(filePath, contents);
}

function assertProjectGroupId(groupId: string): void {
  if (!/^grp_[A-Za-z0-9_-]+$/.test(groupId)) {
    throw new Error("Invalid Project group id");
  }
}
