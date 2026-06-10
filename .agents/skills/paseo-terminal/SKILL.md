---
name: paseo-terminal
description: Use when an agent needs to inspect or control Paseo terminal tabs, linked terminals, joint terminal sessions, or answer whether it can see/use a terminal. Covers list/capture/send workflow and terminal ownership labels.
---

# Paseo terminal

Paseo terminals are daemon-owned shell sessions. You do not see them live by default; you inspect and control them through terminal tools.

## First response rule

If the user asks whether you can see, use, or share a terminal, do not answer from assumption. First list terminals, identify the relevant terminal, then capture it.

## Tool workflow

1. List terminals.
   - Prefer a terminal whose `linkedAgentId` matches your agent id.
   - If no ownership field is available, use explicit terminal ids from the prompt/UI context.
   - If still ambiguous, choose the terminal whose cwd and name match the current task.
2. Capture the terminal before describing what is visible.
3. To run a command, send the command text plus Enter.
4. Capture again and summarize the result.

## Claude Code MCP names

In Claude Code, the Paseo terminal tools usually appear as:

- `mcp__paseo__list_terminals`
- `mcp__paseo__capture_terminal`
- `mcp__paseo__send_terminal_keys`

## Behavior guidance

- Say "I can inspect/control the linked terminal through Paseo tools" rather than "I can see it live."
- For a linked terminal, use the existing terminal instead of starting your own provider shell.
- Do not ask the user to paste terminal output until capture fails or the terminal is not listed.
- Before sending destructive commands, confirm intent unless the user already asked for that exact action.
- If terminal ownership is unclear, report the candidate terminal ids and why you chose one.

## Common loop

```text
list_terminals
capture_terminal terminalId=<chosen>
send_terminal_keys terminalId=<chosen> keys="<command>" Enter
capture_terminal terminalId=<chosen>
```

Use short summaries of terminal output. Do not dump full scrollback unless the user asks.
