---
name: paseo-task
description: Use when planning or tracking Paseo Project work, creating or updating tasks, converting chat decisions into Project Tasks, marking tasks done, or deciding whether work belongs in docs or tasks. Helps agents keep a visible human/agent backlog in Paseo.
---

# Paseo task

Project Tasks are the executable backlog for humans and agents. If work should survive the current message, create or update a Task instead of leaving it only in chat.

## When to use tasks

Create or update a task when:

- the user mentions a new feature, bug, cleanup, decision follow-up, or open question
- you identify work while implementing or reviewing
- a plan has more than one durable step
- you finish a tracked item and need to mark it done

Use docs for durable product model, architecture, conventions, and decisions. Use tasks for "what needs doing next."

## Preferred workflow

1. Resolve the Project.
   - Prefer explicit `projectGroupId` from UI/context.
   - Otherwise match the current repo/root to `$PASEO_HOME/projects/*/project.json` child `rootPath`.
   - If still unclear, ask once before creating tasks.
2. List existing tasks for that Project before creating duplicates.
3. Create tasks as soon as durable work is identified.
4. Keep task titles imperative and scannable.
5. Put acceptance criteria, links, and agent handoff notes in the Markdown body.
6. Mark a task `done` only after the work is actually complete.

## RPC names

When available, use Paseo MCP tools rather than editing files directly:

- `list_project_tasks`
- `create_project_task`
- `update_project_task`

If you are writing client/server code directly, the WebSocket RPC names are:

- `task.list.request`
- `tasks.query.request`
- `task.get.request`
- `task.create.request`
- `task.update.request`
- `task.move.request`
- `task.delete.request`
- `task.timer.start.request`
- `task.timer.stop.request`
- `task.views.get.request`
- `task.views.update.request`

If only the client wrapper is available, the matching methods are `taskList`, `taskQuery`, `taskGet`, `taskCreate`, `taskUpdate`, `taskMove`, `taskDelete`, `taskTimerStart`, `taskTimerStop`, `taskViewsGet`, and `taskViewsUpdate`.

## File fallback

If no RPC/client path is available and you have local filesystem access, tasks are Markdown files:

```text
$PASEO_HOME/projects/<groupId>/tasks/<id>.md
```

Use YAML frontmatter matching `packages/protocol/src/task/types.ts`. Minimum practical fields:

```yaml
---
id: 2026-06-10-short-slug
projectGroupId: grp_...
title: Short imperative title
run: agent
priority: medium
type: coding
people: []
context: desktop
attention: medium
doDate: 2026-06-10
recurrence: null
remind: []
timerStartedAt: null
trackedSeconds: 0
timeEntries: []
provider: null
links: []
github: null
createdAt: 2026-06-10T00:00:00.000Z
updatedAt: 2026-06-10T00:00:00.000Z
agentId: null
worktree: null
lastRunAt: null
result: null
lastCompletedAt: null
completions: []
actionState: todo
---
```

Use `actionState: done`, `lastCompletedAt`, and `completions` only when complete. Do not duplicate YAML keys.

## Task quality

- `run: agent` for work that can be delegated; `run: self` for owner/manual work.
- `priority: high` only for active blockers or next critical work.
- `doDate` should be set when the user expects the item to appear in Today.
- Link relevant source files, docs, URLs, issues, or notes.
- Keep bodies concrete enough that a future agent can start without reading the whole chat.

## Final response rule

When you create or update tasks, say which task titles changed and where they live. Do not paste full task files unless asked.
