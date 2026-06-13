import { useCallback, useEffect, useMemo, useState } from "react";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { BranchSwitcher } from "@/components/branch-switcher";
import { ScreenHeader } from "@/components/headers/screen-header";
import { SidebarMenuToggle } from "@/components/headers/menu-header";
import { SplitContainer } from "@/components/split-container";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ProjectSurfaceTab } from "@/components/project-surface-header";
import { WorkspaceGitActions } from "@/git/workspace-actions";
import type { WorkspaceTabDescriptor } from "@/screens/workspace/workspace-tabs-types";
import { buildWorkspacePaneContentModel } from "@/screens/workspace/workspace-pane-content";
import { useProjectGroups } from "@/hooks/use-project-groups";
import {
  collectAllTabs,
  createDefaultLayout,
  useWorkspaceLayoutStore,
} from "@/stores/workspace-layout-store";
import {
  buildWorkspaceTabsSurfacePersistenceKey,
  type WorkspaceTab,
  type WorkspaceTabTarget,
} from "@/stores/workspace-tabs-store";
import { createWorkspaceBrowser, useBrowserStore } from "@/stores/browser-store";
import { projectSurfaceScope } from "@/surfaces/surface-scope";
import { getDesktopHost } from "@/desktop/host";
import { WorkspaceOpenInEditorButton } from "@/screens/workspace/workspace-open-in-editor-button";
import { WorkspaceScriptsButton } from "@/screens/workspace/workspace-scripts-button";
import { useSessionStore, type WorkspaceDescriptor } from "@/stores/session-store";
import { generateDraftId } from "@/stores/draft-keys";
import { useToast } from "@/contexts/toast-context";
import type { WorkspaceFileOpenRequest } from "@/workspace/file-open";

interface ProjectSurfaceScreenProps {
  serverId: string;
  groupId: string;
  initialTab?: ProjectSurfaceTab;
  initialContextPacketPath?: string | null;
}

function projectTargetForTab(
  tab: ProjectSurfaceTab,
  groupId: string,
  options?: { contextPacketPath?: string | null },
): WorkspaceTabTarget | null {
  if (!groupId) {
    return null;
  }
  if (tab === "overview") return { kind: "project-overview", groupId };
  if (tab === "tasks") return { kind: "tasks", groupId };
  if (tab === "notes") return { kind: "notes", groupId };
  if (tab === "agents") return { kind: "project-agents", groupId };
  if (tab === "context") {
    return {
      kind: "project-context",
      groupId,
      ...(options?.contextPacketPath ? { packetPath: options.contextPacketPath } : {}),
    };
  }
  if (tab === "files") return { kind: "project-files", groupId };
  return null;
}

function isSameProjectTarget(left: WorkspaceTabTarget, right: WorkspaceTabTarget): boolean {
  if (left.kind !== right.kind) {
    return false;
  }
  if (!("groupId" in left) || !("groupId" in right)) {
    return false;
  }
  return left.groupId === right.groupId;
}

function cleanupClosedProjectTab(tab: WorkspaceTab | null | undefined): void {
  if (tab?.target.kind !== "browser") {
    return;
  }
  const browserId = tab.target.browserId;
  useBrowserStore.getState().removeBrowser(browserId);
  void getDesktopHost()?.browser?.clearPartition?.(browserId);
}

const EMPTY_CLOSING_TAB_IDS = new Set<string>();

function findProjectWorkspaces(
  workspaces: Map<string, WorkspaceDescriptor> | undefined,
  groupId: string,
): WorkspaceDescriptor[] {
  return Array.from(workspaces?.values() ?? [])
    .filter((workspace) => workspace.projectGroupId === groupId)
    .sort((left, right) => left.name.localeCompare(right.name));
}

