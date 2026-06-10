---
name: paseo-notion-tasks
description: Use when working with Notion-backed Paseo Project Tasks, importing Notion task pages into local Markdown tasks, preserving Notion provenance, auditing mirrored task links, or deciding whether to update Notion or Paseo. Applies to Codex, Claude, Gemini, OpenCode, Copilot, and other agents using Paseo skills.
---

# Paseo Notion Tasks

Use this skill when a task starts in Notion or when a local Paseo Project Task has a Notion source.

Read the `paseo-task` skill first. This skill only covers the Notion boundary; the normal Project
resolution, duplicate checks, task creation, and task update rules still come from `paseo-task`.

## Source of truth

Paseo's local Markdown task is authoritative for agent execution. Notion is provenance and a mirror
surface unless the user explicitly asks you to work only in Notion.

Rules:

- Import from Notion into Paseo before launching or briefing an agent from a task.
- Preserve Notion provenance in task `sources[]` with `kind: notion`.
- Do not update Notion and the local Paseo task for the same semantic change in one step unless the
  user explicitly requests a mirror/export operation.
- If there is a conflict, prefer the local Paseo task for execution state and ask before overwriting
  Notion.
- Keep Notion URLs in `links[]` as well as `sources[]` so humans can jump back to the original page.

## Preferred workflow

1. Resolve the target Paseo Project using `paseo-task`.
2. List local Project Tasks before importing to avoid duplicates.
3. Fetch or inspect the Notion task/page using whatever Notion access the current agent has.
4. Convert the Notion row/page into `import_notion_project_task` input.
5. Call the Paseo MCP tool `import_notion_project_task` when available.
6. If the tool is unavailable, create a local task using `create_project_task` with equivalent fields
   and a `sources[]` entry.
7. Tell the user which local task was created or updated and include the Notion source URL.

## MCP tool

Prefer this tool:

```text
import_notion_project_task
```

Important input fields:

```json
{
  "projectGroupId": "grp_...",
  "task": "Build local task import",
  "actionState": "Review",
  "doDate": "2026-06-10",
  "recurrence": ["rec-weekly-mon"],
  "priority": "Now",
  "attention": "Full",
  "people": ["J"],
  "location": "Desktop-CPU",
  "type": "coding",
  "agents": ["Codex"],
  "url": "https://www.notion.so/...",
  "pageId": "48bd...",
  "dataSourceId": "5b7d...",
  "body": "Optional Markdown notes from the Notion page"
}
```

The tool writes a normal Project Task and records Notion in `sources[]`.

## Field mapping

| Notion                     | Paseo task                                   |
| -------------------------- | -------------------------------------------- |
| `Task`                     | `title` / `task`                             |
| `Status` or `Action State` | `actionState`                                |
| `Project`                  | `projectGroupId` via explicit import mapping |
| `DoDate`                   | `doDate`                                     |
| `Recurrence`               | `recurrence`                                 |
| `Priority`                 | `priority`                                   |
| `Attention`                | `attention`                                  |
| `People`                   | `people`                                     |
| `Location`                 | `context` / `location`                       |
| `Type`                     | `type`                                       |
| `Agents`                   | `provider` selection hint                    |
| page URL/id                | `sources[]` and `links[]`                    |

Known value normalization:

- `Review`, `Info`, `Idea`, `Needs J Decision` -> `actionState: info`
- `Park`, `Schedule`, `Someday` -> `actionState: someday`
- `Waiting`, `On Hold`, `Hold` -> `actionState: waiting`
- `Drop`, `Dropped` -> `actionState: dropped`
- `Done`, `Drop/Done`, `Complete` -> `actionState: done`
- `Now` -> `priority: high`
- `rec-weekly-mon`, `rec-weekly-wed` -> weekly recurrence weekdays
- `rec-2w`, `Recurring-Relative-6M` -> relative recurrence

## Bundled scripts

Use these scripts from this skill folder when a deterministic conversion or audit is useful.

Convert a Notion page JSON or flattened snapshot into MCP input:

```bash
node .agents/skills/paseo-notion-tasks/scripts/notion-task-input.mjs \
  --project-group-id grp_... \
  --file /path/to/notion-page.json
```

Audit local Project Tasks that carry Notion provenance:

```bash
node .agents/skills/paseo-notion-tasks/scripts/list-notion-task-sources.mjs \
  --project-group-id grp_...
```

Both scripts are dependency-free and output JSON.

## File fallback

If MCP tools are unavailable, follow `paseo-task` file fallback and include this frontmatter shape:

```yaml
sources:
  - kind: notion
    pageId: 48bd6c20dc71830989910173d2c5d6d5
    url: https://www.notion.so/rfarm/48bd6c20dc71830989910173d2c5d6d5
    dataSourceId: 5b7d6c20-dc71-822b-97d8-87d06bbc3520
    database: tasks
    importedAt: 2026-06-10T13:00:00.000Z
    lastMirroredAt: null
```

Do not hand-edit YAML if a Paseo MCP/RPC task tool is available.
