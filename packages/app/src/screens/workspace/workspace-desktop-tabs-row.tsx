import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type Dispatch,
  type SetStateAction,
} from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
  type LayoutChangeEvent,
  type PressableStateCallbackType,
} from "react-native";
import {
  CopyX,
  ArrowLeftToLine,
  ArrowRightToLine,
  Columns2,
  Copy,
  Pencil,
  RotateCw,
  Rows2,
  Globe,
  FileText,
  ListTodo,
  NotebookText,
  Plus,
  SquarePen,
  SquareTerminal,
  X,
} from "lucide-react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { SortableInlineList } from "@/components/sortable-inline-list";
import type {
  DraggableListDragHandleProps,
  DraggableRenderItemInfo,
} from "@/components/draggable-list.types";
import { isNative, isWeb } from "@/constants/platform";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Shortcut } from "@/components/ui/shortcut";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useShortcutKeys } from "@/hooks/use-shortcut-keys";
import { WORKSPACE_SECONDARY_HEADER_HEIGHT } from "@/constants/layout";
import { useWorkspaceTabLayout } from "@/screens/workspace/use-workspace-tab-layout";
import {
  WorkspaceTabPresentationResolver,
  WorkspaceTabIcon,
  type WorkspaceTabPresentation,
} from "@/screens/workspace/workspace-tab-presentation";
import { buildDeterministicWorkspaceTabId } from "@/workspace-tabs/identity";
import {
  buildWorkspaceDesktopTabActions,
  type WorkspaceDesktopTabActions,
  type WorkspaceTabMenuEntry,
} from "@/screens/workspace/workspace-tab-menu";
import type { WorkspaceTabDescriptor } from "@/screens/workspace/workspace-tabs-types";
import type { Theme } from "@/styles/theme";
import { RenderProfile } from "@/utils/render-profiler";

const DROPDOWN_WIDTH = 220;
const LOADING_TAB_LABEL_SKELETON_WIDTH = 80;
const COLLAPSED_NEW_TAB_ACTIONS_WIDTH = 560;

const ThemedActivityIndicator = withUnistyles(ActivityIndicator);
const ThemedX = withUnistyles(X);
const ThemedCopy = withUnistyles(Copy);
const ThemedRotateCw = withUnistyles(RotateCw);
const ThemedArrowLeftToLine = withUnistyles(ArrowLeftToLine);
const ThemedArrowRightToLine = withUnistyles(ArrowRightToLine);
const ThemedCopyX = withUnistyles(CopyX);
const ThemedPencil = withUnistyles(Pencil);
const ThemedSquarePen = withUnistyles(SquarePen);
const ThemedSquareTerminal = withUnistyles(SquareTerminal);
const ThemedGlobe = withUnistyles(Globe);
const ThemedFileText = withUnistyles(FileText);
const ThemedListTodo = withUnistyles(ListTodo);
const ThemedNotebookText = withUnistyles(NotebookText);
const ThemedPlus = withUnistyles(Plus);
const ThemedColumns2 = withUnistyles(Columns2);
const ThemedRows2 = withUnistyles(Rows2);

const foregroundColorMapping = (theme: Theme) => ({ color: theme.colors.foreground });
const mutedColorMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });
const newAgentLeadingIcon = <ThemedSquarePen size={16} uniProps={mutedColorMapping} />;
const newTerminalLeadingIcon = <ThemedSquareTerminal size={16} uniProps={mutedColorMapping} />;
const newBrowserLeadingIcon = <ThemedGlobe size={16} uniProps={mutedColorMapping} />;
const filesLeadingIcon = <ThemedFileText size={16} uniProps={mutedColorMapping} />;
const tasksLeadingIcon = <ThemedListTodo size={16} uniProps={mutedColorMapping} />;
const notesLeadingIcon = <ThemedNotebookText size={16} uniProps={mutedColorMapping} />;

function newTabActionButtonStyle({ hovered, pressed }: PressableStateCallbackType) {
  return [styles.newTabActionButton, (hovered || pressed) && styles.newTabActionButtonHovered];
}

function newTabActionButtonDisabledStyle({ hovered, pressed }: PressableStateCallbackType) {
  return [...newTabActionButtonStyle({ hovered, pressed }), styles.newTabActionButtonDisabled];
}

function newTabMenuTriggerStyle({
  hovered,
  pressed,
  open,
}: PressableStateCallbackType & { open?: boolean }) {
  return [
    styles.newTabActionButton,
    (hovered || pressed || open) && styles.newTabActionButtonHovered,
  ];
}

function TabContextMenuItem({
  entry,
}: {
  entry: Extract<WorkspaceTabMenuEntry, { kind: "item" }>;
}) {
  const leading = useMemo(() => {
    switch (entry.icon) {
      case "copy":
        return <ThemedCopy size={16} uniProps={mutedColorMapping} />;
      case "rotate-cw":
        return <ThemedRotateCw size={16} uniProps={mutedColorMapping} />;
      case "arrow-left-to-line":
        return <ThemedArrowLeftToLine size={16} uniProps={mutedColorMapping} />;
      case "arrow-right-to-line":
        return <ThemedArrowRightToLine size={16} uniProps={mutedColorMapping} />;
      case "copy-x":
        return <ThemedCopyX size={16} uniProps={mutedColorMapping} />;
      case "terminal":
        return <ThemedSquareTerminal size={16} uniProps={mutedColorMapping} />;
      case "pencil":
        return <ThemedPencil size={16} uniProps={mutedColorMapping} />;
      case "x":
        return <ThemedX size={16} uniProps={mutedColorMapping} />;
      default:
        return undefined;
    }
  }, [entry.icon]);
  const trailing = useMemo(
    () => (entry.hint ? <Text style={styles.menuItemHint}>{entry.hint}</Text> : undefined),
    [entry.hint],
  );
  return (
    <ContextMenuItem
      testID={entry.testID}
      disabled={entry.disabled}
      destructive={entry.destructive}
      onSelect={entry.onSelect}
      tooltip={entry.tooltip}
      leading={leading}
      trailing={trailing}
    >
      {entry.label}
    </ContextMenuItem>
  );
}

function tabKeyExtractor(tab: WorkspaceDesktopTabRowItem) {
  return `${tab.tab.key}:${tab.tab.kind}`;
}

export interface WorkspaceDesktopTabRowItem {
  tab: WorkspaceTabDescriptor;
  isActive: boolean;
  isCloseHovered: boolean;
  isClosingTab: boolean;
}

