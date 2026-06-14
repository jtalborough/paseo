# Projects

A Project is a user-authored domain container above external Folders and their Workspaces:

```
Project -> Folder -> Workspace
```

Projects are keyed by their stable `grp_` id. Tasks, notes, Project-level agents, and future
domain content key to that id, never to a Folder's legacy `projectId`.

Projects are the durable unit of work in Paseo. A Project may be a software product, GitOps
repository, homelab operations area, financial workflow, content site, document toolkit, physical
device system, research folder, or business process. The same primitives apply across all of them:
tasks, notes, prompts, agent profiles, context packets, referenced folders, runtime agents, and
audit history.

Paseo should avoid encoding "software repository" assumptions into Project-level behavior. Some
Projects have git worktrees and pull requests; others have Notion tasks, Kubernetes clusters,
Tailscale hosts, Word documents, slide decks, MCP services, financial order gates, or physical
hardware. Project surfaces should ask what work is being coordinated, what tools are granted, and
what evidence proves completion.

## Project organization contract

Project organization has three separate ownership layers:

- Project-owned files live in the managed Project directory. They are portable, syncable, and
  durable: tasks, notes, prompts, agent profiles, context packets, bookmarks, and future Project
  knowledge files.
- Referenced Folders live outside the Project directory. They may be local or remote directories,
  git repositories, document toolkits, infrastructure repos, or service workspaces. The Project can
  grant agents access to them, but does not own or delete them.
- Runtime state lives in daemon infrastructure. Agents, terminals, provider session handles,
  indexes, timelines, and live Workspaces are execution artifacts that should be traceable back to
  Project files, but not stored as Project-owned source.

Every Project agent launch should be explainable as:

```
Project + Task + Profile + Prompt + Context Packet + Folder grants + Provider/Model/Mode + Runtime Agent
```

No provider transcript, terminal tab, git checkout, or remote directory is allowed to become the
only source of truth for the work. If something matters after the run, it belongs in a Project Task,
note, prompt, profile, context packet, or audit record.

## Project directory

Every Project has a Paseo-managed working directory:

```
$PASEO_HOME/projects/{groupId}/
├── project.json
├── project.md
├── agents/
│   ├── README.md
│   ├── project-manager.yaml
│   └── qa-tester.yaml
├── context/
│   ├── README.md
│   └── packets/
│       └── README.md
├── notes/
│   └── README.md
├── prompts/
│   ├── README.md
│   ├── project-manager.md
│   └── qa-tester.md
└── tasks/
    └── README.md
```

This directory is the Project's portable unit and the `cwd` for Project-level agents. Files in it
are ordinary files, with notes and tasks stored as Markdown. Users can sync the directory with
folder-sync tools such as Nextcloud without requiring a Paseo cloud service.

`project.json` is the contained manifest. It includes Project metadata and references to external
child Folders. The daemon's `groups.json` remains an index for fast lookup; it is not the portable
Project content.

## Workspace layout

Paseo has two workspace scopes:

- Global: Tasks, Projects, schedules, files, knowledge, agents, and browser activity across every
  Project and ungrouped Folder.
- Project: the same surfaces filtered to one Project, plus that Project's owned files and external
  Folder references.

Project-scoped surfaces key to `groupId`. Do not key Project tasks, schedules, notes, bookmarks, or
knowledge to a legacy Folder `projectId`.

Project Tasks are structured Markdown documents under `tasks/`. Each Task is one Markdown file with
queryable YAML frontmatter and a free-form Markdown body. The file is authoritative; the UI and
derived global views must not maintain a separate task database that can drift from synced Project
content. Task frontmatter keys ownership explicitly with `projectGroupId`.
Project Notes follows the same rule for `notes/`.

