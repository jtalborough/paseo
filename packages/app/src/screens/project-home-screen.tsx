import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  type PressableStateCallbackType,
} from "react-native";
import { router } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ProjectAgentProfileEntry } from "@getpaseo/client/internal/daemon-client";
import type { ProjectAgentProfile } from "@getpaseo/protocol/project-context/types";
import {
  Bot,
  ChevronRight,
  FileText,
  Folder,
  Globe,
  ListTodo,
  NotebookText,
  Plus,
  Trash2,
} from "lucide-react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { ProjectSurfaceHeader } from "@/components/project-surface-header";
import { ProjectFolderPickerModal } from "@/components/project-folder-picker-modal";
import { updateProfileFormField } from "@/composer/draft/workspace-tab-core";
import { Button } from "@/components/ui/button";
import { useToast } from "@/contexts/toast-context";
import { useIsLocalDaemon } from "@/hooks/use-is-local-daemon";
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
  buildHostProjectContextRoute,
  buildHostNewWorkspaceRoute,
  buildHostProjectFilesRoute,
  buildHostProjectNotesRoute,
  buildHostProjectTasksRoute,
  buildHostWorkspaceRoute,
} from "@/utils/host-routes";
import { confirmDialog } from "@/utils/confirm-dialog";
import { navigateToAgent } from "@/utils/navigate-to-agent";
import { buildProjectAgentProfileDraftTarget } from "@/screens/project-home-screen-core";

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
const ThemedTrash2 = withUnistyles(Trash2);

