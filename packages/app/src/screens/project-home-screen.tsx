import { useCallback, useEffect, useMemo } from "react";
import { Pressable, ScrollView, Text, View, type PressableStateCallbackType } from "react-native";
import { router } from "expo-router";
import {
  Bot,
  ChevronRight,
  FileText,
  Folder,
  Globe,
  ListTodo,
  NotebookText,
  Plus,
} from "lucide-react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { ProjectSurfaceHeader } from "@/components/project-surface-header";
import { Button } from "@/components/ui/button";
import { useProjectGroups } from "@/hooks/use-project-groups";
import { useHostProjects, type HostProjectListItem } from "@/projects/host-projects";
import { resolveProjectLaunchTarget } from "@/projects/project-launch-target";
import { createWorkspaceBrowser } from "@/stores/browser-store";
import { generateDraftId } from "@/stores/draft-keys";
import { useProjectSelectionStore } from "@/stores/project-selection-store";
import { useSessionStore, type Agent } from "@/stores/session-store";
import type { WorkspaceTabTarget } from "@/stores/workspace-tabs-store";
import { settingsStyles } from "@/styles/settings";
import type { Theme } from "@/styles/theme";
import {
  buildHostNewProjectAgentRoute,
  buildHostProjectAgentsRoute,
  buildHostNewWorkspaceRoute,
  buildHostProjectFilesRoute,
  buildHostProjectNotesRoute,
  buildHostProjectTasksRoute,
  buildHostWorkspaceRoute,
} from "@/utils/host-routes";
import { navigateToAgent } from "@/utils/navigate-to-agent";

interface ProjectHomeScreenProps {
  serverId: string;
  groupId: string;
  embedded?: boolean;
  onOpenTab?: (target: WorkspaceTabTarget) => void;
}

const iconColorMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });
const ThemedBot = withUnistyles(Bot);
const ThemedChevronRight = withUnistyles(ChevronRight);
const ThemedFileText = withUnistyles(FileText);
const ThemedFolder = withUnistyles(Folder);
const ThemedGlobe = withUnistyles(Globe);
const ThemedListTodo = withUnistyles(ListTodo);
const ThemedNotebookText = withUnistyles(NotebookText);
const ThemedPlus = withUnistyles(Plus);

