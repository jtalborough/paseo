import type { Agent } from "@/stores/session-store";
import type { WorkspaceDraftTabSetup } from "@/stores/workspace-tabs-store";

export type ClientSlashCommandKind =
  | "archive-agent"
  | "replace-agent-with-draft"
  | "open-terminal"
  | "create-project-task";
export type ClientSlashCommandExecution = "immediate" | "insert";

export interface ClientSlashCommand {
  name: string;
  aliases: readonly string[];
  description: string;
  argumentHint: string;
  kind: ClientSlashCommandKind;
  execution: ClientSlashCommandExecution;
  allowArguments?: boolean;
  requiresArgument?: boolean;
  argumentText?: string;
}

export const CLIENT_SLASH_COMMANDS: readonly ClientSlashCommand[] = [
  {
    name: "exit",
    aliases: ["quit", "q"],
    description: "Archive the current agent",
    argumentHint: "",
    kind: "archive-agent",
    execution: "immediate",
  },
  {
    name: "clear",
    aliases: ["new"],
    description: "Archive this agent and start a fresh draft",
    argumentHint: "",
    kind: "replace-agent-with-draft",
    execution: "immediate",
  },
  {
    name: "terminal",
    aliases: ["term"],
    description: "Open a terminal in this agent's cwd",
    argumentHint: "",
    kind: "open-terminal",
    execution: "immediate",
  },
  {
    name: "task",
    aliases: ["todo"],
    description: "Create a Project task from this chat",
    argumentHint: "title",
    kind: "create-project-task",
    execution: "immediate",
    allowArguments: true,
    requiresArgument: true,
  },
];

const COMMAND_BY_NAME = new Map<string, ClientSlashCommand>();
for (const command of CLIENT_SLASH_COMMANDS) {
  COMMAND_BY_NAME.set(command.name, command);
  for (const alias of command.aliases) {
    COMMAND_BY_NAME.set(alias, command);
  }
}

export function resolveClientSlashCommand(input: {
  text: string;
  hasAttachments: boolean;
}): ClientSlashCommand | null {
  if (input.hasAttachments) {
    return null;
  }

  const trimmed = input.text.trim();
  if (!trimmed.startsWith("/")) {
    return null;
  }

  const commandInput = trimmed.slice(1);
  const match = /^(\S+)(?:\s+([\s\S]*))?$/.exec(commandInput);
  if (!match) {
    return null;
  }

  const command = COMMAND_BY_NAME.get(match[1] ?? "");
  if (!command) {
    return null;
  }

  const argumentText = match[2]?.trim() ?? "";
  if (argumentText && !command.allowArguments) {
    return null;
  }

  return argumentText ? { ...command, argumentText } : command;
}

export function buildDraftAgentSetup(agent: Agent): WorkspaceDraftTabSetup {
  const featureValues: Record<string, unknown> = {};
  for (const feature of agent.features ?? []) {
    featureValues[feature.id] = feature.value;
  }

  return {
    provider: agent.provider,
    cwd: agent.cwd,
    modeId: agent.currentModeId ?? agent.runtimeInfo?.modeId ?? null,
    model: agent.model ?? agent.runtimeInfo?.model ?? null,
    thinkingOptionId: agent.thinkingOptionId ?? agent.runtimeInfo?.thinkingOptionId ?? null,
    featureValues,
  };
}