Project Tasks are the working backlog for both humans and agents. Use them for active execution
plans, cleanup checklists, bug follow-ups, and agent-ready work items. Use docs for durable product
model, architecture, conventions, and decisions that should outlive a specific task. A planning
conversation can update both, but the executable "what do we do next?" list should live in tasks so
it is visible in the app and can later launch or brief agents directly.

## Project beta feedback

Every Sidebar Project is a beta test of Paseo's workstation model. The goal is not to create
synthetic test projects; the goal is to learn from real work across the user's actual Projects.

When a Project is used through Paseo, the team should be able to review:

- What work was attempted and which Project Task, prompt, profile, or ad-hoc instruction started it.
- Which context packet, files, browser state, notes, service URLs, and folder grants were handed to
  the agent.
- Which provider/model/mode ran the work and whether the model saw the intended Project guidance.
- Where the user had to compensate manually: missing context, wrong cwd, rejected tool call, unclear
  permission, lost terminal relationship, weak result evidence, or missing navigation back to the
  Project.
- What follow-up task would make the next Project run smoother.

The Product Owner, UX Engineer, Developer Lead, and QA Engineer roles should periodically review
recent Project usage and convert friction into durable Project Tasks. Product focuses on the
mandate and prioritization, UX on clarity and trust, Developer Lead on implementation slices and
architecture risk, and QA on observable evidence. This review loop is part of product development,
not a separate research exercise.

Task timers are mutually exclusive across active Projects. The daemon owns start/stop operations so
multiple clients cannot leave competing timers running. Each Task records append-only
`timeEntries` intervals in its Markdown frontmatter; daily totals and Project timesheets are derived
from those intervals. `timerStartedAt` and `trackedSeconds` remain compatibility summaries, not the
timesheet source of truth.

External project systems, starting with Notion, are provenance and mirror surfaces for active
Project Tasks. A task may carry `sources[]` frontmatter entries such as a Notion page URL, page id,
data source id, and last mirrored timestamp, but the Markdown task file remains authoritative for
agent execution. Importers can seed tasks from Notion, and exporters can mirror status, time totals,
and run summaries back to Notion, but agents launch from the local task plus a local context packet.
Do not make a Notion database the runtime dependency for creating, resuming, or auditing an agent
run.

Use this initial Notion mapping:

| Notion                            | Paseo Task                                               |
| --------------------------------- | -------------------------------------------------------- |
| TasksDB `Task`                    | `title`                                                  |
| TasksDB `Status` / `Action State` | `actionState`                                            |
| TasksDB `Project`                 | `projectGroupId` via explicit import mapping             |
| TasksDB `DoDate`                  | `doDate`                                                 |
| TasksDB `Recurrence`              | structured `recurrence`                                  |
| TasksDB `Priority`                | `priority`                                               |
| TasksDB `Attention`               | `attention`                                              |
| TasksDB `People`                  | `people`                                                 |
| TasksDB `Location`                | `context`                                                |
| TasksDB `Type`                    | `type`                                                   |
| TasksDB `Agents`                  | `provider` or future agent profile selection             |
| TasksDB page URL/id               | `sources[]` entry with `kind: notion`                    |
| TimeTracking rows                 | append-only `timeEntries`                                |
| ProjectsDB review fields          | Project metadata or review notes, not task runtime state |

Agents that can read Notion can seed the local backlog through the `import_notion_project_task` MCP
tool. That tool accepts a Notion task/page snapshot and writes a normal Markdown Project Task with
`sources[]` provenance. Keep it one-way until a dedicated mirror/export flow exists; do not let an
agent update both Notion and the local task for the same semantic change in one step.

Global Task views are definitions over the cross-Project Task query. Built-in Today, Inbox, and All
views live in the Task view registry; add future views as definitions instead of branching the
Tasks screen for each new view. Custom global definitions persist in `$PASEO_HOME/task-views.json`
and are available through the Task views RPCs, so an editor UI can be added later without changing
the storage or query model.

Keep owned Project Files distinct from Project Folders:

- Project Files are ordinary files inside the Project directory. They are portable and syncable with
  the Project.