export function ProjectHomeScreen({
  serverId,
  groupId,
  embedded = false,
  onOpenTab,
}: ProjectHomeScreenProps) {
  const selectGroup = useProjectSelectionStore((state) => state.selectGroup);
  const projects = useHostProjects(serverId);
  const hostAgents = useSessionStore((state) => state.sessions[serverId]?.agents ?? null);
  const { groups, supported, canAddFromDisk, addFolderFromDisk } = useProjectGroups(serverId);

  useEffect(() => {
    if (serverId && groupId) {
      selectGroup(serverId, groupId);
    }
  }, [serverId, groupId, selectGroup]);

  const group = useMemo(
    () => groups.find((candidate) => candidate.groupId === groupId) ?? null,
    [groups, groupId],
  );
  const folders = useMemo(
    () => projects.filter((project) => project.projectGroupId === groupId),
    [projects, groupId],
  );
  const agents = useMemo(
    () =>
      Array.from(hostAgents?.values() ?? [])
        .filter((agent) => agent.projectGroupId === groupId && !agent.archivedAt)
        .sort((left, right) => right.lastActivityAt.getTime() - left.lastActivityAt.getTime()),
    [groupId, hostAgents],
  );

  const handleAddFolder = useCallback(() => {
    void addFolderFromDisk(groupId);
  }, [addFolderFromDisk, groupId]);
  const handleBrowseFiles = useCallback(() => {
    if (onOpenTab) {
      onOpenTab({ kind: "project-files", groupId });
      return;
    }
    router.navigate(buildHostProjectFilesRoute(serverId, groupId));
  }, [groupId, onOpenTab, serverId]);
  const handleBrowseTasks = useCallback(() => {
    if (onOpenTab) {
      onOpenTab({ kind: "tasks", groupId });
      return;
    }
    router.navigate(buildHostProjectTasksRoute(serverId, groupId));
  }, [groupId, onOpenTab, serverId]);
  const handleBrowseNotes = useCallback(() => {
    if (onOpenTab) {
      onOpenTab({ kind: "notes", groupId });
      return;
    }
    router.navigate(buildHostProjectNotesRoute(serverId, groupId));
  }, [groupId, onOpenTab, serverId]);
  const handleBrowseAgents = useCallback(() => {
    if (onOpenTab) {
      onOpenTab({ kind: "project-agents", groupId });
      return;
    }
    router.navigate(buildHostProjectAgentsRoute(serverId, groupId));
  }, [groupId, onOpenTab, serverId]);
  const launchCwd = useMemo(
    () => (group ? resolveProjectLaunchTarget({ group, folders }).cwd : undefined),
    [group, folders],
  );
  const handleNewAgent = useCallback(() => {
    if (onOpenTab) {
      onOpenTab({
        kind: "draft",
        draftId: generateDraftId(),
        cwd: launchCwd,
        projectGroupId: groupId,
      });
      return;
    }
    router.navigate(buildHostNewProjectAgentRoute(serverId, groupId));
  }, [launchCwd, groupId, onOpenTab, serverId]);
  const handleOpenBrowser = useCallback(() => {
    if (!onOpenTab) {
      return;
    }
    const { browserId } = createWorkspaceBrowser();
    onOpenTab({ kind: "browser", browserId });
  }, [onOpenTab]);

  if (!supported) {
    return (
      <View style={styles.container}>
        {embedded ? null : <ProjectSurfaceHeader title="Project" />}
        <View style={styles.centered}>
          <Text style={styles.emptyText}>Update the host to use Projects</Text>
        </View>
      </View>
    );
  }

  if (!group) {
    return (
      <View style={styles.container}>
        {embedded ? null : <ProjectSurfaceHeader title="Project" />}
        <View style={styles.centered}>
          <Text style={styles.emptyText}>Project not found</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {embedded ? null : <ProjectSurfaceHeader title={group.displayName} />}
      <ScrollView style={styles.scroll}>
        <View style={styles.content}>
          <View style={styles.heroSection}>
            <View style={styles.heroText}>
              <Text style={styles.heroTitle}>Work on {group.displayName}</Text>
              <Text style={styles.heroHint}>
                Open the Project tools as tabs, split them beside agents, and keep folder work in
                the same surface.
              </Text>
            </View>
            <View style={styles.launchpadGrid}>
              <LaunchpadAction
                label="New agent"
                description="Start delegated work"
                Icon={ThemedBot}
                onPress={handleNewAgent}
                testID="project-home-action-new-agent"
              />
              <LaunchpadAction
                label="Tasks"
                description="Open Project tasks"
                Icon={ThemedListTodo}
                onPress={handleBrowseTasks}
                testID="project-home-action-tasks"
              />
              <LaunchpadAction
                label="Notes"
                description="Open Project notes"
                Icon={ThemedNotebookText}
                onPress={handleBrowseNotes}
                testID="project-home-action-notes"
              />
              <LaunchpadAction
                label="Files"
                description="Browse Project files"
                Icon={ThemedFileText}
                onPress={handleBrowseFiles}
                testID="project-home-action-files"
              />
              <LaunchpadAction
                label="Agents"
                description={`${agents.length} active`}
                Icon={ThemedBot}
                onPress={handleBrowseAgents}
                testID="project-home-action-agents"
              />
              {onOpenTab ? (
                <LaunchpadAction
                  label="Browser"
                  description="Open a web context"
                  Icon={ThemedGlobe}
                  onPress={handleOpenBrowser}
                  testID="project-home-action-browser"
                />
              ) : null}
            </View>
          </View>

          {group.cwd ? (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionHeaderText}>
                  <Text style={settingsStyles.sectionHeaderTitle}>Project files</Text>
                  <Text style={styles.sectionHint}>
                    Owned notes, tasks, and Project metadata live here.
                  </Text>
                </View>
                <Button
                  variant="ghost"
                  size="xs"
                  leftIcon={ThemedFileText}
                  onPress={handleBrowseFiles}
                  testID="project-home-browse-files"
                >
                  Browse files
                </Button>
              </View>
              <ProjectDirectoryCard cwd={group.cwd} />
            </View>
          ) : null}

          <ProjectAgentsSection
            serverId={serverId}
            groupId={groupId}
            launchCwd={launchCwd}
            agents={agents}
            onOpenTab={onOpenTab}
          />

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionHeaderText}>
                <Text style={settingsStyles.sectionHeaderTitle}>Project folders</Text>
                <Text style={styles.sectionHint}>
                  External code directories attached to this Project.
                </Text>
              </View>
              {canAddFromDisk ? (
                <Button
                  variant="ghost"
                  size="xs"
                  leftIcon={ThemedPlus}
                  onPress={handleAddFolder}
                  testID="project-home-add-folder"
                >
                  Add folder
                </Button>
              ) : null}
            </View>
            <Text style={styles.folderCount}>
              {folders.length === 1 ? "1 folder" : `${folders.length} folders`}
            </Text>
            {folders.length > 0 ? (
              <View style={settingsStyles.card} testID="project-home-folders">
                {folders.map((folder, index) => (
                  <FolderRow
                    key={folder.projectKey}
                    serverId={serverId}
                    folder={folder}
                    isFirst={index === 0}
                  />
                ))}
              </View>
            ) : (
              <View style={EMPTY_CARD_STYLE} testID="project-home-empty">
                <Text style={styles.emptyText}>No folders yet</Text>
              </View>
            )}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

export function ProjectAgentsScreen({
  serverId,
  groupId,
  embedded = false,
  onOpenTab,
}: ProjectHomeScreenProps) {
  const selectGroup = useProjectSelectionStore((state) => state.selectGroup);
  const hostAgents = useSessionStore((state) => state.sessions[serverId]?.agents ?? null);
  const { groups, supported } = useProjectGroups(serverId);
  const projects = useHostProjects(serverId);
  const group = useMemo(
    () => groups.find((candidate) => candidate.groupId === groupId) ?? null,
    [groupId, groups],
  );
  const folders = useMemo(
    () => projects.filter((project) => project.projectGroupId === groupId),
    [projects, groupId],
  );
  const launchCwd = useMemo(
    () => (group ? resolveProjectLaunchTarget({ group, folders }).cwd : undefined),
    [group, folders],
  );
  const agents = useMemo(
    () =>
      Array.from(hostAgents?.values() ?? [])
        .filter((agent) => agent.projectGroupId === groupId && !agent.archivedAt)
        .sort((left, right) => right.lastActivityAt.getTime() - left.lastActivityAt.getTime()),
    [groupId, hostAgents],
  );
  useEffect(() => {
    if (serverId && groupId) {
      selectGroup(serverId, groupId);
    }
  }, [groupId, selectGroup, serverId]);

  if (!supported || !group) {
    return (
      <View style={styles.container}>
        {embedded ? null : <ProjectSurfaceHeader title="Project" />}
        <View style={styles.centered}>
          <Text style={styles.emptyText}>
            {supported ? "Project not found" : "Update the host to use Projects"}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {embedded ? null : <ProjectSurfaceHeader title={group.displayName} />}
      <ScrollView style={styles.scroll}>
        <View style={styles.content}>
          <ProjectAgentsSection
            serverId={serverId}
            groupId={groupId}
            launchCwd={launchCwd}
            agents={agents}
            onOpenTab={onOpenTab}
          />
        </View>
      </ScrollView>
    </View>
  );
}

function ProjectAgentsSection({
  serverId,
  groupId,
  agents,
  launchCwd,
  onOpenTab,
}: {
  serverId: string;
  groupId: string;
  launchCwd: string | null | undefined;
  agents: Agent[];
  onOpenTab?: (target: WorkspaceTabTarget) => void;
}) {
  const handleNewAgent = useCallback(() => {
    if (onOpenTab) {
      onOpenTab({
        kind: "draft",
        draftId: generateDraftId(),
        cwd: launchCwd,
        projectGroupId: groupId,
      });
      return;
    }
    router.navigate(buildHostNewProjectAgentRoute(serverId, groupId));
  }, [launchCwd, groupId, onOpenTab, serverId]);

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionHeaderText}>
          <Text style={settingsStyles.sectionHeaderTitle}>Project agents</Text>
          <Text style={styles.sectionHint}>
            Agents and delegated work attached to this Project.
          </Text>
        </View>
        <Button
          variant="ghost"
          size="xs"
          leftIcon={ThemedPlus}
          onPress={handleNewAgent}
          testID="project-home-new-agent"
        >
          New agent
        </Button>
      </View>
      <Text style={styles.folderCount}>
        {agents.length === 1 ? "1 active agent" : `${agents.length} active agents`}
      </Text>
      {agents.length > 0 ? (
        <View style={settingsStyles.card} testID="project-home-agents">
          {agents.map((agent, index) => (
            <ProjectAgentRow
              key={agent.id}
              serverId={serverId}
              agent={agent}
              isFirst={index === 0}
              onOpenTab={onOpenTab}
            />
          ))}
        </View>
      ) : (
        <View style={EMPTY_CARD_STYLE} testID="project-home-agents-empty">
          <Text style={styles.emptyText}>No active agents</Text>
        </View>
      )}
    </View>
  );
}

