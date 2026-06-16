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
const PROJECT_ROADMAP_FILENAME = "roadmap.md";
const PROJECT_SEED_STATE_FILENAME = ".paseo-seeds.json";
const PROJECT_SEED_STATE_VERSION = 1;
const AGENTS_README_CONTENT = `# Agent Profiles

Project agent profiles are durable, syncable definitions for reusable agent roles.
Runtime agent sessions still live under $PASEO_HOME/agents and are not stored here.

A profile describes who should work, with which prompt, provider/model preferences, tools, and
Folder grants. It is not a running agent. Launching a profile should create a context packet and a
runtime agent record that point back to this durable file.

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

Use packets to answer: what was the agent asked to do, which Project files shaped the run, which
external Folders were granted, which provider/model ran it, and what evidence should prove it is
done?

\`\`\`yaml
schemaVersion: 1
id: 2026-06-09-example-run
projectGroupId: grp_example
profile: agents/implementation-agent.yaml
prompt: prompts/implementation.md
goal: goals/2026-06-09-example-goal.md
thread: threads/2026-06-09-example-thread.md
task: tasks/2026-06-09-example-task.md
notes:
  - notes/architecture.md
decisions:
  - decisions/2026-06-09-example-decision.md
evidence:
  - evidence/2026-06-09-example-check.md
memory:
  - memory/qa-tester.md
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

Project-owned context is portable. External Folders and runtime Workspaces are referenced by a
packet; they are not copied into this directory.
`;
const PROMPTS_README_CONTENT = `# Prompts

Reusable Project prompts live here as plain Markdown. Agent profiles and context packets can
reference these files with Project-root-relative paths such as \`prompts/implementation.md\`.

Prompts should describe durable role or workflow intent. Provider-specific mechanics, live
transcripts, and one-off runtime state belong in agent records or context packets, not in reusable
prompt files.
`;
const PROJECT_MANAGER_PROMPT_CONTENT = `# Project Manager

You are the Project manager for this Paseo Project. Keep the local Project files useful for both
the human and future agents.

Responsibilities:
- Keep durable objectives in \`goals/\` and connect them to threads, tasks, decisions, and evidence.
- Keep work trails in \`threads/\` when a goal, task, team review, handoff, or decision needs history.
- Keep active work in \`tasks/\` as Markdown-backed Project Tasks.
- Keep product direction in \`roadmap.md\` and durable decisions in \`notes/decisions.md\`.
- Use \`workflows/\` for repeatable operating paths such as intake, QA, release, or field work.
- Keep compact durable context and reference material in \`notes/\`.
- Use \`decisions/\` and \`evidence/\` when records need first-class links to goals, threads, tasks,
  or agent runs.
- Use \`context/packets/\` to explain what was handed to an agent run.
- Treat \`prompts/\` and \`agents/\` as the Project's reusable instruction and team roster files.
- Keep role-specific learned behavior in \`memory/\` as exploration or exploitation entries.
- Keep external Folders explicit. They are referenced capabilities, not Project-owned files.
- Prefer local Project files as the execution source of truth. External tools such as Notion can be
  provenance or mirror surfaces, but they are not required to run the Project.

Before launching or briefing an agent, identify the task, relevant notes/files, browser state if
available, explicit Folder grants, provider/model/mode, and any Paseo skill or tool workflow the
agent should use. After an agent finishes, update the task and add or revise notes only when they
preserve durable context.
`;
const ROADMAP_CONTENT = `# Roadmap

Use this file for durable Project direction: outcomes, milestones, risks, and sequencing.

Keep execution details in \`tasks/\`. Keep decisions in \`notes/decisions.md\`. Link tasks back here
when they advance a roadmap item.

## Now

- Define the next concrete outcome.

## Next

- Capture the next useful improvement after the current outcome is stable.

## Later

- Park ideas that should not distract from active work.
`;
const WORKFLOWS_README_CONTENT = `# Workflows

Workflows are repeatable Project operating paths. Use them when the Project needs a consistent way
to move from request to decision, task, agent launch, verification, and follow-up.

Good workflow files answer:

- When should this workflow run?
- Which Project Task, note, profile, prompt, context packet, and Folder grants does it need?
- Which agent roles should participate?
- What proves the workflow is done?

Keep workflows provider-neutral. A coding Project, finance Project, infrastructure Project,
document Project, or research Project should all be able to define its own roles and evidence.
`;
const INTAKE_WORKFLOW_CONTENT = `# Intake Workflow

Use this workflow when the human reports a bug, feature, product concern, or operational friction.

1. Validate whether the report is real enough to act on.
2. Classify the work as bug, product decision, docs/process, implementation, QA, or task.
3. Choose the smallest operating lane that preserves quality.
4. Create or update a Project Task with acceptance criteria.
5. Decide which profile or role should execute, review, or verify the work.
6. Create a context packet when launching an agent.
7. Record evidence and follow-up tasks when the work completes.
`;
const MIGRATE_AGENT_WORKSPACE_WORKFLOW_CONTENT = `# Migrate Agent Workspace

Use this workflow when converting an existing standalone agent folder into a Paseo Project.

1. Create or select the Project that names the domain, not the old folder path.
2. Add the existing folder as an external Project Folder. Do not copy it wholesale into this
   managed Project directory.
3. Inventory the old folder's durable files: identity, workflow, tools, memory, reference data,
   scripts, templates, tests, and historical notes.
4. Promote only durable coordination content into Project files:
   - durable objectives -> \`goals/*.md\`
   - sequencing and milestones -> \`roadmap.md\`
   - work trails or handoffs -> \`threads/*.md\`
   - decisions and cadence rules -> \`notes/decisions.md\`
   - first-class decisions -> \`decisions/*.md\`
   - evidence records -> \`evidence/*\`
   - role-specific learned behavior -> \`memory/*\`
   - repeatable procedures -> \`workflows/*.md\`
   - executable follow-ups -> \`tasks/*.md\`
   - reusable roles -> \`agents/*.yaml\`
   - reusable instructions -> \`prompts/*.md\`
5. Keep live scripts, templates, large reference data, and history in the external Folder until the
   human intentionally moves them.
6. Create a context packet for the first Project-run agent that names the task, profile, prompt,
   promoted notes, external Folder grants, and expected evidence.
7. Verify the migrated Project by launching or drafting one agent from the Project surface and
   confirming it sees the Project files plus the granted external Folder.

The goal is continuity, not cleanup theater. The old workspace remains useful while the Project
becomes the durable control plane for future work.
`;
const DECISIONS_NOTE_CONTENT = `# Decisions

Record durable Project decisions here. Keep entries short and link to tasks, notes, context packets,
commits, external docs, or agent runs when useful.

## Template

### YYYY-MM-DD Decision title

- Decision:
- Reason:
- Consequences:
- Follow-up:
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
goalId: 2026-06-08-example-goal
threadId: 2026-06-08-example-thread
createdAt: 2026-06-08T00:00:00.000Z
updatedAt: 2026-06-08T00:00:00.000Z
---

Notes, context, and acceptance criteria.
\`\`\`
`;
const GOALS_README_CONTENT = `# Goals

Goals are durable Project objectives. Use them for outcomes that may span several threads, tasks,
agent runs, decisions, and evidence records.

Project Goals supplement provider-native session goals such as Codex \`/goal\`; they do not replace
or override provider commands. A provider session goal is runtime state. A Project Goal is local
Project truth that survives across providers and hosts.

\`\`\`markdown
---
id: 2026-06-16-example-goal
projectGroupId: grp_example
title: Example goal
status: active
priority: high
ownerRole: product-owner
linkedThreads: []
linkedTasks: []
linkedDecisions: []
linkedEvidence: []
createdAt: 2026-06-16T00:00:00.000Z
updatedAt: 2026-06-16T00:00:00.000Z
closedAt: null
---

## Objective

## Scope

## Success Criteria

## Current State

## Open Questions

## Evidence

## Decisions

## Next Threads
\`\`\`
`;
const THREADS_README_CONTENT = `# Threads

Threads are durable work trails around a Goal, Task, agent run, team review, handoff, or decision.
They are not just raw chat transcripts. Keep the useful trail: intake, participants, context,
turning points, linked runs, decisions, evidence, and follow-up tasks.

\`\`\`markdown
---
id: 2026-06-16-example-thread
projectGroupId: grp_example
goalId: 2026-06-16-example-goal
title: Example thread
type: product-review
status: active
participants:
  - user
  - product-owner
  - ux-engineer
linkedTasks: []
linkedAgentRuns: []
linkedDecisions: []
linkedEvidence: []
createdAt: 2026-06-16T00:00:00.000Z
updatedAt: 2026-06-16T00:00:00.000Z
---

## Purpose

## Context

## Timeline

## Decisions

## Evidence

## Follow-up
\`\`\`
`;
const MEMORY_README_CONTENT = `# Role Memory

Role memory captures learned operating behavior for this Project. Keep memory role-specific so the
Product Owner, UX Engineer, Developer Lead, QA Engineer, and domain roles can improve without
collapsing into one generic agent.

Use two pools:

- \`exploration\`: candidate behavior being tried for an unfamiliar context.
- \`exploitation\`: behavior promoted by evidence from successful Project work.

Promotion rule:

\`\`\`text
exploration -> exploitation only after evidence
exploitation -> retired when contradicted by evidence
\`\`\`

Memory can advise future launches, but it does not silently override user instructions, Project
docs, provider-native files, or Folder instruction files.
`;
const EVIDENCE_README_CONTENT = `# Evidence

Evidence records what proved a Goal, Thread, Task, agent run, or decision. Use this directory for
command outputs, screenshots, endpoint checks, commit references, artifacts, user feedback, and
other reviewable proof.

Prefer short Markdown summaries that link to durable artifacts rather than pasting large logs.
`;
const DECISIONS_README_CONTENT = `# Decisions

Project decisions can live here as one file per decision when they need stronger linking than
\`notes/decisions.md\`. Use \`notes/decisions.md\` for a compact running log and this directory for
decisions that need linked Goals, Threads, Tasks, or Evidence.
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
    id: "project-roadmap",
    relativePath: PROJECT_ROADMAP_FILENAME,
    contents: ROADMAP_CONTENT,
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
    id: "goals-readme",
    relativePath: "goals/README.md",
    contents: GOALS_README_CONTENT,
  },
  {
    id: "threads-readme",
    relativePath: "threads/README.md",
    contents: THREADS_README_CONTENT,
  },
  {
    id: "memory-readme",
    relativePath: "memory/README.md",
    contents: MEMORY_README_CONTENT,
  },
  {
    id: "evidence-readme",
    relativePath: "evidence/README.md",
    contents: EVIDENCE_README_CONTENT,
  },
  {
    id: "decisions-readme",
    relativePath: "decisions/README.md",
    contents: DECISIONS_README_CONTENT,
  },
  {
    id: "workflows-readme",
    relativePath: "workflows/README.md",
    contents: WORKFLOWS_README_CONTENT,
  },
  {
    id: "intake-workflow",
    relativePath: "workflows/intake.md",
    contents: INTAKE_WORKFLOW_CONTENT,
  },
  {
    id: "migrate-agent-workspace-workflow",
    relativePath: "workflows/migrate-agent-workspace.md",
    contents: MIGRATE_AGENT_WORKSPACE_WORKFLOW_CONTENT,
  },
  {
    id: "notes-readme",
    relativePath: "notes/README.md",
    contents: "# Notes\n\n",
  },
  {
    id: "decisions-note",
    relativePath: "notes/decisions.md",
    contents: DECISIONS_NOTE_CONTENT,
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
  await fs.mkdir(path.join(cwd, "goals"), { recursive: true });
  await fs.mkdir(path.join(cwd, "threads"), { recursive: true });
  await fs.mkdir(path.join(cwd, "memory"), { recursive: true });
  await fs.mkdir(path.join(cwd, "evidence"), { recursive: true });
  await fs.mkdir(path.join(cwd, "decisions"), { recursive: true });
  await fs.mkdir(path.join(cwd, "notes"), { recursive: true });
  await fs.mkdir(path.join(cwd, "workflows"), { recursive: true });
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