- Project Folders are external directories the Project references. They can expose their
  subdirectories through Folder-aware tools, but they are not owned by the Project directory.

Global "All Files" is an aggregate/search surface over Project Files and explicit Folder files. It
should not become one giant tree that implies every referenced Folder is contained inside Paseo.

## Agent context

A Project is also the durable context shared by its agents and chats. Paseo combines two
complementary ways for an agent to use that context:

- Live tools operate on the current filesystem and running environment. Project-level agents start
  in the Project directory and receive explicit tools for referenced Folders.
- Local retrieval searches Project knowledge, notes, tasks, bookmarks, and other durable content to
  find relevant context quickly.

These are not interchangeable. Retrieval is a discovery aid, not an authoritative copy of live
files. Before an agent acts on a live file, it must read the current file through a filesystem tool.
Retrieved results should identify their source and freshness so the agent and user can distinguish
current content from an imported or stale snapshot.

Agents belong to a Project through `groupId`, independently of their `cwd`. A Project-level agent's
`cwd` is the managed Project directory. A Folder or Workspace agent can run inside an external child
directory while still appearing in the Project's agent surface.

Project-level agents do not create a synthetic Folder or Workspace for the managed Project
directory. Agent placement must support a Project directly instead of inferring all ownership from
`cwd`.

Launching an agent from a Project-level surface starts in the managed Project directory when the
host exposes one. Launching inside a referenced Folder or Workspace is a separate, explicit user
choice. Folder access for Project-level agents is represented as Folder grants in the context
packet, not by silently choosing a child Folder as the launch cwd.

The Project directory contains durable, user-owned context that should sync between hosts: agent
definitions, instructions, notes, task definitions, knowledge sources, bookmarks, and schedule
definitions. Runtime process state, provider session handles, generated indexes, and active-agent
timelines remain daemon infrastructure. Derived indexes must be rebuildable from the Project's
portable content.

Durable agent context is split into explicit files:

- `prompts/`: reusable Markdown instructions for a Project, team, role, or workflow.
- `agents/`: reusable agent profile definitions. A profile can point at prompts and declare default
  provider, model, tool grants, folder grants, and launch preferences, but it is not a live session.
- `context/packets/`: explicit launch bundles for a specific run. A packet records which prompt,
  task, notes, bookmarks, files, browser state, and Folder grants were selected.

Skills are workflow affordances layered on top of this Project model:

- Global/user skills are installed outside the Project and may appear differently by provider.
- Project skills, when supported, should be ordinary Project files and referenced from profiles or
  packets the same way prompts are.
- Provider-native skills or commands are useful execution shortcuts, but they are not the durable
  Project contract.
- A launch should record which skill or workflow capability was intentionally used when it changes
  the work path, permissions, or expected evidence.

Agent-facing guidance must therefore be redundant on purpose. A Project agent should receive the
Project model in provider-neutral runtime instructions, should see Paseo MCP tools when the provider
supports them, and may also see Paseo skills when that provider exposes a skill system. Skills make
the workflow easier; the model must still work when a provider exposes only tool names and runtime
instructions.

New Projects seed `prompts/project-manager.md`, `agents/project-manager.yaml`,
`prompts/qa-tester.md`, and `agents/qa-tester.yaml`. These files are ordinary user-owned Project
files, not hidden defaults. The Project manager role exists to keep `tasks/`, `notes/`, and
`context/packets/` coherent and to make agent launches explainable from local files. The QA Tester
role exists to turn recent work into concrete checks, verify user-visible behavior, and report
blockers without quietly switching into implementation. Sync never overwrites user edits to those
files.

The daemon also writes `.paseo-seeds.json` to remember which starter files have already been
materialized. Missing starter files are created once, so upgraded Projects can receive new defaults,
but a user-deleted starter file is not recreated on later syncs.