function ProjectAgentRow({
  serverId,
  agent,
  isFirst,
  onOpenTab,
}: {
  serverId: string;
  agent: Agent;
  isFirst: boolean;
  onOpenTab?: (target: WorkspaceTabTarget) => void;
}) {
  const handlePress = useCallback(() => {
    if (onOpenTab) {
      onOpenTab({ kind: "agent", agentId: agent.id });
      return;
    }
    navigateToAgent({ serverId, agentId: agent.id });
  }, [agent.id, onOpenTab, serverId]);
  const rowStyle = useCallback(
    ({ pressed, hovered }: PressableStateCallbackType & { hovered?: boolean }) => [
      settingsStyles.row,
      !isFirst && settingsStyles.rowBorder,
      styles.folderRow,
      hovered && styles.rowHovered,
      pressed && styles.rowPressed,
    ],
    [isFirst],
  );

  return (
    <Pressable
      style={rowStyle}
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={`Open ${agent.title ?? "agent"}`}
      testID={`project-home-agent-${agent.id}`}
    >
      <View style={styles.folderMain}>
        <ThemedBot size={16} uniProps={iconColorMapping} />
        <View style={styles.folderText}>
          <Text style={settingsStyles.rowTitle} numberOfLines={1}>
            {agent.title ?? "New session"}
          </Text>
          <Text style={settingsStyles.rowHint} numberOfLines={1}>
            {formatAgentStatus(agent.status)} - {agent.provider}
          </Text>
        </View>
      </View>
      <ThemedChevronRight size={16} uniProps={iconColorMapping} />
    </Pressable>
  );
}