export function ProjectSurfaceScreen({
  serverId,
  groupId,
  initialTab = "overview",
  initialContextPacketPath = null,
}: ProjectSurfaceScreenProps) {
  const scope = useMemo(() => projectSurfaceScope(groupId), [groupId]);
  const persistenceKey = useMemo(
    () => buildWorkspaceTabsSurfacePersistenceKey({ serverId, scope: scope ?? undefined }),
    [scope, serverId],
  );
  const layout = useWorkspaceLayoutStore((state) =>
    persistenceKey ? (state.layoutByWorkspace[persistenceKey] ?? null) : null,
  );
  const openLayoutTabFocused = useWorkspaceLayoutStore((state) => state.openTabFocused);
  const openLayoutTabInSplit = useWorkspaceLayoutStore((state) => state.openTabInSplit);
  const focusLayoutTab = useWorkspaceLayoutStore((state) => state.focusTab);
  const closeLayoutTab = useWorkspaceLayoutStore((state) => state.closeTab);
  const retargetLayoutTab = useWorkspaceLayoutStore((state) => state.retargetTab);
  const splitLayoutPane = useWorkspaceLayoutStore((state) => state.splitPane);
  const splitLayoutPaneEmpty = useWorkspaceLayoutStore((state) => state.splitPaneEmpty);
  const moveLayoutTabToPane = useWorkspaceLayoutStore((state) => state.moveTabToPane);
  const focusLayoutPane = useWorkspaceLayoutStore((state) => state.focusPane);
  const resizeLayoutSplit = useWorkspaceLayoutStore((state) => state.resizeSplit);
  const reorderLayoutTabsInPane = useWorkspaceLayoutStore((state) => state.reorderTabsInPane);
  const client = useSessionStore((state) => state.sessions[serverId]?.client ?? null);
  const hostWorkspaces = useSessionStore((state) => state.sessions[serverId]?.workspaces);
  const projectWorkspaces = useMemo(
    () => findProjectWorkspaces(hostWorkspaces, groupId),
    [groupId, hostWorkspaces],
  );
  const [selectedRuntimeWorkspaceId, setSelectedRuntimeWorkspaceId] = useState<string | null>(null);
  const primaryWorkspace = useMemo(
    () =>
      projectWorkspaces.find((workspace) => workspace.id === selectedRuntimeWorkspaceId) ??
      projectWorkspaces[0] ??
      null,
    [projectWorkspaces, selectedRuntimeWorkspaceId],
  );
  const toast = useToast();
  const [hoveredCloseTabKey, setHoveredCloseTabKey] = useState<string | null>(null);
  const { groups } = useProjectGroups(serverId);
  const group = useMemo(
    () => groups.find((candidate) => candidate.groupId === groupId) ?? null,
    [groupId, groups],
  );
  // Render purely from the store layout. The initial tab is seeded into the store
  // by the effect below — do NOT inject it into a derived layout here, or every
  // focus/create/close (which mutates the store) would recompute this memo and
  // re-focus the initial tab, making tabs impossible to switch.
  const effectiveLayout = useMemo(() => layout ?? createDefaultLayout(), [layout]);
  const uiTabs = useMemo(() => collectAllTabs(effectiveLayout.root), [effectiveLayout]);
  const executionWorkspaceId = primaryWorkspace?.id ?? groupId;
  const executionCwd = primaryWorkspace?.workspaceDirectory ?? group?.cwd ?? null;

  useEffect(() => {
    if (
      selectedRuntimeWorkspaceId &&
      projectWorkspaces.some((workspace) => workspace.id === selectedRuntimeWorkspaceId)
    ) {
      return;
    }
    setSelectedRuntimeWorkspaceId(projectWorkspaces[0]?.id ?? null);
  }, [projectWorkspaces, selectedRuntimeWorkspaceId]);

  const openProjectTarget = useCallback(
    (target: WorkspaceTabTarget) => {
      if (!persistenceKey) {
        return null;
      }
      return openLayoutTabFocused(persistenceKey, target);
    },
    [openLayoutTabFocused, persistenceKey],
  );

  const handleOpenInitialTab = useCallback(
    (tab: ProjectSurfaceTab) => {
      if (tab === "browser") {
        const { browserId } = createWorkspaceBrowser();
        openProjectTarget({ kind: "browser", browserId });
        return;
      }

      const target = projectTargetForTab(tab, groupId, {
        contextPacketPath: initialContextPacketPath,
      });
      if (target) {
        openProjectTarget(target);
      }
    },
    [groupId, initialContextPacketPath, openProjectTarget],
  );

  const handleNavigateTab = useCallback(
    (tabId: string) => {
      if (!persistenceKey) return;
      focusLayoutTab(persistenceKey, tabId);
    },
    [focusLayoutTab, persistenceKey],
  );

  const handleCloseTab = useCallback(
    (tabId: string) => {
      if (!persistenceKey) return;
      cleanupClosedProjectTab(uiTabs.find((tab) => tab.tabId === tabId));
      closeLayoutTab(persistenceKey, tabId);
    },
    [closeLayoutTab, persistenceKey, uiTabs],
  );

  const handleCloseTabsToLeft = useCallback(
    (tabId: string, paneTabs: WorkspaceTabDescriptor[]) => {
      const index = paneTabs.findIndex((tab) => tab.tabId === tabId);
      if (index <= 0) return;
      for (const tab of paneTabs.slice(0, index)) {
        handleCloseTab(tab.tabId);
      }
    },
    [handleCloseTab],
  );

  const handleCloseTabsToRight = useCallback(
    (tabId: string, paneTabs: WorkspaceTabDescriptor[]) => {
      const index = paneTabs.findIndex((tab) => tab.tabId === tabId);
      if (index < 0 || index >= paneTabs.length - 1) return;
      for (const tab of paneTabs.slice(index + 1)) {
        handleCloseTab(tab.tabId);
      }
    },
    [handleCloseTab],
  );

  const handleCloseOtherTabs = useCallback(
    (tabId: string, paneTabs: WorkspaceTabDescriptor[]) => {
      for (const tab of paneTabs) {
        if (tab.tabId !== tabId) {
          handleCloseTab(tab.tabId);
        }
      }
    },
    [handleCloseTab],
  );

  const focusPaneBeforeCreate = useCallback(
    (paneId: string | undefined) => {
      if (!persistenceKey || !paneId) {
        return;
      }
      focusLayoutPane(persistenceKey, paneId);
    },
    [focusLayoutPane, persistenceKey],
  );

  const handleCreateBrowserTab = useCallback(
    (input: { paneId?: string } = {}) => {
      focusPaneBeforeCreate(input.paneId);
      const { browserId } = createWorkspaceBrowser();
      openProjectTarget({ kind: "browser", browserId });
    },
    [focusPaneBeforeCreate, openProjectTarget],
  );

  const handleCreateDraftTab = useCallback(
    (input: { paneId?: string } = {}) => {
      focusPaneBeforeCreate(input.paneId);
      openProjectTarget({
        kind: "draft",
        draftId: generateDraftId(),
        cwd: executionCwd,
        projectGroupId: groupId,
      });
    },
    [executionCwd, focusPaneBeforeCreate, groupId, openProjectTarget],
  );

  const handleCreateTerminalTab = useCallback(
    async (input: { paneId?: string } = {}) => {
      const cwd = primaryWorkspace?.workspaceDirectory ?? group?.cwd;
      if (!client || !cwd) {
        toast.error("Project folder is not available");
        return;
      }
      focusPaneBeforeCreate(input.paneId);
      try {
        const payload = await client.createTerminal(cwd);
        if (!payload.terminal) {
          toast.error("Unable to create terminal");
          return;
        }
        openProjectTarget({
          kind: "terminal",
          terminalId: payload.terminal.id,
          cwd: payload.terminal.cwd,
        });
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Unable to create terminal");
      }
    },
    [client, focusPaneBeforeCreate, group?.cwd, openProjectTarget, primaryWorkspace, toast],
  );

  const handleCreateTasksTab = useCallback(
    (input: { paneId?: string } = {}) => {
      focusPaneBeforeCreate(input.paneId);
      openProjectTarget({ kind: "tasks", groupId });
    },
    [focusPaneBeforeCreate, groupId, openProjectTarget],
  );

  const handleCreateNotesTab = useCallback(
    (input: { paneId?: string } = {}) => {
      focusPaneBeforeCreate(input.paneId);
      openProjectTarget({ kind: "notes", groupId });
    },
    [focusPaneBeforeCreate, groupId, openProjectTarget],
  );
  const handleOpenTerminalTab = useCallback(
    (terminalId: string) => {
      openProjectTarget({ kind: "terminal", terminalId });
    },
    [openProjectTarget],
  );
  const handleOpenUrlInBrowserTab = useCallback(
    (url: string) => {
      const { browserId } = createWorkspaceBrowser({ initialUrl: url });
      openProjectTarget({ kind: "browser", browserId });
    },
    [openProjectTarget],
  );

  const noop = useCallback(() => {}, []);

  useEffect(() => {
    if (!persistenceKey) {
      return;
    }
    if (initialTab === "browser" && uiTabs.length === 0) {
      handleOpenInitialTab("browser");
      return;
    }
    const target = projectTargetForTab(initialTab, groupId);
    const targetAlreadyOpen = target
      ? uiTabs.some((tab) => isSameProjectTarget(tab.target, target))
      : false;
    if (target && !targetAlreadyOpen) {
      openLayoutTabFocused(persistenceKey, target);
    }
  }, [groupId, handleOpenInitialTab, initialTab, openLayoutTabFocused, persistenceKey, uiTabs]);

  const buildPaneContentModel = useCallback(
    (input: { paneId: string; tab: WorkspaceTabDescriptor }) =>
      buildWorkspacePaneContentModel({
        tab: input.tab,
        normalizedServerId: serverId,
        normalizedWorkspaceId: executionWorkspaceId,
        scope: scope ?? undefined,
        onOpenTab: (target) => {
          focusPaneBeforeCreate(input.paneId);
          openProjectTarget(target);
        },
        onOpenTabInSplit: (target, options) => {
          if (!persistenceKey) {
            return;
          }
          const tabId = openLayoutTabInSplit(persistenceKey, target, {
            targetPaneId: input.paneId,
            position: options?.position ?? "right",
            parentTabId: input.tab.tabId,
          });
          if (!tabId) {
            focusPaneBeforeCreate(input.paneId);
            openProjectTarget(target);
            return;
          }
        },
        onCloseCurrentTab: () => {
          handleCloseTab(input.tab.tabId);
        },
        onRetargetCurrentTab: (target) => {
          if (!persistenceKey) {
            return;
          }
          retargetLayoutTab(persistenceKey, input.tab.tabId, target);
        },
        onOpenWorkspaceFile: noopProjectWorkspaceFileOpen,
        onOpenImportSheet: noopProjectImportSheet,
      }),
    [
      executionWorkspaceId,
      focusPaneBeforeCreate,
      handleCloseTab,
      openLayoutTabInSplit,
      openProjectTarget,
      persistenceKey,
      retargetLayoutTab,
      serverId,
      scope,
    ],
  );

  const handleSplitPane = useCallback(
    (input: {
      tabId: string;
      targetPaneId: string;
      position: "left" | "right" | "top" | "bottom";
    }) => {
      if (!persistenceKey) {
        return;
      }
      splitLayoutPane(persistenceKey, input);
    },
    [persistenceKey, splitLayoutPane],
  );

  const handleSplitPaneEmpty = useCallback(
    (input: { targetPaneId: string; position: "left" | "right" | "top" | "bottom" }) => {
      if (!persistenceKey) {
        return;
      }
      const paneId = splitLayoutPaneEmpty(persistenceKey, input);
      if (paneId) {
        handleCreateDraftTab({ paneId });
      }
    },
    [handleCreateDraftTab, persistenceKey, splitLayoutPaneEmpty],
  );

  const handleMoveTabToPane = useCallback(
    (tabId: string, toPaneId: string) => {
      if (!persistenceKey) {
        return;
      }
      moveLayoutTabToPane(persistenceKey, tabId, toPaneId);
    },
    [moveLayoutTabToPane, persistenceKey],
  );

  const handleFocusPane = useCallback(
    (paneId: string) => {
      if (!persistenceKey) {
        return;
      }
      focusLayoutPane(persistenceKey, paneId);
    },
    [focusLayoutPane, persistenceKey],
  );

  const handleResizeSplit = useCallback(
    (splitGroupId: string, sizes: number[]) => {
      if (!persistenceKey) {
        return;
      }
      resizeLayoutSplit(persistenceKey, splitGroupId, sizes);
    },
    [persistenceKey, resizeLayoutSplit],
  );

  const handleReorderTabsInPane = useCallback(
    (paneId: string, tabIds: string[]) => {
      if (!persistenceKey) {
        return;
      }
      reorderLayoutTabsInPane(persistenceKey, paneId, tabIds);
    },
    [persistenceKey, reorderLayoutTabsInPane],
  );

  const renderPaneEmptyState = useCallback(
    () => (
      <View style={styles.centered}>
        <Text style={styles.muted}>Use the tab buttons above to open a Project tab.</Text>
      </View>
    ),
    [],
  );

  const title = group?.displayName ?? "Project";

  return (
    <View style={styles.container}>
      <ProjectSurfaceTopBar
        title={title}
        serverId={serverId}
        groupId={groupId}
        cwd={executionCwd}
        workspace={primaryWorkspace}
        workspaces={projectWorkspaces}
        onSelectWorkspace={setSelectedRuntimeWorkspaceId}
        onScriptTerminalStarted={handleOpenTerminalTab}
        onViewTerminal={handleOpenTerminalTab}
        onOpenUrlInBrowserTab={handleOpenUrlInBrowserTab}
      />
      <View style={styles.surfaceBody}>
        {!persistenceKey ? (
          <View style={styles.centered}>
            <Text style={styles.muted}>Opening Project...</Text>
          </View>
        ) : (
          <SplitContainer
            layout={effectiveLayout}
            workspaceKey={persistenceKey}
            normalizedServerId={serverId}
            normalizedWorkspaceId={executionWorkspaceId}
            isWorkspaceFocused
            uiTabs={uiTabs}
            hoveredCloseTabKey={hoveredCloseTabKey}
            setHoveredCloseTabKey={setHoveredCloseTabKey}
            closingTabIds={EMPTY_CLOSING_TAB_IDS}
            onNavigateTab={handleNavigateTab}
            onCloseTab={handleCloseTab}
            onCopyResumeCommand={noop}
            onCopyAgentId={noop}
            onReloadAgent={noop}
            onRenameTab={noop}
            onCloseTabsToLeft={handleCloseTabsToLeft}
            onCloseTabsToRight={handleCloseTabsToRight}
            onCloseOtherTabs={handleCloseOtherTabs}
            onCreateDraftTab={handleCreateDraftTab}
            onCreateTerminalTab={handleCreateTerminalTab}
            onCreateBrowserTab={handleCreateBrowserTab}
            onCreateTasksTab={handleCreateTasksTab}
            onCreateNotesTab={handleCreateNotesTab}
            showCreateBrowserTab={Boolean(primaryWorkspace)}
            showCreateTasksTab
            showCreateNotesTab
            buildPaneContentModel={buildPaneContentModel}
            onFocusPane={handleFocusPane}
            onSplitPane={handleSplitPane}
            onSplitPaneEmpty={handleSplitPaneEmpty}
            onMoveTabToPane={handleMoveTabToPane}
            onResizeSplit={handleResizeSplit}
            onReorderTabsInPane={handleReorderTabsInPane}
            renderPaneEmptyState={renderPaneEmptyState}
          />
        )}
      </View>
    </View>
  );
}