interface WorkspaceDesktopTabsRowProps {
  paneId?: string;
  isFocused?: boolean;
  tabs: WorkspaceDesktopTabRowItem[];
  normalizedServerId: string;
  normalizedWorkspaceId: string;
  setHoveredCloseTabKey: Dispatch<SetStateAction<string | null>>;
  onNavigateTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => Promise<void> | void;
  onCopyResumeCommand: (agentId: string) => Promise<void> | void;
  onCopyAgentId: (agentId: string) => Promise<void> | void;
  onReloadAgent: (agentId: string) => Promise<void> | void;
  onClearTerminalOutput?: (terminalId: string) => Promise<void> | void;
  onRenameTab: (tab: WorkspaceTabDescriptor) => void;
  onCloseTabsToLeft: (tabId: string) => Promise<void> | void;
  onCloseTabsToRight: (tabId: string) => Promise<void> | void;
  onCloseOtherTabs: (tabId: string) => Promise<void> | void;
  onCreateDraftTab: (input: { paneId?: string }) => void;
  onCreateTerminalTab: (input: { paneId?: string }) => void;
  onCreateBrowserTab: (input: { paneId?: string }) => void;
  onCreateFilesTab?: (input: { paneId?: string }) => void;
  onCreateTasksTab?: (input: { paneId?: string }) => void;
  onCreateNotesTab?: (input: { paneId?: string }) => void;
  showCreateAgentTab?: boolean;
  showCreateTerminalTab?: boolean;
  showCreateBrowserTab?: boolean;
  showCreateFilesTab?: boolean;
  showCreateTasksTab?: boolean;
  showCreateNotesTab?: boolean;
  disableCreateTerminal?: boolean;
  isWaitingOnTerminalReadiness?: boolean;
  onReorderTabs: (nextTabs: WorkspaceTabDescriptor[]) => void;
  onSplitRight: () => void;
  onSplitDown: () => void;
  externalDndContext?: boolean;
  activeDragTabId?: string | null;
  tabDropPreviewIndex?: number | null;
  showPaneSplitActions?: boolean;
}

interface WorkspaceDesktopTabsRowActionsProps {
  paneId?: string;
  onLayout: (event: LayoutChangeEvent) => void;
  onCreateDraftTab: (input: { paneId?: string }) => void;
  onCreateTerminalTab: (input: { paneId?: string }) => void;
  onCreateBrowserTab: (input: { paneId?: string }) => void;
  onCreateFilesTab?: (input: { paneId?: string }) => void;
  onCreateTasksTab?: (input: { paneId?: string }) => void;
  onCreateNotesTab?: (input: { paneId?: string }) => void;
  showCreateAgentTab: boolean;
  showCreateTerminalTab: boolean;
  showCreateBrowserTab: boolean;
  showCreateFilesTab: boolean;
  showCreateTasksTab: boolean;
  showCreateNotesTab: boolean;
  disableCreateTerminal: boolean;
  isWaitingOnTerminalReadiness: boolean;
  collapseCreateActions: boolean;
  showPaneSplitActions: boolean;
  onSplitRight: () => void;
  onSplitDown: () => void;
}

interface NewTabActionsProps {
  paneId?: string;
  onCreateDraftTab: (input: { paneId?: string }) => void;
  onCreateTerminalTab: (input: { paneId?: string }) => void;
  onCreateBrowserTab: (input: { paneId?: string }) => void;
  onCreateFilesTab?: (input: { paneId?: string }) => void;
  onCreateTasksTab?: (input: { paneId?: string }) => void;
  onCreateNotesTab?: (input: { paneId?: string }) => void;
  showCreateAgentTab: boolean;
  showCreateTerminalTab: boolean;
  showCreateBrowserTab: boolean;
  showCreateFilesTab: boolean;
  showCreateTasksTab: boolean;
  showCreateNotesTab: boolean;
  disableCreateTerminal: boolean;
  isWaitingOnTerminalReadiness: boolean;
}

type NewTabActionIcon = "agent" | "terminal" | "browser" | "files" | "tasks" | "notes";

function getFallbackTabLabel(tab: WorkspaceTabDescriptor): string {
  if (tab.target.kind === "draft") {
    return "New Agent";
  }
  if (tab.target.kind === "setup") {
    return "Setup";
  }
  if (tab.target.kind === "terminal") {
    return "Terminal";
  }
  if (tab.target.kind === "browser") {
    return "Browser";
  }
  if (tab.target.kind === "file") {
    return tab.target.path.split("/").findLast(Boolean) ?? tab.target.path;
  }
  if (tab.target.kind === "project-overview") {
    return "Overview";
  }
  if (tab.target.kind === "tasks") {
    return "Tasks";
  }
  if (tab.target.kind === "notes") {
    return "Notes";
  }
  if (tab.target.kind === "project-tasks") {
    return "Tasks";
  }
  if (tab.target.kind === "project-notes") {
    return "Notes";
  }
  if (tab.target.kind === "project-agents") {
    return "Agents";
  }
  if (tab.target.kind === "project-context") {
    return "Context";
  }
  if (tab.target.kind === "project-files") {
    return "Files";
  }
  return "Agent";
}

function getNewTabActionIcon(icon: NewTabActionIcon) {
  switch (icon) {
    case "agent":
      return <ThemedSquarePen size={14} uniProps={mutedColorMapping} />;
    case "terminal":
      return <ThemedSquareTerminal size={14} uniProps={mutedColorMapping} />;
    case "browser":
      return <ThemedGlobe size={14} uniProps={mutedColorMapping} />;
    case "files":
      return <ThemedFileText size={14} uniProps={mutedColorMapping} />;
    case "tasks":
      return <ThemedListTodo size={14} uniProps={mutedColorMapping} />;
    case "notes":
      return <ThemedNotebookText size={14} uniProps={mutedColorMapping} />;
  }
}

function NewTabActionButton({
  testID,
  label,
  tooltipLabel = label,
  shortcutKeys,
  icon,
  disabled,
  onPress,
}: {
  testID: string;
  label: string;
  tooltipLabel?: string;
  shortcutKeys?: ComponentProps<typeof Shortcut>["chord"] | null;
  icon: NewTabActionIcon;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Tooltip delayDuration={0} enabledOnDesktop enabledOnMobile={false}>
      <TooltipTrigger
        testID={testID}
        disabled={disabled}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={disabled ? newTabActionButtonDisabledStyle : newTabActionButtonStyle}
      >
        {getNewTabActionIcon(icon)}
      </TooltipTrigger>
      <TooltipContent side="bottom" align="center" offset={8}>
        <View style={styles.newTabTooltipRow}>
          <Text style={styles.newTabTooltipText}>{tooltipLabel}</Text>
          {shortcutKeys ? (
            <Shortcut chord={shortcutKeys} style={styles.newTabTooltipShortcut} />
          ) : null}
        </View>
      </TooltipContent>
    </Tooltip>
  );
}