export function ProjectHomeScreen({
  serverId,
  groupId,
  embedded = false,
  onOpenTab,
}: ProjectHomeScreenProps) {
  const selectGroup = useProjectSelectionStore((state) => state.selectGroup);
  const projects = useHostProjects(serverId);
  const hostAgents = useSessionStore((state) => state.sessions[serverId]?.agents ?? null);
  const { groups, supported, canAddFromDisk, addFolderFromDisk, addFolderPath } =
    useProjectGroups(serverId);
  const isLocalDaemon = useIsLocalDaemon(serverId);
  const [isFolderPickerOpen, setIsFolderPickerOpen] = useState(false);

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
    if (isLocalDaemon && canAddFromDisk) {
      void addFolderFromDisk(groupId);
      return;
    }
    setIsFolderPickerOpen(true);
  }, [addFolderFromDisk, canAddFromDisk, groupId, isLocalDaemon]);
  const handleCloseFolderPicker = useCallback(() => setIsFolderPickerOpen(false), []);
  const handleSelectFolderPath = useCallback(
    (path: string) => addFolderPath(path, groupId),
    [addFolderPath, groupId],
  );
  const showAddFolderButton = !isLocalDaemon || canAddFromDisk;
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
  const handleBrowseContext = useCallback(() => {
    if (onOpenTab) {
      onOpenTab({ kind: "project-context", groupId });
      return;
    }
    router.navigate(buildHostProjectContextRoute(serverId, groupId));
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
              <LaunchpadAction
                label="Context"
                description="Audit launch packets"
                Icon={ThemedFileText}
                onPress={handleBrowseContext}
                testID="project-home-action-context"
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
            projectDirectory={group.cwd}
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
              {showAddFolderButton ? (
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
      <ProjectFolderPickerModal
        visible={isFolderPickerOpen}
        serverId={serverId}
        title="Add folder to Project"
        onClose={handleCloseFolderPicker}
        onSelectPath={handleSelectFolderPath}
      />
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
            projectDirectory={group.cwd}
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
  projectDirectory,
  onOpenTab,
}: {
  serverId: string;
  groupId: string;
  launchCwd: string | null | undefined;
  projectDirectory: string | null | undefined;
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
      <ProjectAgentProfilesSection
        serverId={serverId}
        groupId={groupId}
        launchCwd={launchCwd}
        projectDirectory={projectDirectory}
        onOpenTab={onOpenTab}
      />
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

const EMPTY_PROFILE_FORM = {
  id: "",
  name: "",
  provider: "",
  model: "",
  prompt: "prompts/project-manager.md",
  defaultTools: "",
};
type ProfileForm = typeof EMPTY_PROFILE_FORM;
type ProfileFormKey = keyof ProfileForm;

function ProjectAgentProfilesSection({
  serverId,
  groupId,
  launchCwd,
  projectDirectory,
  onOpenTab,
}: {
  serverId: string;
  groupId: string;
  launchCwd: string | null | undefined;
  projectDirectory: string | null | undefined;
  onOpenTab?: (target: WorkspaceTabTarget) => void;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const client = useSessionStore((state) => state.sessions[serverId]?.client ?? null);
  const supported = useSessionStore(
    (state) => state.sessions[serverId]?.serverInfo?.features?.projectAgentProfiles === true,
  );
  const canCreateContextPacket = useSessionStore(
    (state) => state.sessions[serverId]?.serverInfo?.features?.projectContextPacketCreate === true,
  );
  const queryKey = useMemo(
    () => ["project-agent-profiles", serverId, groupId],
    [groupId, serverId],
  );
  const [editingPath, setEditingPath] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_PROFILE_FORM);

  const profilesQuery = useQuery({
    queryKey,
    enabled: Boolean(client && supported),
    queryFn: async () => (client ? client.projectAgentProfileList(groupId) : []),
    staleTime: 2_000,
  });

  const invalidateProfiles = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey });
  }, [queryClient, queryKey]);

  const upsertProfile = useMutation({
    mutationFn: async (input: { path: string | null; profile: ProjectAgentProfile }) => {
      if (!client) {
        throw new Error("Host is not connected");
      }
      return client.projectAgentProfileUpsert({
        projectGroupId: groupId,
        ...(input.path ? { path: input.path } : {}),
        profile: input.profile,
      });
    },
    onSuccess: () => {
      setEditingPath(null);
      setForm(EMPTY_PROFILE_FORM);
      void invalidateProfiles();
      toast.show("Agent profile saved", { variant: "success" });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Failed to save agent profile"),
  });

  const deleteProfile = useMutation({
    mutationFn: async (path: string) => {
      if (!client) {
        throw new Error("Host is not connected");
      }
      return client.projectAgentProfileDelete({ projectGroupId: groupId, path });
    },
    onSuccess: () => {
      setEditingPath(null);
      setForm(EMPTY_PROFILE_FORM);
      void invalidateProfiles();
      toast.show("Agent profile deleted", { variant: "success" });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Failed to delete agent profile"),
  });

  const startCreate = useCallback(() => {
    setEditingPath(null);
    setForm({ ...EMPTY_PROFILE_FORM, id: "implementation-agent", name: "Implementation Agent" });
  }, []);

  const startEdit = useCallback((entry: ProjectAgentProfileEntry) => {
    setEditingPath(entry.path);
    setForm(profileToForm(entry.profile));
  }, []);

  const handleCancel = useCallback(() => {
    setEditingPath(null);
    setForm(EMPTY_PROFILE_FORM);
  }, []);

  const handleFieldChange = useCallback((field: ProfileFormKey, value: string) => {
    setForm((current) => updateProfileFormField(current, field, value));
  }, []);

  const handleSave = useCallback(() => {
    const profile = formToProfile(form);
    if (!profile) {
      toast.error("Profile needs an id and name");
      return;
    }
    upsertProfile.mutate({ path: editingPath, profile });
  }, [editingPath, form, toast, upsertProfile]);

  const handleDelete = useCallback(
    async (entry: ProjectAgentProfileEntry) => {
      const confirmed = await confirmDialog({
        title: "Delete agent profile?",
        message: `${entry.profile.name} will be removed from ${entry.path}. Existing agents are not changed.`,
        confirmLabel: "Delete",
        destructive: true,
      });
      if (confirmed) {
        deleteProfile.mutate(entry.path);
      }
    },
    [deleteProfile],
  );
  const handleUseProfile = useCallback(
    async (entry: ProjectAgentProfileEntry) => {
      if (!launchCwd) {
        toast.error("Project launch directory is not available");
        return;
      }
      if (!onOpenTab) {
        router.navigate(
          buildHostNewProjectAgentRoute(serverId, groupId, { profilePath: entry.path }),
        );
        return;
      }
      if (!entry.profile.provider?.trim()) {
        toast.error("Set a provider on this profile before using it");
        return;
      }
      if (!client || !canCreateContextPacket) {
        toast.error("Update the host to use profile launch packets");
        return;
      }
      let initialPrompt: string | null = null;
      if (entry.profile.prompt) {
        if (!projectDirectory) {
          toast.error("Project prompt file is not available");
          return;
        }
        try {
          const promptFile = await client.readFile(projectDirectory, entry.profile.prompt);
          initialPrompt = new TextDecoder().decode(promptFile.bytes);
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "Failed to load profile prompt");
          return;
        }
      }
      try {
        await client.projectContextPacketCreate({
          projectGroupId: groupId,
          launchReason: `Use profile: ${entry.profile.name}`,
          provider: entry.profile.provider,
          model: entry.profile.model,
          profile: entry.path,
          prompt: entry.profile.prompt,
          tools: entry.profile.defaultTools,
          folderGrants: entry.profile.folderGrants,
        });
        void queryClient.invalidateQueries({
          queryKey: ["project-context-packets", serverId, groupId],
        });
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to create launch packet");
        return;
      }
      onOpenTab({
        ...buildProjectAgentProfileDraftTarget({
          entry,
          draftId: generateDraftId(),
          groupId,
          launchCwd,
          initialPrompt,
        }),
      });
    },
    [
      canCreateContextPacket,
      client,
      groupId,
      launchCwd,
      onOpenTab,
      projectDirectory,
      queryClient,
      serverId,
      toast,
    ],
  );

  const profiles = profilesQuery.data ?? [];
  const showForm = form.id.length > 0 || form.name.length > 0 || editingPath !== null;
  let profilesContent;
  if (!supported) {
    profilesContent = (
      <View style={EMPTY_CARD_STYLE}>
        <Text style={styles.emptyText}>Update the host to manage agent profiles</Text>
      </View>
    );
  } else if (profilesQuery.isError) {
    profilesContent = (
      <View style={EMPTY_CARD_STYLE}>
        <Text style={styles.emptyText}>Agent profiles could not be loaded</Text>
      </View>
    );
  } else if (profiles.length > 0) {
    profilesContent = (
      <View style={settingsStyles.card} testID="project-agent-profiles">
        {profiles.map((entry, index) => (
          <ProjectAgentProfileRow
            key={entry.path}
            entry={entry}
            isFirst={index === 0}
            onEdit={startEdit}
            onUse={handleUseProfile}
            onDelete={handleDelete}
          />
        ))}
      </View>
    );
  } else {
    profilesContent = (
      <View style={EMPTY_CARD_STYLE} testID="project-agent-profiles-empty">
        <Text style={styles.emptyText}>No agent profiles yet</Text>
      </View>
    );
  }

  return (
    <View style={styles.profileSection}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionHeaderText}>
          <Text style={settingsStyles.sectionHeaderTitle}>Agent profiles</Text>
          <Text style={styles.sectionHint}>
            Reusable roles stored as ordinary files in this Project.
          </Text>
        </View>
        {supported ? (
          <Button
            variant="ghost"
            size="xs"
            leftIcon={ThemedPlus}
            onPress={startCreate}
            testID="project-agent-profile-new"
          >
            New profile
          </Button>
        ) : null}
      </View>

      {profilesContent}

      {showForm ? (
        <View style={styles.profileEditor} testID="project-agent-profile-editor">
          <View style={styles.profileEditorHeader}>
            <Text style={styles.profileEditorTitle}>
              {editingPath ? "Edit profile" : "New profile"}
            </Text>
            {editingPath ? <Text style={styles.profilePath}>{editingPath}</Text> : null}
          </View>
          <View style={styles.profileFormGrid}>
            <ProfileInput
              field="id"
              label="Id"
              value={form.id}
              onChangeField={handleFieldChange}
              placeholder="implementation-agent"
            />
            <ProfileInput
              field="name"
              label="Name"
              value={form.name}
              onChangeField={handleFieldChange}
              placeholder="Implementation Agent"
            />
            <ProfileInput
              field="provider"
              label="Provider"
              value={form.provider}
              onChangeField={handleFieldChange}
              placeholder="codex"
            />
            <ProfileInput
              field="model"
              label="Model"
              value={form.model}
              onChangeField={handleFieldChange}
              placeholder="default"
            />
            <ProfileInput
              field="prompt"
              label="Prompt"
              value={form.prompt}
              onChangeField={handleFieldChange}
              placeholder="prompts/project-manager.md"
            />
            <ProfileInput
              field="defaultTools"
              label="Tools"
              value={form.defaultTools}
              onChangeField={handleFieldChange}
              placeholder="project-tasks, project-notes"
            />
          </View>
          <View style={styles.profileEditorActions}>
            <Button variant="ghost" size="xs" onPress={handleCancel}>
              Cancel
            </Button>
            <Button
              variant="default"
              size="xs"
              onPress={handleSave}
              loading={upsertProfile.isPending}
            >
              Save profile
            </Button>
          </View>
        </View>
      ) : null}
    </View>
  );
}

