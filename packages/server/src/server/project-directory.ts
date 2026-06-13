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
const PROJECT_SEED_STATE_FILENAME = ".paseo-seeds.json";
const PROJECT_SEED_STATE_VERSION = 1;
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
const QA_TESTER_PROMPT_CONTENT = `# QA Tester

You are the QA tester for this Project. Your job is to verify that recent work is actually ready
for the human to use.

Responsibilities:
- Turn the task, changed files, and user-visible behavior into a concrete test checklist.
- Run focused, deterministic checks that match the changed surface.
- Exercise the UI path when the feature is user-facing, using screenshots or exact steps when
  automation is not available.
- Report blockers, regressions, and polish issues separately.
- Cite the exact commands, files, and results you used as evidence.

Do not mark work complete just because code exists. Mark it complete only when the behavior is
observable, the relevant checks pass, and any remaining risk is explicit.

If you find a defect, write the smallest reproduction and the expected behavior. Do not fix code
unless the human or lead agent asks you to switch from QA into implementation.
`;
const QA_TESTER_AGENT_CONTENT = `schemaVersion: 1
id: qa-tester
name: QA Tester
provider: null
model: null
prompt: prompts/qa-tester.md
defaultTools:
  - project-files
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

interface ProjectSeedFile {
  id: string;
  relativePath: string;
  contents: string;
}

interface ProjectSeedState {
  schemaVersion: typeof PROJECT_SEED_STATE_VERSION;
  seeded: string[];
}

const PROJECT_SEED_FILES: ProjectSeedFile[] = [
  {
    id: "project-notes",
    relativePath: PROJECT_NOTES_FILENAME,
    contents: "",
  },
  {
    id: "agents-readme",
    relativePath: "agents/README.md",
    contents: AGENTS_README_CONTENT,
  },
  {
    id: "context-readme",
    relativePath: "context/README.md",
    contents: CONTEXT_README_CONTENT,
  },
  {
    id: "context-packets-readme",
    relativePath: "context/packets/README.md",
    contents: CONTEXT_PACKETS_README_CONTENT,
  },
  {
    id: "prompts-readme",
    relativePath: "prompts/README.md",
    contents: PROMPTS_README_CONTENT,
  },
  {
    id: "project-manager-prompt",
    relativePath: "prompts/project-manager.md",
    contents: PROJECT_MANAGER_PROMPT_CONTENT,
  },
  {
    id: "qa-tester-prompt",
    relativePath: "prompts/qa-tester.md",
    contents: QA_TESTER_PROMPT_CONTENT,
  },
  {
    id: "project-manager-agent",
    relativePath: "agents/project-manager.yaml",
    contents: PROJECT_MANAGER_AGENT_CONTENT,
  },
  {
    id: "qa-tester-agent",
    relativePath: "agents/qa-tester.yaml",
    contents: QA_TESTER_AGENT_CONTENT,
  },
  {
    id: "tasks-readme",
    relativePath: "tasks/README.md",
    contents: TASKS_README_CONTENT,
  },
  {
    id: "notes-readme",
    relativePath: "notes/README.md",
    contents: "# Notes\n\n",
  },
];

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
  await syncSeedFiles(cwd, input.group.displayName);
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

async function syncSeedFiles(cwd: string, displayName: string): Promise<void> {
  const state = await readSeedState(cwd);
  const seeded = new Set(state.seeded);
  for (const seed of PROJECT_SEED_FILES) {
    if (seeded.has(seed.id) && !(await fileExists(path.join(cwd, seed.relativePath)))) {
      continue;
    }
    const contents =
      seed.relativePath === PROJECT_NOTES_FILENAME ? `# ${displayName}\n\n` : seed.contents;
    await writeFileIfMissing(path.join(cwd, seed.relativePath), contents);
    seeded.add(seed.id);
  }
  await writeSeedState(cwd, { schemaVersion: PROJECT_SEED_STATE_VERSION, seeded: [...seeded] });
}

async function readSeedState(cwd: string): Promise<ProjectSeedState> {
  try {
    const parsed = JSON.parse(
      await fs.readFile(path.join(cwd, PROJECT_SEED_STATE_FILENAME), "utf8"),
    ) as Partial<ProjectSeedState>;
    return {
      schemaVersion: PROJECT_SEED_STATE_VERSION,
      seeded: Array.isArray(parsed.seeded)
        ? parsed.seeded.filter((entry): entry is string => typeof entry === "string")
        : [],
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { schemaVersion: PROJECT_SEED_STATE_VERSION, seeded: [] };
    }
    throw error;
  }
}

async function writeSeedState(cwd: string, state: ProjectSeedState): Promise<void> {
  await writeFileAtomic(
    path.join(cwd, PROJECT_SEED_STATE_FILENAME),
    JSON.stringify(state, null, 2),
  );
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath, constants.F_OK);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }
    throw error;
  }
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
