---
name: paseo-agent-stewardship
description: Operating guide for creating, supervising, maintaining, handing off, and archiving Paseo agents across providers and models. Use when an agent needs to decide whether to create a Paseo agent or subagent, brief it, manage follow-ups, inspect or maintain running agents, apply provider preferences, or clean up agent/worktree state.
---

# Paseo Agent Stewardship

## Overview

Use this skill when Paseo agents are part of the work, not just when invoking a single tool. It is provider-agnostic and should work for Codex, Claude, Copilot, OpenCode, Pi, and any future provider exposed through Paseo.

First load the `paseo` skill and follow its current tool reference. This skill covers the operating model: when to create agents, how to brief them, how to supervise them, and how to clean up after them.

## Decide Whether To Create An Agent

Do not create another agent just because Paseo can. Create one when it changes the outcome:

- **Advisor**: second opinion, critique, architecture review, UX review, or QA read-only pass.
- **Implementer**: parallel work in a separate worktree or clearly isolated area.
- **Auditor/QA**: independent verification of a finished slice, especially UI or cross-package behavior.
- **Loop worker**: repeated check/fix cycles with a clear exit condition.
- **Detached handoff**: work the user should continue separately after your own task ends.

Do the work yourself when it is small, serial, tightly coupled to your current edits, or when a second agent would mostly duplicate context-gathering.

## Before Creating

1. Read `~/.paseo/orchestration-preferences.json` unless the user explicitly named the provider/model.
2. Pick the role category: `impl`, `ui`, `research`, `planning`, or `audit`.
3. Inspect the provider only when you need exact model IDs, modes, thinking options, or feature flags.
4. Decide the working directory:
   - Use the current `cwd` for read-only advisors or work that must happen in the active checkout.
   - Create a worktree for parallel repo edits or risky implementation work.
   - Never send an agent into a dirty shared checkout without making that tradeoff explicit in the prompt.
5. Decide ownership:
   - Omit `detached` or pass `detached: false` for subagents helping you finish the current task.
   - Pass `detached: true` only for handoffs or independent agents the user may continue later.
6. Leave `notifyOnFinish` enabled unless the agent is truly fire-and-forget.

## Creation Prompt Checklist

Every new agent prompt should be self-contained. Include:

- Objective and exit condition.
- Exact repo path or worktree path.
- Relevant files, tasks, screenshots, IDs, or prior conclusions.
- Constraints from the user and repo, including no daemon restart and no full test suite when applicable.
- Expected deliverable: patch, review findings, plan, QA report, or handoff note.
- Verification expectations: targeted tests, lint/typecheck, screenshots, or manual checks.
- Cleanup expectation: archive self/worktree only if that is intended.

Minimal shape:

```text
Goal: ...
Context: ...
Constraints: ...
Work location: ...
Please do: ...
Please do not: ...
Exit when: ...
Report back with: ...
```

## Supervising Agents

- Track the agents you create. You are responsible for integrating their output.
- Do not poll a notify-on-finish agent. Continue useful work and wait for the notification.
- Send follow-up prompts as deltas: what changed, what is blocked, or what to verify next.
- Treat subagent results as evidence, not truth. Inspect code, logs, or screenshots before relying on them.
- If an agent is blocked, either unblock it with precise instructions or archive it if the work is obsolete.
- If the user asks "where are we", summarize active agents by purpose, status, and next decision.

## Receiving Results

When an agent finishes:

1. Read the result and identify concrete changes, claims, and open risks.
2. Inspect any files it changed before reporting them as complete.
3. Run only targeted verification needed for the work. Do not rerun a suite another agent already reported green unless there is a reason to distrust it.
4. Fold useful findings into the parent task, project task, docs, or final answer.
5. Archive completed subagents after extracting their useful output unless the user wants them retained.

## Handoffs And Detached Agents

Use a detached agent only when the agent should outlive your current task. A detached handoff prompt must include:

- Current state and branch/worktree.
- What has already been tried.
- The next concrete action.
- Known risks, dirty files, and verification status.
- How the user should resume or inspect the agent.

## Cleanup

- Archive stale subagents once their output has been consumed.
- Archive worktrees created only for the task after their branch/changes are no longer needed.
- Never archive unrelated user agents.
- Never restart the Paseo daemon without explicit user permission.
- Closing a subagent tab is not cleanup; archive is the lifecycle gesture.

## Common Mistakes

- Creating an agent without first reading provider preferences.
- Giving vague prompts that require the child agent to rediscover the whole task.
- Using `detached: true` for normal helpers.
- Polling running agents that will notify on finish.
- Forgetting to inspect or verify a subagent's output.
- Leaving completed subagents and task worktrees around without a reason.