The Project Agents surface manages `agents/*.yaml` profile files through
`project.agent.profiles.*` RPCs. The daemon validates each profile with the shared
`ProjectAgentProfileSchema`, normalizes missing nullable/default fields on read/write, and stores
edits back as YAML. Deleting a profile only removes that durable definition; existing runtime agent
sessions under `$PASEO_HOME/agents/` are not changed. When a profile has a provider, the UI can use
it to open a draft Project agent with that provider and model preselected.

Using an agent profile creates a context packet through `project.context.packets.create.*`. The
packet records the profile path, prompt path, provider, model, default tools, Folder grants, and a
launch reason such as `Use profile: QA Tester`. The Project Context tab surfaces that packet path
and metadata so the user can audit profile-based launches without opening YAML manually.

Within these durable files, references use Project-root-relative POSIX paths such as
`prompts/implementation.md`, `agents/planner.yaml`, and `tasks/2026-06-09-task.md`. They are not
filesystem-absolute paths and they are not relative to the YAML file's own folder. That keeps the
Project directory portable across hosts and sync tools.

Context packets are the bridge between chat-style Project knowledge and coding-agent execution. They
are concrete and reviewable: an agent launch should be explainable by pointing to the packet and the
live tools it was granted. Retrieval can help assemble a packet, but the packet remains the durable
record of what was intentionally handed to the agent.

For non-code work, context packets are still the handoff record. A packet may point at runbooks,
Notion-derived tasks, service URLs, browser state, spreadsheets, documents, diagrams, device notes,
or external Folders instead of source files. The invariant is not "what code did the agent edit?"
but "what context and authority did the agent receive, and what evidence did it produce?"

Runtime agents launched from reusable Project profiles carry labels that point back to the durable
context packet and profile path. Keep those labels in sync with profile launch flows so an agent
record under `$PASEO_HOME/agents/` can be traced back to the prompt, profile, tools, and Folder
grants shown in the Project Context tab.

Agent profiles are the Project's team roster. Product work may use Product Owner, UX Engineer,
Developer Lead, and QA Engineer. Infrastructure work may use Cloudflare Maintainer, NAS Maintainer,
or Security Reviewer. Finance work may use Researcher, Risk Reviewer, and Trade Reconciler. Content
work may use Editor, Designer, Publisher, and QA. These roles are Project-authored files with
explicit prompts and tool grants, not hardcoded personas.

Agents can use `create_project_context_packet` to write that durable launch bundle and
`list_project_context_packets` to audit prior bundles. A packet belongs under
`context/packets/*.yaml`, references other Project files with Project-root-relative paths, and may
record the creating agent, launched agent, and launch reason.

Project-attached agents receive daemon-injected guidance for the core Project workflow. Keep that
guidance provider-neutral: mention the Project task and context-packet MCP operations by semantic
name, point at `prompts/*.md` and `agents/*.yaml` as durable user-authored files, and tell agents to
use visible tool names rather than assuming a provider-specific discovery tool exists. Skills are a
useful workflow layer, but the runtime prompt must still be actionable when a provider shows only the
skill list or does not expose full skill bodies.

The app exposes those same packets through the Project Context tab. Treat that tab as the human
audit trail for an agent launch: it should answer which task, prompt, files, browser state, and
Folder grants were handed to the run without requiring the user to inspect YAML manually.

## Folder boundary

Folders are external directories referenced by a Project. They are not copied or moved into the
Project directory.

Project-level agents start in the Project directory. Access to child Folders must be explicit
through Folder-aware tools or an explicit user selection. Never silently choose the first Folder
as a Project agent's `cwd`.

The client filesystem API accepts only active Workspace and managed Project directories, or an
explicit subdirectory inside one. This prevents arbitrary cwd browsing through file explorer,
editor, and download requests. It is a root-level client boundary, not a substitute for per-agent
Folder grants: Project-level agents still need explicit Folder-aware tools before they can act in
external child Folders.