function ProjectAgentProfileRow({
  entry,
  isFirst,
  onEdit,
  onUse,
  onDelete,
}: {
  entry: ProjectAgentProfileEntry;
  isFirst: boolean;
  onEdit: (entry: ProjectAgentProfileEntry) => void;
  onUse: (entry: ProjectAgentProfileEntry) => void;
  onDelete: (entry: ProjectAgentProfileEntry) => void;
}) {
  const profile = entry.profile;
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
  const handleEdit = useCallback(() => onEdit(entry), [entry, onEdit]);
  const handleUse = useCallback(() => onUse(entry), [entry, onUse]);
  const handleDelete = useCallback(() => onDelete(entry), [entry, onDelete]);
  const summary = [
    profile.provider ?? "default provider",
    profile.model,
    profile.prompt,
    profile.defaultTools.length ? `${profile.defaultTools.length} tools` : null,
  ].filter(Boolean);

  return (
    <Pressable
      style={rowStyle}
      onPress={handleEdit}
      accessibilityRole="button"
      accessibilityLabel={`Edit ${profile.name}`}
      testID={`project-agent-profile-${profile.id}`}
    >
      <View style={styles.folderMain}>
        <ThemedBot size={16} uniProps={iconColorMapping} />
        <View style={styles.folderText}>
          <Text style={settingsStyles.rowTitle} numberOfLines={1}>
            {profile.name}
          </Text>
          <Text style={settingsStyles.rowHint} numberOfLines={1}>
            {summary.join(" - ")}
          </Text>
        </View>
      </View>
      <View style={styles.profileRowActions}>
        <Button variant="ghost" size="xs" onPress={handleUse}>
          Use
        </Button>
        <Button
          variant="ghost"
          size="xs"
          leftIcon={ThemedTrash2}
          onPress={handleDelete}
          accessibilityLabel={`Delete ${profile.name}`}
        />
      </View>
    </Pressable>
  );
}