function ExpandedNewTabActions({
  paneId,
  onCreateDraftTab,
  onCreateTerminalTab,
  onCreateBrowserTab,
  onCreateFilesTab,
  onCreateTasksTab,
  onCreateNotesTab,
  showCreateAgentTab,
  showCreateTerminalTab,
  showCreateBrowserTab,
  showCreateFilesTab,
  showCreateTasksTab,
  showCreateNotesTab,
  disableCreateTerminal,
  isWaitingOnTerminalReadiness,
}: NewTabActionsProps) {
  const newTabKeys = useShortcutKeys("workspace-tab-new");
  const newTerminalKeys = useShortcutKeys("workspace-terminal-new");
  const terminalDisabled = disableCreateTerminal || isWaitingOnTerminalReadiness;
  const handleCreateAgentTab = useCallback(() => {
    onCreateDraftTab({ paneId });
  }, [onCreateDraftTab, paneId]);
  const handleCreateTerminal = useCallback(() => {
    onCreateTerminalTab({ paneId });
  }, [onCreateTerminalTab, paneId]);
  const handleCreateBrowser = useCallback(() => {
    onCreateBrowserTab({ paneId });
  }, [onCreateBrowserTab, paneId]);
  const handleCreateFiles = useCallback(() => {
    onCreateFilesTab?.({ paneId });
  }, [onCreateFilesTab, paneId]);
  const handleCreateTasks = useCallback(() => {
    onCreateTasksTab?.({ paneId });
  }, [onCreateTasksTab, paneId]);
  const handleCreateNotes = useCallback(() => {
    onCreateNotesTab?.({ paneId });
  }, [onCreateNotesTab, paneId]);

  return (
    <>
      {showCreateAgentTab ? (
        <NewTabActionButton
          testID="workspace-new-agent-tab"
          label="New agent tab"
          tooltipLabel="New agent"
          shortcutKeys={newTabKeys}
          icon="agent"
          onPress={handleCreateAgentTab}
        />
      ) : null}
      {showCreateTerminalTab ? (
        <NewTabActionButton
          testID="workspace-new-terminal"
          label="New terminal"
          tooltipLabel={isWaitingOnTerminalReadiness ? "Preparing terminal..." : "New terminal"}
          shortcutKeys={newTerminalKeys}
          icon="terminal"
          disabled={terminalDisabled}
          onPress={handleCreateTerminal}
        />
      ) : null}
      {showCreateBrowserTab ? (
        <NewTabActionButton
          testID="workspace-new-browser"
          label="New browser tab"
          tooltipLabel="New browser"
          icon="browser"
          onPress={handleCreateBrowser}
        />
      ) : null}
      {showCreateFilesTab ? (
        <NewTabActionButton
          testID="workspace-new-files"
          label="New files tab"
          tooltipLabel="Files"
          icon="files"
          onPress={handleCreateFiles}
        />
      ) : null}
      {showCreateTasksTab ? (
        <NewTabActionButton
          testID="workspace-new-tasks"
          label="New tasks tab"
          tooltipLabel="Tasks"
          icon="tasks"
          onPress={handleCreateTasks}
        />
      ) : null}
      {showCreateNotesTab ? (
        <NewTabActionButton
          testID="workspace-new-notes"
          label="New notes tab"
          tooltipLabel="Notes"
          icon="notes"
          onPress={handleCreateNotes}
        />
      ) : null}
    </>
  );
}

function ProjectContentDropdownItems({
  showSeparator,
  showCreateFilesTab,
  showCreateTasksTab,
  showCreateNotesTab,
  handleCreateFiles,
  handleCreateTasks,
  handleCreateNotes,
}: {
  showSeparator: boolean;
  showCreateFilesTab: boolean;
  showCreateTasksTab: boolean;
  showCreateNotesTab: boolean;
  handleCreateFiles: () => void;
  handleCreateTasks: () => void;
  handleCreateNotes: () => void;
}) {
  return (
    <>
      {showSeparator ? <DropdownMenuSeparator /> : null}
      {showCreateFilesTab ? (
        <DropdownMenuItem
          testID="workspace-new-files"
          leading={filesLeadingIcon}
          onSelect={handleCreateFiles}
        >
          Files
        </DropdownMenuItem>
      ) : null}
      {showCreateTasksTab ? (
        <DropdownMenuItem
          testID="workspace-new-tasks"
          leading={tasksLeadingIcon}
          onSelect={handleCreateTasks}
        >
          Tasks
        </DropdownMenuItem>
      ) : null}
      {showCreateNotesTab ? (
        <DropdownMenuItem
          testID="workspace-new-notes"
          leading={notesLeadingIcon}
          onSelect={handleCreateNotes}
        >
          Notes
        </DropdownMenuItem>
      ) : null}
    </>
  );
}