## Archive semantics

Archiving a Project moves only its Paseo-managed Project directory under
`$PASEO_HOME/projects/archived/` and archives its index record. Child Folders and their Workspaces
remain untouched and become ungrouped.

The archived manifest retains its child Folder references for history.

## Current product backlog

This is the working backlog for the Project surface direction. Keep it current as the feature set
moves from prototype into stable product behavior.

### UI stabilization

- Agent panes should use the full available pane width while preserving readable message content
  where that improves scanning.
- Agent and linked Terminal tabs should keep a visible relationship: the agent exposes a linked
  terminal affordance, and the terminal title/metadata should identify the owning agent when known.
- Agent-created terminals should be created through the Paseo terminal MCP tool so they inherit the
  caller agent relationship and appear as linked terminals instead of anonymous shells.
- Add-tab actions for Agent, Terminal, Browser, Files, Tasks, and Notes should stay directly
  visible when there is enough room, and collapse into the overflow menu only when space is tight.
- Project and Workspace headers should keep the same structure and action placement, including
  Scripts, Open, Commit, tab actions, and split controls.
- Project Overview should stay lightweight once real work happens in Project tabs.

### Tasks

- Polish click-to-complete, active task state, and task navigation from timers.
- Polish recurring task creation flows beyond the existing presets, weekday selector, and next
  occurrence preview.
- Keep task files sync-friendly Markdown and avoid a separate drifting task database.
- Add GitHub Issues support for importing, linking, and eventually syncing issue state.
- Add saved custom task views and a view editor after the serializable view model is stable.
- Expand timesheets beyond daily Project/task summaries into export/mirror workflows and richer
  reporting ranges.

### Scheduled agent tasks

- Project Tasks can opt into daemon-owned schedule definitions that launch an agent from the task,
  selected prompt/profile, and context packet at the intended time. The schedule should reference the
  local task file and record run history back onto the task rather than becoming a separate drifting
  automation list.
- Scheduled runs need an execution ledger: task file, schedule id, intended run time, actual start
  time, context packet, provider/profile, Folder grants, result, summary, changed files, follow-up
  task links, and external mirror updates.
- Scheduled task runs now mirror into the task's `scheduledRuns` ledger with provider/model,
  launched agent id, result summary, and a Project context packet path. The daemon writes the packet
  when the scheduled run starts and updates it with the launched agent id when the run finishes.
- Add trust controls before unattended execution. Implemented controls include run now, pause, and
  schedule execution policy (`auto`, `plan_only`, `approval_before_edit`). Implemented failure
  controls include bounded retry policy with per-run attempt tracking and missed-run catch-up policy.
  Failed task run ledgers carry acknowledgment state so the Project Schedules tab can keep
  unacknowledged failures visible. Scheduled tasks also support dry-run execution mode for rehearsal
  without mutation. Remaining controls include broader failure notification routing.
- Keep scheduled work Project-scoped by default. Global schedule views should aggregate Project
  schedules, not own the schedule source of truth.

### Browser

- Treat Browser as its own epic. It needs bookmarks, credentials/OnePassword strategy, Project
  browser state, and agent-readable/agent-controllable browser context.
- Browser state should be selectable into Project context packets rather than implicitly handed to
  every agent.

### Agent context

- Polish durable Project prompts and agent profiles as ordinary files in the Project directory.
- Context packets should explicitly record selected tasks, notes, files, browser state, prompts,
  and Folder grants for each launch.
- Retrieval is for discovery; live filesystem tools remain authoritative before an agent acts on a
  current file.
- Project-level agents should start in the Project directory and receive explicit Folder tools for
  external child Folders.

### Stabilization

- Keep the current work split into reviewable chunks: Project surface, Tasks, linked terminals,
  tab model, and docs/skills.
- Run focused tests for changed files, then `npm run typecheck`, `npm run lint`, and
  `npm run format:check` before landing.