function ProfileInput({
  field,
  label,
  value,
  onChangeField,
  placeholder,
}: {
  field: ProfileFormKey;
  label: string;
  value: string;
  onChangeField: (field: ProfileFormKey, value: string) => void;
  placeholder: string;
}) {
  const handleChangeText = useCallback(
    (nextValue: string) => onChangeField(field, nextValue),
    [field, onChangeField],
  );

  return (
    <View style={styles.profileField}>
      <Text style={styles.profileFieldLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={handleChangeText}
        placeholder={placeholder}
        placeholderTextColor="#9ca3af"
        style={styles.profileInput}
        autoCapitalize="none"
      />
    </View>
  );
}

function profileToForm(profile: ProjectAgentProfile): typeof EMPTY_PROFILE_FORM {
  return {
    id: profile.id,
    name: profile.name,
    provider: profile.provider ?? "",
    model: profile.model ?? "",
    prompt: profile.prompt ?? "",
    defaultTools: profile.defaultTools.join(", "),
  };
}

function formToProfile(form: typeof EMPTY_PROFILE_FORM): ProjectAgentProfile | null {
  const id = form.id.trim();
  const name = form.name.trim();
  if (!id || !name) {
    return null;
  }
  const prompt = form.prompt.trim();
  return {
    schemaVersion: 1,
    id,
    name,
    provider: emptyToNull(form.provider),
    model: emptyToNull(form.model),
    prompt: prompt.length > 0 ? prompt : null,
    defaultTools: form.defaultTools
      .split(",")
      .map((tool) => tool.trim())
      .filter(Boolean),
    folderGrants: [],
  };
}

function emptyToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
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
  profileSection: {
    gap: theme.spacing[3],
    marginBottom: theme.spacing[3],
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
  profileEditor: {
    gap: theme.spacing[4],
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.surface1,
    padding: theme.spacing[4],
  },
  profileEditorHeader: {
    gap: 2,
  },
  profileEditorTitle: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.semibold,
  },
  profilePath: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
  profileFormGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing[3],
  },
  profileField: {
    minWidth: 180,
    flexBasis: {
      xs: "100%",
      md: "31%",
    },
    flexGrow: 1,
    gap: theme.spacing[1],
  },
  profileFieldLabel: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    textTransform: "uppercase",
  },
  profileInput: {
    minHeight: 36,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surface0,
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
  },
  profileEditorActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: theme.spacing[2],
  },
  profileRowActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
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
