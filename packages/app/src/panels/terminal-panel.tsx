import { useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Terminal } from "lucide-react-native";
import { Text, View } from "react-native";
import invariant from "tiny-invariant";
import type { ListTerminalsResponse } from "@getpaseo/protocol/messages";
import { TerminalPane } from "@/components/terminal-pane";
import { usePaneContext, usePaneFocus } from "@/panels/pane-context";
import type { PanelDescriptor, PanelRegistration } from "@/panels/panel-registry";
import { queryClient } from "@/query/query-client";
import { usePanelStore } from "@/stores/panel-store";
import { useSessionStore } from "@/stores/session-store";
import { useWorkspaceExecutionAuthority } from "@/stores/session-store-hooks";

type ListTerminalsPayload = ListTerminalsResponse["payload"];

const FLEX_FILL_STYLE = { flex: 1 } as const;
const CENTERED_PADDED_STYLE = {
  flex: 1,
  alignItems: "center",
  justifyContent: "center",
  padding: 16,
} as const;

function trimNonEmpty(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function resolveTerminalCwd(input: {
  targetCwd?: string | null;
  workspaceDirectory: string | null;
}): string | null {
  return trimNonEmpty(input.targetCwd) ?? input.workspaceDirectory;
}

function resolveAgentTerminalLabel(input: {
  title?: string | null;
  agentId?: string | null;
}): string | null {
  const agentId = trimNonEmpty(input.agentId);
  if (!agentId) {
    return null;
  }
  return `${trimNonEmpty(input.title) ?? "Agent"} (${agentId.slice(0, 8)})`;
}

function useTerminalPanelDescriptor(
  target: {
    kind: "terminal";
    terminalId: string;
    cwd?: string | null;
    sourceAgentId?: string | null;
  },
  context: { serverId: string; workspaceId: string },
): PanelDescriptor {
  const client = useSessionStore((state) => state.sessions[context.serverId]?.client ?? null);
  const workspaceAuthority = useWorkspaceExecutionAuthority(context.serverId, context.workspaceId)!;
  const workspaceDirectory = resolveTerminalCwd({
    targetCwd: target.cwd,
    workspaceDirectory: workspaceAuthority.ok
      ? workspaceAuthority.authority.workspaceDirectory
      : null,
  });
  const terminalsQuery = useQuery(
    {
      queryKey: ["terminals", context.serverId, workspaceDirectory] as const,
      enabled: Boolean(client && workspaceDirectory),
      queryFn: async (): Promise<ListTerminalsPayload> => {
        if (!client || !workspaceDirectory) {
          throw new Error(
            workspaceAuthority.ok
              ? "Workspace execution directory not found"
              : workspaceAuthority.message,
          );
        }
        return client.listTerminals(workspaceDirectory);
      },
      staleTime: 5_000,
    },
    queryClient,
  );
  const terminal =
    terminalsQuery.data?.terminals.find((entry) => entry.id === target.terminalId) ?? null;
  const linkedAgentId = trimNonEmpty(target.sourceAgentId) ?? trimNonEmpty(terminal?.linkedAgentId);
  const linkedAgentLabel = useSessionStore((state) => {
    if (!linkedAgentId) {
      return null;
    }
    const session = state.sessions[context.serverId];
    const agent = session?.agents?.get(linkedAgentId) ?? session?.agentDetails?.get(linkedAgentId);
    return resolveAgentTerminalLabel({ title: agent?.title, agentId: linkedAgentId });
  });

  return {
    label: linkedAgentLabel
      ? `Linked: ${linkedAgentLabel}`
      : (trimNonEmpty(terminal?.title ?? terminal?.name ?? null) ?? "Terminal"),
    subtitle: linkedAgentLabel
      ? `Terminal ${target.terminalId.slice(0, 8)}`
      : (trimNonEmpty(terminal?.title ?? terminal?.name ?? null) ?? "Terminal"),
    titleState: "ready",
    icon: Terminal,
    statusBucket: null,
  };
}

function TerminalPanel() {
  const { serverId, workspaceId, target, openFileInWorkspace } = usePaneContext();
  const { isWorkspaceFocused, isPaneFocused } = usePaneFocus();
  const workspaceAuthority = useWorkspaceExecutionAuthority(serverId, workspaceId)!;
  const workspaceDirectory = resolveTerminalCwd({
    targetCwd: target.kind === "terminal" ? target.cwd : null,
    workspaceDirectory: workspaceAuthority.ok
      ? workspaceAuthority.authority.workspaceDirectory
      : null,
  });
  const isGitCheckout = workspaceAuthority.ok
    ? workspaceAuthority.authority.workspace.projectKind === "git"
    : false;
  const openFileExplorerForCheckout = usePanelStore((state) => state.openFileExplorerForCheckout);
  const linkedAgentLabel = useSessionStore((state) => {
    if (target.kind !== "terminal") {
      return null;
    }
    const agentId = trimNonEmpty(target.sourceAgentId);
    if (!agentId) {
      return null;
    }
    const session = state.sessions[serverId];
    const agent = session?.agents?.get(agentId) ?? session?.agentDetails?.get(agentId);
    return resolveAgentTerminalLabel({ title: agent?.title, agentId });
  });
  const linkedTerminalLabel = linkedAgentLabel
    ? `Linked to ${linkedAgentLabel} · Terminal ${target.kind === "terminal" ? target.terminalId.slice(0, 8) : ""}`
    : null;
  const handleOpenFileExplorer = useCallback(() => {
    if (!workspaceDirectory) {
      return;
    }
    openFileExplorerForCheckout({
      isCompact: true,
      checkout: { serverId, cwd: workspaceDirectory, isGit: isGitCheckout },
    });
  }, [isGitCheckout, openFileExplorerForCheckout, serverId, workspaceDirectory]);
  invariant(target.kind === "terminal", "TerminalPanel requires terminal target");

  if (!isWorkspaceFocused) {
    return <View style={FLEX_FILL_STYLE} />;
  }

  if (!workspaceDirectory) {
    return (
      <View style={CENTERED_PADDED_STYLE}>
        <Text>
          {workspaceAuthority.ok
            ? "Workspace execution directory not found."
            : workspaceAuthority.message}
        </Text>
      </View>
    );
  }

  return (
    <TerminalPane
      serverId={serverId}
      cwd={workspaceDirectory}
      terminalId={target.terminalId}
      isWorkspaceFocused={isWorkspaceFocused}
      isPaneFocused={isPaneFocused}
      onOpenFileExplorer={handleOpenFileExplorer}
      onOpenWorkspaceFile={openFileInWorkspace}
      linkedAgentLabel={linkedTerminalLabel}
    />
  );
}

export const terminalPanelRegistration: PanelRegistration<"terminal"> = {
  kind: "terminal",
  component: TerminalPanel,
  useDescriptor: useTerminalPanelDescriptor,
};