function NewTabDropdown({
  paneId,
  onCreateDraftTab,
  onCreateTerminalTab,
  onCreateBrowserTab,
  onCreateFilesTab,
  onCreateTasksTab,
  onCreateNotesTab,
  showCreateAgentTab,
  showCreateTerminalTab,
  showCreateBrowserTab,
  showCreateFilesTab,
  showCreateTasksTab,
  showCreateNotesTab,
  disableCreateTerminal,
  isWaitingOnTerminalReadiness,
}: NewTabActionsProps) {
  const newTabKeys = useShortcutKeys("workspace-tab-new");
  const newTerminalKeys = useShortcutKeys("workspace-terminal-new");
  const terminalDisabled = disableCreateTerminal || isWaitingOnTerminalReadiness;
  const handleCreateAgentTab = useCallback(() => {
    onCreateDraftTab({ paneId });
  }, [onCreateDraftTab, paneId]);
  const handleCreateTerminal = useCallback(() => {
    onCreateTerminalTab({ paneId });
  }, [onCreateTerminalTab, paneId]);
  const handleCreateBrowser = useCallback(() => {
    onCreateBrowserTab({ paneId });
  }, [onCreateBrowserTab, paneId]);
  const handleCreateFiles = useCallback(() => {
    onCreateFilesTab?.({ paneId });
  }, [onCreateFilesTab, paneId]);
  const handleCreateTasks = useCallback(() => {
    onCreateTasksTab?.({ paneId });
  }, [onCreateTasksTab, paneId]);
  const handleCreateNotes = useCallback(() => {
    onCreateNotesTab?.({ paneId });
  }, [onCreateNotesTab, paneId]);
  const newAgentShortcut = useMemo(
    () =>
      newTabKeys ? <Shortcut chord={newTabKeys} style={styles.newTabTooltipShortcut} /> : null,
    [newTabKeys],
  );
  const newTerminalShortcut = useMemo(
    () =>
      newTerminalKeys ? (
        <Shortcut chord={newTerminalKeys} style={styles.newTabTooltipShortcut} />
      ) : null,
    [newTerminalKeys],
  );
  const hasCreateActions =
    showCreateAgentTab ||
    showCreateTerminalTab ||
    showCreateBrowserTab ||
    showCreateFilesTab ||
    showCreateTasksTab ||
    showCreateNotesTab;
  const hasProjectContentActions = showCreateFilesTab || showCreateTasksTab || showCreateNotesTab;
  const hasRuntimeCreateActions =
    showCreateAgentTab || showCreateTerminalTab || showCreateBrowserTab;

  if (!hasCreateActions) {
    return null;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        testID="workspace-new-tab-menu"
        accessibilityRole="button"
        accessibilityLabel="New tab"
        style={newTabMenuTriggerStyle}
      >
        <ThemedPlus size={14} uniProps={mutedColorMapping} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" width={220}>
        {showCreateAgentTab ? (
          <DropdownMenuItem
            testID="workspace-new-agent-tab"
            leading={newAgentLeadingIcon}
            trailing={newAgentShortcut}
            onSelect={handleCreateAgentTab}
          >
            New agent
          </DropdownMenuItem>
        ) : null}
        {showCreateTerminalTab ? (
          <DropdownMenuItem
            testID="workspace-new-terminal"
            disabled={terminalDisabled}
            leading={newTerminalLeadingIcon}
            trailing={newTerminalShortcut}
            tooltip={isWaitingOnTerminalReadiness ? "Preparing terminal..." : undefined}
            onSelect={handleCreateTerminal}
          >
            {isWaitingOnTerminalReadiness ? "Preparing terminal..." : "New terminal"}
          </DropdownMenuItem>
        ) : null}
        {showCreateBrowserTab ? (
          <DropdownMenuItem
            testID="workspace-new-browser"
            leading={newBrowserLeadingIcon}
            onSelect={handleCreateBrowser}
          >
            New browser
          </DropdownMenuItem>
        ) : null}
        {hasProjectContentActions ? (
          <ProjectContentDropdownItems
            showSeparator={hasRuntimeCreateActions}
            showCreateFilesTab={showCreateFilesTab}
            showCreateTasksTab={showCreateTasksTab}
            showCreateNotesTab={showCreateNotesTab}
            handleCreateFiles={handleCreateFiles}
            handleCreateTasks={handleCreateTasks}
            handleCreateNotes={handleCreateNotes}
          />
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function WorkspaceDesktopTabsRowActions({
  paneId,
  onLayout,
  onCreateDraftTab,
  onCreateTerminalTab,
  onCreateBrowserTab,
  onCreateFilesTab,
  onCreateTasksTab,
  onCreateNotesTab,
  showCreateAgentTab,
  showCreateTerminalTab,
  showCreateBrowserTab,
  showCreateFilesTab,
  showCreateTasksTab,
  showCreateNotesTab,
  disableCreateTerminal,
  isWaitingOnTerminalReadiness,
  collapseCreateActions,
  showPaneSplitActions,
  onSplitRight,
  onSplitDown,
}: WorkspaceDesktopTabsRowActionsProps) {
  const splitRightKeys = useShortcutKeys("workspace-pane-split-right");
  const splitDownKeys = useShortcutKeys("workspace-pane-split-down");

  return (
    <View style={styles.tabsActions} onLayout={onLayout}>
      {collapseCreateActions ? (
        <NewTabDropdown
          paneId={paneId}
          onCreateDraftTab={onCreateDraftTab}
          onCreateTerminalTab={onCreateTerminalTab}
          onCreateBrowserTab={onCreateBrowserTab}
          onCreateFilesTab={onCreateFilesTab}
          onCreateTasksTab={onCreateTasksTab}
          onCreateNotesTab={onCreateNotesTab}
          showCreateAgentTab={showCreateAgentTab}
          showCreateTerminalTab={showCreateTerminalTab}
          showCreateBrowserTab={showCreateBrowserTab}
          showCreateFilesTab={showCreateFilesTab}
          showCreateTasksTab={showCreateTasksTab}
          showCreateNotesTab={showCreateNotesTab}
          disableCreateTerminal={disableCreateTerminal}
          isWaitingOnTerminalReadiness={isWaitingOnTerminalReadiness}
        />
      ) : (
        <ExpandedNewTabActions
          paneId={paneId}
          onCreateDraftTab={onCreateDraftTab}
          onCreateTerminalTab={onCreateTerminalTab}
          onCreateBrowserTab={onCreateBrowserTab}
          onCreateFilesTab={onCreateFilesTab}
          onCreateTasksTab={onCreateTasksTab}
          onCreateNotesTab={onCreateNotesTab}
          showCreateAgentTab={showCreateAgentTab}
          showCreateTerminalTab={showCreateTerminalTab}
          showCreateBrowserTab={showCreateBrowserTab}
          showCreateFilesTab={showCreateFilesTab}
          showCreateTasksTab={showCreateTasksTab}
          showCreateNotesTab={showCreateNotesTab}
          disableCreateTerminal={disableCreateTerminal}
          isWaitingOnTerminalReadiness={isWaitingOnTerminalReadiness}
        />
      )}
      {showPaneSplitActions ? (
        <>
          <Tooltip delayDuration={0} enabledOnDesktop enabledOnMobile={false}>
            <TooltipTrigger
              onPress={onSplitRight}
              accessibilityRole="button"
              accessibilityLabel="Split pane right"
              style={newTabActionButtonStyle}
            >
              <ThemedColumns2 size={14} uniProps={mutedColorMapping} />
            </TooltipTrigger>
            <TooltipContent side="bottom" align="center" offset={8}>
              <View style={styles.newTabTooltipRow}>
                <Text style={styles.newTabTooltipText}>Split pane right</Text>
                {splitRightKeys ? (
                  <Shortcut chord={splitRightKeys} style={styles.newTabTooltipShortcut} />
                ) : null}
              </View>
            </TooltipContent>
          </Tooltip>
          <Tooltip delayDuration={0} enabledOnDesktop enabledOnMobile={false}>
            <TooltipTrigger
              onPress={onSplitDown}
              accessibilityRole="button"
              accessibilityLabel="Split pane down"
              style={newTabActionButtonStyle}
            >
              <ThemedRows2 size={14} uniProps={mutedColorMapping} />
            </TooltipTrigger>
            <TooltipContent side="bottom" align="center" offset={8}>
              <View style={styles.newTabTooltipRow}>
                <Text style={styles.newTabTooltipText}>Split pane down</Text>
                {splitDownKeys ? (
                  <Shortcut chord={splitDownKeys} style={styles.newTabTooltipShortcut} />
                ) : null}
              </View>
            </TooltipContent>
          </Tooltip>
        </>
      ) : null}
    </View>
  );
}

function useMiddleClickClose(onClose: () => void) {
  const ref = useRef<View>(null);

  useEffect(() => {
    if (isNative) return;
    const node = ref.current as unknown as HTMLElement | null;
    if (!node) return;

    function handleAuxClick(event: MouseEvent) {
      if (event.button === 1) {
        event.preventDefault();
        onClose();
      }
    }

    node.addEventListener("auxclick", handleAuxClick);
    return () => node.removeEventListener("auxclick", handleAuxClick);
  }, [onClose]);

  return ref;
}

function TabHandleContent({
  presentation,
  isHighlighted,
  showLabel,
  tabLabelSkeletonStyle,
  tabLabelStyle,
}: {
  presentation: WorkspaceTabPresentation;
  isHighlighted: boolean;
  showLabel: boolean;
  tabLabelSkeletonStyle: React.ComponentProps<typeof View>["style"];
  tabLabelStyle: React.ComponentProps<typeof Text>["style"];
}) {
  return (
    <View style={styles.tabHandle}>
      <View style={styles.tabIcon}>
        <WorkspaceTabIcon presentation={presentation} active={isHighlighted} />
      </View>
      {showLabel && presentation.titleState === "loading" ? (
        <View style={tabLabelSkeletonStyle} />
      ) : null}
      {showLabel && presentation.titleState !== "loading" ? (
        <Text style={tabLabelStyle} selectable={false} numberOfLines={1} ellipsizeMode="tail">
          {presentation.label}
        </Text>
      ) : null}
    </View>
  );
}

function TabChip({
  tab,
  isActive,
  isDragging,
  isFocused,
  resolvedTabWidth,
  showLabel,
  showCloseButton,
  isCloseHovered,
  isClosingTab,
  presentation,
  tooltipLabel,
  resolvedTab,
  setHoveredCloseTabKey,
  onNavigateTab,
  onCloseTab,
  dragHandleProps,
}: {
  tab: WorkspaceTabDescriptor;
  isActive: boolean;
  isDragging: boolean;
  isFocused: boolean;
  resolvedTabWidth: number;
  showLabel: boolean;
  showCloseButton: boolean;
  isCloseHovered: boolean;
  isClosingTab: boolean;
  presentation: WorkspaceTabPresentation;
  tooltipLabel: string;
  resolvedTab: WorkspaceDesktopTabActions;
  setHoveredCloseTabKey: Dispatch<SetStateAction<string | null>>;
  onNavigateTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => Promise<void> | void;
  dragHandleProps: DraggableListDragHandleProps | undefined;
}) {
  const { closeButtonTestId, contextMenuTestId, menuEntries } = resolvedTab;
  const middleClickRef = useMiddleClickClose(
    useCallback(() => void onCloseTab(tab.tabId), [onCloseTab, tab.tabId]),
  );
  const [hovered, setHovered] = useState(false);
  const isHighlighted = isActive || hovered || isCloseHovered;
  const closeButtonDragBlockers = isWeb
    ? ({
        onPointerDown: (event: { stopPropagation?: () => void }) => {
          event.stopPropagation?.();
        },
        onMouseDown: (event: { stopPropagation?: () => void }) => {
          event.stopPropagation?.();
        },
      } as const)
    : undefined;

  const tabChipStyle = useCallback(
    () => [
      styles.tab,
      isWeb && isDragging && ({ cursor: "grabbing" } as object),
      {
        minWidth: resolvedTabWidth,
        width: resolvedTabWidth,
        maxWidth: resolvedTabWidth,
      },
    ],
    [isDragging, resolvedTabWidth],
  );

  const handleTabHoverIn = useCallback(() => {
    setHovered(true);
  }, []);

  const handleTabHoverOut = useCallback(() => {
    setHovered(false);
  }, []);

  const handleNavigateTab = useCallback(() => {
    onNavigateTab(tab.tabId);
  }, [onNavigateTab, tab.tabId]);

  const handleCloseButtonPressIn = useCallback((event: { stopPropagation?: () => void }) => {
    event.stopPropagation?.();
  }, []);

  const handleCloseButtonHoverIn = useCallback(() => {
    setHoveredCloseTabKey(tab.key);
  }, [setHoveredCloseTabKey, tab.key]);

  const handleCloseButtonHoverOut = useCallback(() => {
    setHoveredCloseTabKey((current) => (current === tab.key ? null : current));
  }, [setHoveredCloseTabKey, tab.key]);

  const handleCloseButtonPress = useCallback(
    (event: { stopPropagation?: () => void }) => {
      event.stopPropagation?.();
      void onCloseTab(tab.tabId);
    },
    [onCloseTab, tab.tabId],
  );

  const closeButtonStyle = useCallback(
    ({ hovered: isButtonHovered, pressed }: PressableStateCallbackType & { hovered?: boolean }) => [
      styles.tabCloseButton,
      styles.tabCloseButtonShown,
      (Boolean(isButtonHovered) || pressed) && styles.tabCloseButtonActive,
    ],
    [],
  );

  const tabAccessibilityState = useMemo(() => ({ selected: isActive }), [isActive]);
  const tabFocusIndicatorStyle = useMemo(
    () => [styles.tabFocusIndicator, !isFocused && styles.tabFocusIndicatorUnfocused],
    [isFocused],
  );
  const tabLabelSkeletonStyle = useMemo(
    () => [styles.tabLabelSkeleton, showCloseButton && styles.tabLabelSkeletonWithCloseButton],
    [showCloseButton],
  );
  const tabLabelStyle = useMemo(
    () => [
      styles.tabLabel,
      isHighlighted && styles.tabLabelActive,
      showCloseButton && styles.tabLabelWithCloseButton,
    ],
    [isHighlighted, showCloseButton],
  );

  return (
    <View ref={middleClickRef}>
      <ContextMenu key={tab.key}>
        <Tooltip delayDuration={400} enabledOnDesktop enabledOnMobile={false}>
          <TooltipTrigger asChild triggerRefProp="triggerRef">
            <ContextMenuTrigger
              {...(dragHandleProps?.attributes as object | undefined)}
              {...(dragHandleProps?.listeners as object | undefined)}
              testID={`workspace-tab-${buildDeterministicWorkspaceTabId(tab.target)}`}
              triggerRef={dragHandleProps?.setActivatorNodeRef as unknown as undefined}
              enabledOnMobile={false}
              style={tabChipStyle}
              onHoverIn={handleTabHoverIn}
              onHoverOut={handleTabHoverOut}
              onPressIn={handleNavigateTab}
              onPress={handleNavigateTab}
              accessibilityRole="button"
              accessibilityLabel={tooltipLabel}
              accessibilityState={tabAccessibilityState}
              aria-selected={isActive}
            >
              {isActive && <View style={tabFocusIndicatorStyle} />}
              <TabHandleContent
                presentation={presentation}
                isHighlighted={isHighlighted}
                showLabel={showLabel}
                tabLabelSkeletonStyle={tabLabelSkeletonStyle}
                tabLabelStyle={tabLabelStyle}
              />

              {showCloseButton ? (
                <Pressable
                  {...(closeButtonDragBlockers as object | undefined)}
                  testID={closeButtonTestId}
                  disabled={isClosingTab}
                  onPressIn={handleCloseButtonPressIn}
                  onHoverIn={handleCloseButtonHoverIn}
                  onHoverOut={handleCloseButtonHoverOut}
                  onPress={handleCloseButtonPress}
                  style={closeButtonStyle}
                >
                  {({ hovered: closeHovered, pressed }) =>
                    isClosingTab ? (
                      <ThemedActivityIndicator
                        size={12}
                        uniProps={
                          closeHovered || pressed ? foregroundColorMapping : mutedColorMapping
                        }
                      />
                    ) : (
                      <ThemedX
                        size={12}
                        uniProps={
                          closeHovered || pressed ? foregroundColorMapping : mutedColorMapping
                        }
                      />
                    )
                  }
                </Pressable>
              ) : null}
            </ContextMenuTrigger>
          </TooltipTrigger>
          <TooltipContent side="bottom" align="center" offset={8}>
            {tab.target.kind === "agent" ? (
              <View style={styles.tooltipAgentRow}>
                <Text style={styles.newTabTooltipText}>{tooltipLabel}</Text>
                <Text style={styles.tooltipAgentId}>{tab.target.agentId.slice(0, 7)}</Text>
              </View>
            ) : (
              <Text style={styles.newTabTooltipText}>{tooltipLabel}</Text>
            )}
          </TooltipContent>
        </Tooltip>

        <ContextMenuContent align="start" width={DROPDOWN_WIDTH} testID={contextMenuTestId}>
          {menuEntries.map((entry) =>
            entry.kind === "separator" ? (
              <ContextMenuSeparator key={entry.key} />
            ) : (
              <TabContextMenuItem key={entry.key} entry={entry} />
            ),
          )}
        </ContextMenuContent>
      </ContextMenu>
    </View>
  );
}

export function WorkspaceDesktopTabsRow({
  paneId,
  isFocused = false,
  tabs,
  normalizedServerId,
  normalizedWorkspaceId,
  setHoveredCloseTabKey,
  onNavigateTab,
  onCloseTab,
  onCopyResumeCommand,
  onCopyAgentId,
  onReloadAgent,
  onClearTerminalOutput,
  onRenameTab,
  onCloseTabsToLeft,
  onCloseTabsToRight,
  onCloseOtherTabs,
  onCreateDraftTab,
  onCreateTerminalTab,
  onCreateBrowserTab,
  onCreateFilesTab,
  onCreateTasksTab,
  onCreateNotesTab,
  showCreateAgentTab = true,
  showCreateTerminalTab = true,
  showCreateBrowserTab = false,
  showCreateFilesTab = false,
  showCreateTasksTab = false,
  showCreateNotesTab = false,
  disableCreateTerminal = false,
  isWaitingOnTerminalReadiness = false,
  onReorderTabs,
  onSplitRight,
  onSplitDown,
  externalDndContext = false,
  activeDragTabId = null,
  tabDropPreviewIndex = null,
  showPaneSplitActions = true,
}: WorkspaceDesktopTabsRowProps) {
  const [tabsContainerWidth, setTabsContainerWidth] = useState<number>(0);
  const [tabsActionsWidth, setTabsActionsWidth] = useState<number>(0);
  const collapseCreateActions =
    tabsContainerWidth > 0 && tabsContainerWidth < COLLAPSED_NEW_TAB_ACTIONS_WIDTH;

  const handleTabsContainerLayout = useCallback((event: LayoutChangeEvent) => {
    const nextWidth = Math.round(event.nativeEvent.layout.width);
    setTabsContainerWidth((current) => (Math.abs(current - nextWidth) > 1 ? nextWidth : current));
  }, []);

  const handleTabsActionsLayout = useCallback((event: LayoutChangeEvent) => {
    const nextWidth = Math.round(event.nativeEvent.layout.width);
    setTabsActionsWidth((current) => (Math.abs(current - nextWidth) > 1 ? nextWidth : current));
  }, []);

  const layoutMetrics = useMemo(
    () => ({
      rowHorizontalInset: 0,
      actionsReservedWidth: Math.max(0, tabsActionsWidth),
      rowPaddingHorizontal: 0,
      tabGap: 0,
      maxTabWidth: 200,
      tabIconWidth: 14,
      tabHorizontalPadding: 12,
      estimatedCharWidth: 7,
      closeButtonWidth: 22,
    }),
    [tabsActionsWidth],
  );

  const tabLabelLengths = useMemo(
    () =>
      tabs.map((tab) => {
        const label = getFallbackTabLabel(tab.tab);
        return label.length;
      }),
    [tabs],
  );

  const { layout } = useWorkspaceTabLayout({
    tabLabelLengths,
    viewportWidthOverride: tabsContainerWidth > 0 ? tabsContainerWidth : null,
    metrics: layoutMetrics,
  });

  const handleDragEnd = useCallback(
    (nextTabs: WorkspaceDesktopTabRowItem[]) => {
      onReorderTabs(nextTabs.map((tab) => tab.tab));
    },
    [onReorderTabs],
  );

  const getTabDragData = useMemo(() => {
    if (!paneId) return undefined;
    return (tab: WorkspaceDesktopTabRowItem) => ({
      kind: "workspace-tab" as const,
      paneId,
      tabId: tab.tab.tabId,
    });
  }, [paneId]);

  const renderTab = useCallback(
    ({
      item,
      index,
      dragHandleProps,
      isActive,
    }: DraggableRenderItemInfo<WorkspaceDesktopTabRowItem>) => {
      const shouldShowCloseButton = layout.closeButtonPolicy === "all";
      const layoutItem = layout.items[index] ?? null;
      const resolvedTabWidth = layoutItem?.width ?? 150;
      const showLabel = layoutItem?.showLabel ?? true;
      const showDropIndicatorBefore = activeDragTabId !== null && tabDropPreviewIndex === index;
      const showDropIndicatorAfter =
        activeDragTabId !== null &&
        tabDropPreviewIndex === tabs.length &&
        index === tabs.length - 1;

      return (
        <ResolvedDesktopTabChip
          key={`${item.tab.key}:${item.tab.kind}`}
          item={item}
          isFocused={isFocused}
          isDragging={isActive}
          index={index}
          tabCount={tabs.length}
          normalizedServerId={normalizedServerId}
          normalizedWorkspaceId={normalizedWorkspaceId}
          onCopyResumeCommand={onCopyResumeCommand}
          onCopyAgentId={onCopyAgentId}
          onReloadAgent={onReloadAgent}
          onClearTerminalOutput={onClearTerminalOutput}
          onRenameTab={onRenameTab}
          onCloseTabsToLeft={onCloseTabsToLeft}
          onCloseTabsToRight={onCloseTabsToRight}
          onCloseOtherTabs={onCloseOtherTabs}
          resolvedTabWidth={resolvedTabWidth}
          showLabel={showLabel}
          showCloseButton={shouldShowCloseButton}
          setHoveredCloseTabKey={setHoveredCloseTabKey}
          onNavigateTab={onNavigateTab}
          onCloseTab={onCloseTab}
          dragHandleProps={dragHandleProps}
          showDropIndicatorBefore={showDropIndicatorBefore}
          showDropIndicatorAfter={showDropIndicatorAfter}
        />
      );
    },
    [
      activeDragTabId,
      isFocused,
      layout.closeButtonPolicy,
      layout.items,
      normalizedServerId,
      normalizedWorkspaceId,
      onCloseOtherTabs,
      onCloseTab,
      onCloseTabsToLeft,
      onCloseTabsToRight,
      onCopyAgentId,
      onCopyResumeCommand,
      onClearTerminalOutput,
      onNavigateTab,
      onReloadAgent,
      onRenameTab,
      setHoveredCloseTabKey,
      tabDropPreviewIndex,
      tabs.length,
    ],
  );

  const tabsScrollStyle = useMemo(
    () => [
      styles.tabsScroll,
      layout.requiresHorizontalScrollFallback
        ? styles.tabsScrollOverflow
        : styles.tabsScrollFitContent,
    ],
    [layout.requiresHorizontalScrollFallback],
  );

  const row = (
    <View
      style={styles.tabsContainer}
      testID="workspace-tabs-row"
      onLayout={handleTabsContainerLayout}
    >
      <ScrollView
        horizontal
        scrollEnabled={layout.requiresHorizontalScrollFallback}
        testID="workspace-tabs-scroll"
        style={tabsScrollStyle}
        contentContainerStyle={styles.tabsContent}
        showsHorizontalScrollIndicator={false}
      >
        <SortableInlineList
          data={tabs}
          keyExtractor={tabKeyExtractor}
          useDragHandle
          disabled={!externalDndContext && tabs.length < 2}
          onDragEnd={handleDragEnd}
          externalDndContext={externalDndContext}
          activeId={activeDragTabId}
          getItemData={getTabDragData}
          renderItem={renderTab}
        />
      </ScrollView>
      <WorkspaceDesktopTabsRowActions
        paneId={paneId}
        onLayout={handleTabsActionsLayout}
        onCreateDraftTab={onCreateDraftTab}
        onCreateTerminalTab={onCreateTerminalTab}
        onCreateBrowserTab={onCreateBrowserTab}
        onCreateFilesTab={onCreateFilesTab}
        onCreateTasksTab={onCreateTasksTab}
        onCreateNotesTab={onCreateNotesTab}
        showCreateAgentTab={showCreateAgentTab}
        showCreateTerminalTab={showCreateTerminalTab}
        showCreateBrowserTab={showCreateBrowserTab}
        showCreateFilesTab={showCreateFilesTab}
        showCreateTasksTab={showCreateTasksTab}
        showCreateNotesTab={showCreateNotesTab}
        disableCreateTerminal={disableCreateTerminal}
        isWaitingOnTerminalReadiness={isWaitingOnTerminalReadiness}
        collapseCreateActions={collapseCreateActions}
        showPaneSplitActions={showPaneSplitActions}
        onSplitRight={onSplitRight}
        onSplitDown={onSplitDown}
      />
    </View>
  );

  return <RenderProfile id="WorkspaceDesktopTabsRow">{row}</RenderProfile>;
}
function ResolvedDesktopTabChip({
  item,
  isFocused,
  isDragging,
  index,
  tabCount,
  normalizedServerId,
  normalizedWorkspaceId,
  onCopyResumeCommand,
  onCopyAgentId,
  onReloadAgent,
  onClearTerminalOutput,
  onRenameTab,
  onCloseTabsToLeft,
  onCloseTabsToRight,
  onCloseOtherTabs,
  resolvedTabWidth,
  showLabel,
  showCloseButton,
  setHoveredCloseTabKey,
  onNavigateTab,
  onCloseTab,
  dragHandleProps,
  showDropIndicatorBefore,
  showDropIndicatorAfter,
}: {
  item: WorkspaceDesktopTabRowItem;
  isFocused: boolean;
  isDragging: boolean;
  index: number;
  tabCount: number;
  normalizedServerId: string;
  normalizedWorkspaceId: string;
  onCopyResumeCommand: (agentId: string) => Promise<void> | void;
  onCopyAgentId: (agentId: string) => Promise<void> | void;
  onReloadAgent: (agentId: string) => Promise<void> | void;
  onClearTerminalOutput?: (terminalId: string) => Promise<void> | void;
  onRenameTab: (tab: WorkspaceTabDescriptor) => void;
  onCloseTabsToLeft: (tabId: string) => Promise<void> | void;
  onCloseTabsToRight: (tabId: string) => Promise<void> | void;
  onCloseOtherTabs: (tabId: string) => Promise<void> | void;
  resolvedTabWidth: number;
  showLabel: boolean;
  showCloseButton: boolean;
  setHoveredCloseTabKey: Dispatch<SetStateAction<string | null>>;
  onNavigateTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => Promise<void> | void;
  dragHandleProps: DraggableListDragHandleProps | undefined;
  showDropIndicatorBefore: boolean;
  showDropIndicatorAfter: boolean;
}) {
  const resolvedTab = useMemo(
    () =>
      buildWorkspaceDesktopTabActions({
        tab: item.tab,
        index,
        tabCount,
        onCopyResumeCommand,
        onCopyAgentId,
        onReloadAgent,
        onClearTerminalOutput,
        onRenameTab,
        onCloseTab,
        onCloseTabsToLeft,
        onCloseTabsToRight,
        onCloseOtherTabs,
      }),
    [
      index,
      item.tab,
      onCloseOtherTabs,
      onCloseTab,
      onCloseTabsToLeft,
      onCloseTabsToRight,
      onCopyAgentId,
      onCopyResumeCommand,
      onClearTerminalOutput,
      onReloadAgent,
      onRenameTab,
      tabCount,
    ],
  );

  return (
    <WorkspaceTabPresentationResolver
      tab={item.tab}
      serverId={normalizedServerId}
      workspaceId={normalizedWorkspaceId}
    >
      {(presentation) => {
        const tooltipLabel =
          presentation.titleState === "loading" ? "Loading agent title" : presentation.label;

        return (
          <View style={styles.tabSlot}>
            {showDropIndicatorBefore ? <View style={TAB_DROP_INDICATOR_BEFORE_STYLE} /> : null}
            <TabChip
              tab={item.tab}
              isActive={item.isActive}
              isDragging={isDragging}
              isFocused={isFocused}
              resolvedTabWidth={resolvedTabWidth}
              showLabel={showLabel}
              showCloseButton={showCloseButton}
              isCloseHovered={item.isCloseHovered}
              isClosingTab={item.isClosingTab}
              presentation={presentation}
              tooltipLabel={tooltipLabel}
              resolvedTab={resolvedTab}
              setHoveredCloseTabKey={setHoveredCloseTabKey}
              onNavigateTab={onNavigateTab}
              onCloseTab={onCloseTab}
              dragHandleProps={dragHandleProps}
            />
            {showDropIndicatorAfter ? <View style={TAB_DROP_INDICATOR_AFTER_STYLE} /> : null}
          </View>
        );
      }}
    </WorkspaceTabPresentationResolver>
  );
}

const styles = StyleSheet.create((theme) => ({
  tabsContainer: {
    minWidth: 0,
    height: WORKSPACE_SECONDARY_HEADER_HEIGHT,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    backgroundColor: theme.colors.surface0,
    flexDirection: "row",
    alignItems: "center",
    overflow: "visible",
  },
  tabsScroll: {
    minWidth: 0,
  },
  tabsScrollFitContent: {
    flex: 1,
  },
  tabsScrollOverflow: {
    flex: 1,
  },
  tabsContent: {
    flexDirection: "row",
    alignItems: "stretch",
  },
  tabsActions: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: theme.spacing[2],
  },
  tab: {
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    borderRightWidth: 1,
    borderRightColor: theme.colors.border,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    userSelect: "none",
  },
  tabSlot: {
    position: "relative",
    overflow: "visible",
  },
  tabHandle: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    flex: 1,
    minWidth: 0,
    userSelect: "none",
  },
  tabIcon: {
    flexShrink: 0,
  },
  tabFocusIndicator: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: theme.colors.accent,
  },
  tabFocusIndicatorUnfocused: {
    backgroundColor: theme.colors.borderAccent,
  },
  tabDropIndicator: {
    position: "absolute",
    top: theme.spacing[2],
    bottom: theme.spacing[2],
    width: 5,
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.accent,
    zIndex: 10,
    pointerEvents: "none",
  },
  tabDropIndicatorBefore: {
    left: -3,
  },
  tabDropIndicatorAfter: {
    right: -3,
  },
  tabLabel: {
    flexShrink: 1,
    minWidth: 0,
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.normal,
    userSelect: "none",
  },
  tabLabelSkeleton: {
    width: 96,
    maxWidth: "100%",
    flexShrink: 1,
    minWidth: 0,
    height: 10,
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.surface3,
    opacity: 0.9,
  },
  tabLabelSkeletonWithCloseButton: {
    width: LOADING_TAB_LABEL_SKELETON_WIDTH,
  },
  tabLabelWithCloseButton: {
    paddingRight: 0,
  },
  tabLabelActive: {
    color: theme.colors.foreground,
  },
  tabCloseButton: {
    width: 18,
    height: 18,
    marginLeft: 0,
    borderRadius: theme.borderRadius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  tabCloseButtonShown: {
    opacity: 1,
  },
  tabCloseButtonActive: {
    backgroundColor: theme.colors.surface3,
  },
  newTabActionButton: {
    width: 22,
    height: 22,
    borderRadius: theme.borderRadius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  newTabActionButtonDisabled: {
    opacity: 0.5,
  },
  newTabActionButtonHovered: {
    backgroundColor: theme.colors.surface2,
  },
  newTabTooltipText: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
  },
  newTabTooltipRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  newTabTooltipShortcut: {},
  tooltipAgentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  tooltipAgentId: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
  menuItemHint: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
}));

const TAB_DROP_INDICATOR_BEFORE_STYLE = [styles.tabDropIndicator, styles.tabDropIndicatorBefore];
const TAB_DROP_INDICATOR_AFTER_STYLE = [styles.tabDropIndicator, styles.tabDropIndicatorAfter];
