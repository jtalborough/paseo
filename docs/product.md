# Product

What Paseo is, who it's for, and where it's going.

## Product charter

Paseo is the workstation app for AI-assisted work.

It coordinates human intent, durable Project context, agent teams, provider runtimes, terminals,
tasks, audits, and local tools across code and non-code work. Code remains a first-class workflow,
but Paseo is not only a coding dashboard. It is the local operating surface for infrastructure,
finance, documents, presentations, websites, automations, physical devices, research, and any other
Project where a human directs agents through real tools.

The user's core question is always:

> Who is working, why, with what context, under whose authority, and what changed?

Paseo exists to make that question answerable before, during, and after an agent run.

## What is Paseo

Paseo is a next-generation workstation built around agents. One interface to plan, launch, monitor,
coordinate, and audit AI agents across desktop, mobile, terminal, and web.

The work pattern is shifting from manually operating every tool to directing accountable agents that
operate tools under explicit context and constraints. Paseo is built for that workflow.

## Core philosophy

Freedom and flexibility. Every design decision follows from this:

- **Multi-provider** — Use any coding agent harness. Pick the right model for each job, switch freely as the landscape shifts. No vendor-lock in.
- **Cross-device** — Desktop, mobile, web, CLI. Start work at your desk, check progress from your phone, script from the terminal.
- **Self-hosted** — The daemon runs on your machine. Your code, your keys, your environment. No inference markup, no cloud dependency.
- **Respectful** - No telemetry, no forced cloud, no forced accounts
- **Open source** — AGPL-3.0. Users can inspect, fork, and contribute.
- **BYOK** — Bring your own keys. Use your subsidized plans and first-party provider pricing. Paseo adds zero cost on top.
- **Accountable work** — Agents should leave an audit trail: task, prompt/profile, selected context,
  granted tools, runtime agent, result, and follow-up work.
- **General-purpose projects** — The same Project model must handle code repositories, GitOps
  systems, home infrastructure, financial operations, document production, websites, physical
  devices, research, and business processes.

## How it works

### Projects and workspaces

Projects are user-authored contexts for a body of work. A Project owns plain-Markdown tasks,
notes, and other domain content in a portable Paseo-managed directory, and can reference multiple
external Folders.

Folders are detected from the filesystem and contain Workspaces. A Folder may be a git repository,
an operations repo, a document toolkit, a content site, a local automation system, or any other
directory that holds tools and source material for the Project. For git Folders, users can create
additional Workspaces as isolated git worktrees where agents work without affecting main.

Projects combine a durable agent workspace with live development tools. Chats and agents can
retrieve relevant Project knowledge for discovery, while capable agents can also inspect and act on
the authoritative current filesystem through explicit tools. Retrieval never replaces reading the
live file before acting on it.

See [projects.md](projects.md) for the Project directory and ownership model.

### Inside a workspace

A workspace is a flexible canvas:

- Launch multiple agents side by side in split panes
- Open terminals alongside agents
- Mix and match providers within the same workspace
- Link browser, files, tasks, notes, and service endpoints into the same working surface

### Agent teams

Paseo should make agent teams explicit. A Project can have durable role profiles such as Product
Owner, UX Engineer, Developer Lead, QA Engineer, Maintainer, Researcher, Writer, or Operator. Those
profiles are ordinary Project files, not hidden product magic. Launching from a profile should
create a context packet and a runtime agent record that can be traced back to the durable role,
prompt, task, and tool grants.

The default team loop for product development is:

1. Product Owner clarifies mandate, user value, priorities, and acceptance criteria.
2. UX Engineer makes the workflow understandable, usable, and trustable.
3. Developer Lead turns direction into implementation slices and technical risks.
4. QA Engineer verifies observable behavior and reports blockers before work is called done.

Other Project types can define their own teams, but they use the same primitives: Project Tasks,
agent profiles, prompts, context packets, runtime agents, and audit trails.

### The daemon

Paseo is a client-server system. The daemon (Node.js) runs on your machine, manages agent processes, and streams output in real time over WebSocket. Clients connect to the daemon — locally or remotely.

This architecture means:

- The daemon can run on any machine: laptop, VM, remote server
- Multiple clients can connect simultaneously
- Agents keep running when you close the app

## Target user

People who use computers as a serious workstation:

- Care about owning their tools and their data
- Use multiple AI providers and want to switch freely
- Run agents on real tasks across real projects, not toy chats
- Want to work from multiple devices
- Need durable context and auditability across code, operations, documents, content, finance,
  research, and personal infrastructure

## What compounds over time