function LaunchpadAction({
  label,
  description,
  Icon,
  onPress,
  testID,
}: {
  label: string;
  description: string;
  Icon: typeof ThemedBot;
  onPress: () => void;
  testID: string;
}) {
  const actionStyle = useCallback(
    ({ pressed, hovered }: PressableStateCallbackType & { hovered?: boolean }) => [
      styles.launchpadAction,
      hovered && styles.rowHovered,
      pressed && styles.rowPressed,
    ],
    [],
  );

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={actionStyle}
      testID={testID}
    >
      <View style={styles.launchpadIcon}>
        <Icon size={16} uniProps={iconColorMapping} />
      </View>
      <View style={styles.launchpadActionText}>
        <Text style={styles.launchpadActionLabel} numberOfLines={1}>
          {label}
        </Text>
        <Text style={styles.launchpadActionDescription} numberOfLines={1}>
          {description}
        </Text>
      </View>
    </Pressable>
  );
}

function formatAgentStatus(status: Agent["status"]): string {
  switch (status) {
    case "initializing":
      return "Starting";
    case "idle":
      return "Idle";
    case "running":
      return "Running";
    case "error":
      return "Error";
    case "closed":
      return "Closed";
  }
}

function ProjectDirectoryCard({ cwd }: { cwd: string }) {
  return (
    <View style={settingsStyles.card} testID="project-home-directory">
      <View style={settingsStyles.row}>
        <View style={styles.folderMain}>
          <ThemedFileText size={16} uniProps={iconColorMapping} />
          <View style={settingsStyles.rowContent}>
            <Text style={settingsStyles.rowTitle}>Paseo project directory</Text>
            <Text style={settingsStyles.rowHint} numberOfLines={2}>
              {cwd}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

function FolderRow({
  serverId,
  folder,
  isFirst,
}: {
  serverId: string;
  folder: HostProjectListItem;
  isFirst: boolean;
}) {
  const handlePress = useCallback(() => {
    const workspaceId = folder.workspaceKeys[0];
    if (workspaceId) {
      router.navigate(buildHostWorkspaceRoute(serverId, workspaceId));
      return;
    }
    router.navigate(
      buildHostNewWorkspaceRoute(serverId, folder.iconWorkingDir, {
        displayName: folder.projectName,
        projectId: folder.projectKey,
      }),
    );
  }, [folder, serverId]);

  const rowStyle = useCallback(
    ({ pressed, hovered }: PressableStateCallbackType & { hovered?: boolean }) => [
      settingsStyles.row,
      !isFirst && settingsStyles.rowBorder,
      styles.folderRow,
      hovered && styles.rowHovered,
      pressed && styles.rowPressed,
    ],
    [isFirst],
  );

  const workspaceCount = folder.workspaceKeys.length;
  const hint = workspaceCount === 1 ? "1 workspace" : `${workspaceCount} workspaces`;

  return (
    <Pressable
      style={rowStyle}
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={`Open ${folder.projectName}`}
      testID={`project-home-folder-${folder.projectKey}`}
    >
      <View style={styles.folderMain}>
        <ThemedFolder size={16} uniProps={iconColorMapping} />
        <View style={styles.folderText}>
          <Text style={settingsStyles.rowTitle} numberOfLines={1}>
            {folder.projectName}
          </Text>
          <Text style={settingsStyles.rowHint} numberOfLines={1}>
            {hint}
          </Text>
        </View>
      </View>
      <ThemedChevronRight size={16} uniProps={iconColorMapping} />
    </Pressable>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.surface0,
  },
  scroll: {
    flex: 1,
  },
  content: {
    width: "100%",
    maxWidth: 720,
    alignSelf: "center",
    padding: theme.spacing[6],
    gap: theme.spacing[6],
  },
  heroSection: {
    gap: theme.spacing[4],
  },
  heroText: {
    gap: theme.spacing[1],
    marginLeft: theme.spacing[1],
  },
  heroTitle: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.semibold,
  },
  heroHint: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    lineHeight: theme.fontSize.sm * 1.4,
  },
  launchpadGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing[3],
  },
  launchpadAction: {
    minWidth: 180,
    flexBasis: {
      xs: "100%",
      md: "31%",
    },
    flexGrow: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[3],
    padding: theme.spacing[3],
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface1,
  },
  launchpadIcon: {
    width: 32,
    height: 32,
    borderRadius: theme.borderRadius.lg,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.surface2,
  },
  launchpadActionText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  launchpadActionLabel: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
  },
  launchpadActionDescription: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: theme.spacing[6],
  },
  section: {
    gap: theme.spacing[3],
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[3],
    marginLeft: theme.spacing[1],
  },
  sectionHeaderText: {
    flex: 1,
    minWidth: 0,
    gap: theme.spacing[1],
  },
  sectionHint: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    lineHeight: theme.fontSize.sm * 1.4,
  },
  folderCount: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    marginLeft: theme.spacing[1],
  },
  folderRow: {
    gap: theme.spacing[3],
  },
  folderMain: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[3],
  },
  folderText: {
    flex: 1,
    minWidth: 0,
  },
  rowHovered: {
    backgroundColor: theme.colors.surface2,
  },
  rowPressed: {
    backgroundColor: theme.colors.surface3,
  },
  emptyCard: {
    padding: theme.spacing[4],
  },
  emptyText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
}));

const EMPTY_CARD_STYLE = [settingsStyles.card, styles.emptyCard];
