import { useCallback, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Terminal } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import invariant from "tiny-invariant";
import type { ListTerminalsResponse } from "@getpaseo/protocol/messages";
import { TerminalPane } from "@/components/terminal-pane";
import { usePaneContext, usePaneFocus } from "@/panels/pane-context";
import type { PanelDescriptor, PanelRegistration } from "@/panels/panel-registry";
import { queryClient } from "@/query/query-client";
import {
  buildTerminalsQueryKey,
  upsertCreatedTerminalPayload,
} from "@/screens/workspace/terminals/state";
import { usePanelStore } from "@/stores/panel-store";
import { useSessionStore } from "@/stores/session-store";
import { useWorkspaceExecutionAuthority } from "@/stores/session-store-hooks";
import { toErrorMessage } from "@/utils/error-messages";

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
  const { serverId, workspaceId, target, openFileInWorkspace, retargetCurrentTab } =
    usePaneContext();
  const { isWorkspaceFocused, isPaneFocused } = usePaneFocus();
  const client = useSessionStore((state) => state.sessions[serverId]?.client ?? null);
  const [isRecoveringTerminal, setIsRecoveringTerminal] = useState(false);
  const [recoverTerminalError, setRecoverTerminalError] = useState<string | null>(null);
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
  const terminalsQueryKey = buildTerminalsQueryKey(serverId, workspaceDirectory);
  const terminalsQuery = useQuery(
    {
      queryKey: terminalsQueryKey,
      enabled: Boolean(client && workspaceDirectory && isWorkspaceFocused),
      queryFn: async () => {
        if (!client || !workspaceDirectory) {
          throw new Error("Host is not connected");
        }
        return client.listTerminals(workspaceDirectory);
      },
      staleTime: 5_000,
    },
    queryClient,
  );
  const terminalExists =
    target.kind === "terminal" &&
    terminalsQuery.data?.terminals.some((terminal) => terminal.id === target.terminalId);
  const shouldShowRecoverTerminal =
    target.kind === "terminal" && terminalsQuery.isSuccess && terminalExists === false;
  const handleOpenFileExplorer = useCallback(() => {
    if (!workspaceDirectory) {
      return;
    }
    openFileExplorerForCheckout({
      isCompact: true,
      checkout: { serverId, cwd: workspaceDirectory, isGit: isGitCheckout },
    });
  }, [isGitCheckout, openFileExplorerForCheckout, serverId, workspaceDirectory]);
  const recoverButtonStyle = useCallback(
    ({ pressed }: { pressed: boolean }) => [
      styles.recoverButton,
      pressed ? styles.recoverButtonPressed : null,
      isRecoveringTerminal || !client ? styles.recoverButtonDisabled : null,
    ],
    [client, isRecoveringTerminal],
  );
  const handleRecoverTerminal = useCallback(() => {
    if (!client || !workspaceDirectory || target.kind !== "terminal") {
      return;
    }

    setRecoverTerminalError(null);
    setIsRecoveringTerminal(true);
    void (async () => {
      try {
        const payload = await client.createTerminal(workspaceDirectory);
        const createdTerminal = payload.terminal;
        if (!createdTerminal) {
          throw new Error("Unable to create terminal");
        }
        queryClient.setQueryData<ListTerminalsPayload>(terminalsQueryKey, (current) =>
          upsertCreatedTerminalPayload({
            current,
            terminal: createdTerminal,
            workspaceDirectory,
          }),
        );
        void queryClient.invalidateQueries({ queryKey: terminalsQueryKey });
        retargetCurrentTab({
          kind: "terminal",
          terminalId: createdTerminal.id,
          cwd: createdTerminal.cwd,
          sourceAgentId: target.sourceAgentId ?? null,
        });
      } catch (error) {
        setRecoverTerminalError(toErrorMessage(error));
      } finally {
        setIsRecoveringTerminal(false);
      }
    })();
  }, [client, retargetCurrentTab, target, terminalsQueryKey, workspaceDirectory]);
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

  if (shouldShowRecoverTerminal) {
    return (
      <View style={styles.recoverContainer}>
        <Terminal size={28} color="#8A8F98" />
        <Text style={styles.recoverTitle}>Terminal session ended</Text>
        <Text style={styles.recoverBody}>
          The tab was restored, but the shell process is no longer running on the host.
        </Text>
        <Pressable
          accessibilityRole="button"
          disabled={isRecoveringTerminal || !client}
          onPress={handleRecoverTerminal}
          style={recoverButtonStyle}
        >
          <Text style={styles.recoverButtonText}>
            {isRecoveringTerminal ? "Starting..." : "Start new terminal"}
          </Text>
        </Pressable>
        {recoverTerminalError ? (
          <Text style={styles.recoverError}>{recoverTerminalError}</Text>
        ) : null}
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

const styles = StyleSheet.create((theme) => ({
  recoverContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing[2],
    paddingHorizontal: theme.spacing[6],
    backgroundColor: theme.colors.background,
  },
  recoverTitle: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.semibold,
    textAlign: "center",
  },
  recoverBody: {
    maxWidth: 420,
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    lineHeight: 20,
    textAlign: "center",
  },
  recoverButton: {
    minHeight: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing[3],
    backgroundColor: theme.colors.primary,
  },
  recoverButtonPressed: {
    opacity: 0.82,
  },
  recoverButtonDisabled: {
    opacity: 0.55,
  },
  recoverButtonText: {
    color: theme.colors.primaryForeground,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.semibold,
  },
  recoverError: {
    color: theme.colors.destructive,
    fontSize: theme.fontSize.xs,
    textAlign: "center",
  },
}));
