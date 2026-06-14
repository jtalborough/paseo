# Operating Model

How Paseo work should move from a user request to shipped, verified, auditable work.

Paseo's default is accountable delegation, not maximum ceremony. The lead agent owns the outcome and
chooses the smallest workflow lane that will produce reliable work. Team agents are used when they
change the result, not because a checklist says they exist.

## Operating call

Use a risk-based lane model:

| Lane                        | Use when                                                                                                       | Team involvement                                                            | Required evidence                                                        |
| --------------------------- | -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Solo slice                  | The work is small, mechanical, serial, and has obvious verification.                                           | Lead agent only. State that this is a solo slice.                           | Focused commands, file references, commit/push when requested.           |
| Intake and shape            | The user reports a bug, feature, workflow concern, or ambiguous request.                                       | Product/UX or domain owner if user value, workflow, or validity is unclear. | Validity decision, handling plan, acceptance criteria, owner lane.       |
| Product/UX review           | The change affects user understanding, trust, navigation, copy, roles, permissions, or workflow semantics.     | Product Owner and/or UX Engineer.                                           | Recommendation, risks, wording, acceptance criteria.                     |
| Architecture/implementation | The change crosses packages, protocols, persistence, provider behavior, remote hosts, or migration boundaries. | Developer Lead or architecture advisor before broad edits.                  | Implementation slices, compatibility notes, rollback or migration risk.  |
| QA/audit                    | The change is user-facing, regression-prone, remote/deploy-related, or claims completion of a workflow.        | Independent QA/audit agent where possible.                                  | Blocker-first verdict, exact commands, observed behavior, residual risk. |
| Loop/epic                   | The work is long-running, uncertain, repeatedly failing, or needs several fix/verify cycles.                   | Planner, implementer, reviewer, loop worker, and QA as needed.              | Explicit exit condition, progress trail, final verification and cleanup. |

The lead agent may combine lanes for small work, but must not hide the choice. For example:

> Lane: Solo slice. Reason: workflow-only YAML update with deterministic parse/format checks.

or:

> Lane: Product/UX review. Reason: this changes how users understand Project agents and trust the
> launch path.

## Entry gates

Every non-trivial request starts with a short gate, even when the gate is answered internally:

1. **Is it valid?** Is the report, feature, or concern real enough to act on? What evidence exists?
2. **How should we handle it?** Bug, product decision, docs/process, implementation, QA, or task.
3. **Which lane applies?** Solo, intake, Product/UX, architecture, QA, or loop/epic.
4. **Who must be involved?** Lead only, advisor, team role, QA, or detached owner.
5. **What proves done?** Commands, screenshots, live endpoint, artifact, task update, or user review.

If the answer is obvious and low risk, the lead agent proceeds and states the lane. If the answer is
not obvious, the lead agent pauses to shape the work or creates review agents.

## Team boundaries

Create or involve additional agents when their independent perspective changes the outcome:

- **Product Owner**: mandate, user value, priority, scope, acceptance criteria.
- **UX Engineer**: clarity, trust, workflow fit, copy, visual/interaction behavior.
- **Developer Lead**: implementation slices, architecture risk, compatibility, migration.
- **QA Engineer**: blocker-first verification, regression risk, observable evidence.
- **Domain role**: infrastructure maintainer, finance reviewer, writer, operator, security reviewer,
  or another Project-specific role.

Do not create agents for narrow mechanical work where the added agent would mostly reread context and
repeat deterministic checks. When choosing solo execution, say why.

## Project workflow contract

Durable Project work should remain explainable as:

```text
Project + Task + Workflow Lane + Profile/Role + Prompt + Context Packet + Folder Grants +
Provider/Model/Mode + Runtime Agent + Evidence
```

For now, not every part is fully productized. The lead agent must still preserve the contract in the
places that exist today:

- Use Project Tasks for executable backlog and follow-ups.
- Use docs for durable product, architecture, process, and gotchas.
- Use agent profiles/prompts/context packets when launching from Project surfaces.
- Use commit messages and final reports to preserve evidence when context packets are not yet wired
  into a path.
- Record product gaps as tasks rather than treating missing automation as permission to skip the
  workflow.

## When the agent path is unavailable

If a workflow calls for team agents but the current tool surface cannot create or reach them, the
lead agent must:

1. Say that the team-agent path is blocked.
2. Identify whether the block is product, daemon, CLI, provider, permission, or prompt/skill.
3. Continue with the best safe fallback if useful work remains.
4. Capture the gap as a Project Task or doc update.

Examples:

- `~/.paseo/orchestration-preferences.json` is missing, so provider choice has no durable source.
- The local daemon has a PID but the CLI cannot reach its WebSocket, so CLI-launched review agents
  cannot start.
- The active Codex tool surface does not expose Paseo `create_agent`, so CLI fallback creates root
  agents instead of true subagents.

These are product gaps, not reasons to abandon the operating model.

## Verification policy

Verification scales with blast radius:

- Docs/process only: format/check links, inspect affected guidance, no broad tests.
- Protocol/client/server code: build producer packages before typecheck, then focused tests.
- UI behavior: focused unit tests plus browser/screenshot verification when a running target is
  available.
- Remote/deploy work: GitHub run, artifact contents, host service state, smoke endpoint, and exposed
  status.
- Team-agent work: inspect and verify subagent claims before integrating them.

Never restart the main Paseo daemon or run broad test suites unless the user explicitly approves.

## Beta learning loop

Every real Sidebar Project is beta evidence. When a workflow fails or feels wrong, convert it into
one of:

- a product decision in docs,
- an executable Project Task,
- a focused implementation slice,
- a QA/audit follow-up,
- or a product gap for the Project team surface.

The loop is:

```text
Use Paseo -> observe friction -> classify lane -> assign role -> implement/verify -> preserve evidence
```

Good beta work improves the workstation, not only the immediate project.