function ProjectSurfaceTopBar({
  title,
  serverId,
  groupId,
  cwd,
  workspace,
  workspaces,
  onSelectWorkspace,
  onScriptTerminalStarted,
  onViewTerminal,
  onOpenUrlInBrowserTab,
}: {
  title: string;
  serverId: string;
  groupId: string;
  cwd: string | null;
  workspace: WorkspaceDescriptor | null;
  workspaces: WorkspaceDescriptor[];
  onSelectWorkspace: (workspaceId: string) => void;
  onScriptTerminalStarted: (terminalId: string) => void;
  onViewTerminal: (terminalId: string) => void;
  onOpenUrlInBrowserTab: (url: string) => void;
}) {
  const left = useMemo(
    () => (
      <>
        <SidebarMenuToggle />
        <ProjectHeaderTitleBar
          title={title}
          serverId={serverId}
          groupId={groupId}
          workspace={workspace}
          workspaces={workspaces}
          onSelectWorkspace={onSelectWorkspace}
        />
      </>
    ),
    [groupId, onSelectWorkspace, serverId, title, workspace, workspaces],
  );
  const right = useMemo(
    () => (
      <ProjectSurfaceHeaderActions
        serverId={serverId}
        cwd={cwd}
        workspace={workspace}
        onScriptTerminalStarted={onScriptTerminalStarted}
        onViewTerminal={onViewTerminal}
        onOpenUrlInBrowserTab={onOpenUrlInBrowserTab}
      />
    ),
    [cwd, onOpenUrlInBrowserTab, onScriptTerminalStarted, onViewTerminal, serverId, workspace],
  );

  return <ScreenHeader left={left} right={right} />;
}