- **Trust** — Showing up daily, shipping in public, being open source. Earned slowly, lost quickly.
- **Community contributions** — Code, packaging, skills, agent configs. Contributors become advocates.
- **Ecosystem** — Skills, integrations, shared configs. Community-built content that makes the platform more valuable.

## Strategic bets

1. **Models commoditize.** Value moves to the orchestration layer. The best model changes monthly — the workflow layer stays.
2. **Multi-provider wins.** No single provider stays on top. Developers want the best model for each task.
3. **The daemon as infrastructure.** Server/client architecture enables deployment anywhere.
4. **Open source outlasts funding.** Open source communities are resilient. Contributors become advocates.
5. **Projects become the durable unit of work.** Provider transcripts are useful but volatile.
   Tasks, prompts, profiles, notes, context packets, and audit trails must live in user-owned local
   files.
6. **Agent accountability matters more as autonomy grows.** The product must make delegation,
   permissions, provenance, and verification visible instead of treating agents as opaque chat tabs.

## Product mandate

Paseo must make the following workflows coherent from both the top-level product surface and the
provider-native model surface:

- Define the work: Project, task, notes, requirements, external folders, and relevant services.
- Select the worker: agent profile, provider, model, permissions, and launch mode.
- Assemble context: prompt, files, notes, browser state, bookmarks, tool grants, and folder grants.
- Launch with provenance: create a context packet and runtime agent record that point at each other.
- Coordinate the team: human-visible agent status, handoffs, messages, linked terminals, and
  follow-up tasks.
- Verify the result: QA checks, command evidence, changed files, residual risks, and acceptance
  criteria.
- Preserve the audit trail: local files remain the durable source; provider sessions are execution
  artifacts.

If a feature makes an agent more capable but makes this loop less explainable, it is incomplete.

## Living beta

Paseo beta testing happens inside real work. Any Project created in the Paseo sidebar is part of
the beta surface unless the user explicitly marks it out of scope. That includes Paseo itself,
infrastructure repos, homelab operations, finance workflows, websites, document systems, automations,
physical-device projects, and business process folders.

The beta program is a self-improvement loop:

1. Use Paseo to run real Project work.
2. Capture which Project, task, profile, prompt, context packet, provider, model, tools, and
   permissions were involved.
3. Review where the workflow failed, stalled, confused the user, hid provenance, requested the wrong
   permission, lost provider context, or produced weak evidence.
4. Turn those observations into Product, UX, Developer Lead, or QA tasks in the Paseo Project.
5. Ship the improvement, then re-test it against the next real Sidebar Project.

The product team should treat beta evidence as first-class product input. A confusing launch,
missing label, bad provider handoff, orphaned agent, unclear task state, brittle terminal link, or
manual workaround is not just user friction; it is a requirement discovery event.

## Roadmap

### Agent messaging and handoff threads

Agents can already create, brief, and inspect other agents through Paseo's MCP tools, Project
launch packets, shared files, terminals, tasks, and subagent relationships. That gives Paseo a
solid orchestrated communication model, but not yet a first-class peer messaging model.

Add visible agent-to-agent threads so running agents can hand work to each other, ask follow-up
questions, share status, and route decisions without relying only on transcript scraping or
out-of-band files.

Expected shape:

- agent-to-agent message threads with human-visible history
- explicit sender, recipient, Project, task, and related agent metadata
- support for direct replies, handoffs, and broadcast-style status updates
- notifications when an agent needs another agent or a human to respond
- permission boundaries so agents cannot message or command unrelated agents silently
- durable storage under the local Paseo data model, not provider-specific transcripts

This should build on the existing agent lifecycle and subagent model without replacing it:
subagents remain lifecycle children, detached agents remain independent workers, and messaging
becomes the communication layer across those relationships.

## Current state (June 2026)

- Desktop (Electron), mobile (iOS/Android), web, CLI
- Built-in providers: Claude Code (Agent SDK), Codex (app-server), GitHub Copilot (ACP), OpenCode, Pi
- One-click ACP provider catalog: Cursor, DeepSeek TUI, Hermes, Qwen Coder, Kimi Code, and others — plus custom ACP providers
- Voice mode: dictate prompts or talk through problems hands-free
- MCP server exposes the daemon to other agents (create_agent, send_agent_prompt, schedules, terminals, worktrees)
- Scheduled agents (cron-style triggers) via app, CLI, and MCP
- Frequent releases (multiple per week)
- Community contributions across packaging, providers, and bug fixes
- Key UX: split panes, keybinding customization, workspace model, in-app browser