function ProjectHeaderTitleBar({
  title,
  serverId,
  groupId,
  workspace,
  workspaces,
  onSelectWorkspace,
}: {
  title: string;
  serverId: string;
  groupId: string;
  workspace: WorkspaceDescriptor | null;
  workspaces: WorkspaceDescriptor[];
  onSelectWorkspace: (workspaceId: string) => void;
}) {
  return (
    <View style={styles.headerTitleContainer}>
      <View style={styles.headerTitleTextGroup}>
        <BranchSwitcher
          currentBranchName={null}
          title={title}
          serverId={serverId}
          workspaceId={groupId}
          isGitCheckout={false}
        />
        <ProjectRuntimePill
          workspace={workspace}
          workspaces={workspaces}
          onSelectWorkspace={onSelectWorkspace}
        />
      </View>
    </View>
  );
}

function ProjectRuntimePill({
  workspace,
  workspaces,
  onSelectWorkspace,
}: {
  workspace: WorkspaceDescriptor | null;
  workspaces: WorkspaceDescriptor[];
  onSelectWorkspace: (workspaceId: string) => void;
}) {
  if (!workspace) {
    return (
      <View style={styles.runtimePill}>
        <Text style={styles.runtimePillLabel}>No runtime folder</Text>
      </View>
    );
  }

  if (workspaces.length > 1) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger
          accessibilityRole="button"
          accessibilityLabel="Select Project runtime folder"
          style={styles.runtimePill}
          testID="project-runtime-selector"
        >
          <Text style={styles.runtimePillPrefix}>Runtime</Text>
          <Text style={styles.runtimePillLabel} numberOfLines={1}>
            {workspace.name}
          </Text>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" width={260}>
          {workspaces.map((candidate) => (
            <RuntimeWorkspaceMenuItem
              key={candidate.id}
              workspace={candidate}
              selected={candidate.id === workspace.id}
              onSelectWorkspace={onSelectWorkspace}
            />
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <View style={styles.runtimePill}>
      <Text style={styles.runtimePillPrefix}>Runtime</Text>
      <Text style={styles.runtimePillLabel} numberOfLines={1}>
        {workspace.name}
      </Text>
    </View>
  );
}

function RuntimeWorkspaceMenuItem({
  workspace,
  selected,
  onSelectWorkspace,
}: {
  workspace: WorkspaceDescriptor;
  selected: boolean;
  onSelectWorkspace: (workspaceId: string) => void;
}) {
  const handleSelect = useCallback(() => {
    onSelectWorkspace(workspace.id);
  }, [onSelectWorkspace, workspace.id]);

  return (
    <DropdownMenuItem
      selected={selected}
      showSelectedCheck
      description={workspace.workspaceDirectory}
      onSelect={handleSelect}
      testID={`project-runtime-${workspace.id}`}
    >
      {workspace.name}
    </DropdownMenuItem>
  );
}

function ProjectSurfaceHeaderActions({
  serverId,
  cwd,
  workspace,
  onScriptTerminalStarted,
  onViewTerminal,
  onOpenUrlInBrowserTab,
}: {
  serverId: string;
  cwd: string | null;
  workspace: WorkspaceDescriptor | null;
  onScriptTerminalStarted: (terminalId: string) => void;
  onViewTerminal: (terminalId: string) => void;
  onOpenUrlInBrowserTab: (url: string) => void;
}) {
  return (
    <View style={styles.headerRight}>
      {workspace && workspace.scripts.length > 0 ? (
        <WorkspaceScriptsButton
          serverId={serverId}
          workspaceId={workspace.id}
          scripts={workspace.scripts}
          onScriptTerminalStarted={onScriptTerminalStarted}
          onViewTerminal={onViewTerminal}
          onOpenUrlInBrowserTab={onOpenUrlInBrowserTab}
          hideLabels
        />
      ) : null}
      {cwd ? <WorkspaceOpenInEditorButton serverId={serverId} cwd={cwd} /> : null}
      {workspace?.projectKind === "git" ? (
        <WorkspaceGitActions serverId={serverId} cwd={workspace.id} hideLabels />
      ) : null}
    </View>
  );
}

function noopProjectWorkspaceFileOpen(_request: WorkspaceFileOpenRequest) {}
function noopProjectImportSheet() {}

const styles = StyleSheet.create((theme) => ({
  container: {
    flex: 1,
    minHeight: 0,
    backgroundColor: theme.colors.surface0,
  },
  headerTitleContainer: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[2],
    overflow: "hidden",
  },
  headerTitleTextGroup: {
    minWidth: 0,
    overflow: "hidden",
    flexShrink: 1,
    flexGrow: {
      xs: 1,
      md: 0,
    },
    flexDirection: {
      xs: "column",
      md: "row",
    },
    alignItems: {
      xs: "flex-start",
      md: "center",
    },
    justifyContent: "flex-start",
    gap: {
      xs: 0,
      md: theme.spacing[2],
    },
  },
  runtimePill: {
    maxWidth: {
      xs: 160,
      md: 240,
    },
    minWidth: 0,
    flexShrink: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    paddingHorizontal: theme.spacing[2],
    paddingVertical: 2,
    borderRadius: theme.borderRadius.full,
    borderWidth: 1,
    borderColor: theme.colors.borderAccent,
    backgroundColor: theme.colors.surface1,
    display: {
      xs: "none",
      md: "flex",
    },
  },
  runtimePillPrefix: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
  runtimePillLabel: {
    minWidth: 0,
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: {
      xs: theme.spacing[1],
      md: theme.spacing[2],
    },
  },
  surfaceBody: {
    flex: 1,
    minHeight: 0,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: theme.spacing[6],
  },
  muted: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
}));
