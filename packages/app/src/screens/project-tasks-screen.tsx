import { useCallback, useMemo, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import type { PressableStateCallbackType } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { StoredTask, TaskConfig } from "@getpaseo/protocol/task/types";
import type { TaskUpdateRpcPatch } from "@getpaseo/client/internal/daemon-client";
import { StyleSheet } from "react-native-unistyles";
import { ProjectSurfaceHeader } from "@/components/project-surface-header";
import { TaskList, taskKey } from "@/components/task-list";
import type { SelectOption } from "@/components/task-select";
import { useToast } from "@/contexts/toast-context";
import { useProjectGroups } from "@/hooks/use-project-groups";
import { useSessionStore } from "@/stores/session-store";

interface ProjectTasksScreenProps {
  serverId: string;
  groupId: string;
  embedded?: boolean;
}

const EMPTY_CONFIG: TaskConfig = { types: [], people: [], contexts: [] };
const EMPTY_TASKS: StoredTask[] = [];

export function ProjectTasksScreen({
  serverId,
  groupId,
  embedded = false,
}: ProjectTasksScreenProps) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const client = useSessionStore((state) => state.sessions[serverId]?.client ?? null);
  const tasksSupported = useSessionStore(
    (state) => state.sessions[serverId]?.serverInfo?.features?.tasks === true,
  );
  const { groups, supported: projectsSupported } = useProjectGroups(serverId);
  const [newTitle, setNewTitle] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const group = useMemo(
    () => groups.find((candidate) => candidate.groupId === groupId) ?? null,
    [groupId, groups],
  );
  const taskRunRepoRoot = useMemo(() => {
    const gitChildren = group?.children.filter((child) => child.kind === "git") ?? [];
    return gitChildren.length === 1 ? gitChildren[0].rootPath : null;
  }, [group]);
  const projectOptions = useMemo<SelectOption[]>(
    () => groups.map((candidate) => ({ value: candidate.groupId, label: candidate.displayName })),
    [groups],
  );
  const tasksKey = useMemo(() => ["project-tasks", serverId, groupId], [groupId, serverId]);
  const configKey = useMemo(() => ["task-config", serverId, groupId], [groupId, serverId]);
  const invalidateTasks = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: tasksKey }),
      queryClient.invalidateQueries({ queryKey: ["tasks", serverId] }),
      queryClient.invalidateQueries({ queryKey: ["project-tasks", serverId] }),
    ]);
  }, [queryClient, serverId, tasksKey]);
  const tasksQuery = useQuery({
    queryKey: tasksKey,
    enabled: Boolean(client && group && tasksSupported),
    queryFn: async () => (client ? client.taskList(groupId) : []),
    staleTime: 2_000,
  });
  const configQuery = useQuery({
    queryKey: configKey,
    enabled: Boolean(client && group && tasksSupported),
    queryFn: async () => (client ? client.taskConfigGet(groupId) : EMPTY_CONFIG),
    staleTime: 30_000,
  });

  const onError = useCallback(
    (error: unknown) =>
      toast.error(error instanceof Error ? error.message : "Task operation failed"),
    [toast],
  );
  const createTask = useMutation({
    mutationFn: async (title: string) => {
      if (!client) throw new Error("Host is not connected");
      return client.taskCreate({ projectGroupId: groupId, title });
    },
    onSuccess: () => {
      setNewTitle("");
      void invalidateTasks();
    },
    onError,
  });
  const patchTask = useMutation({
    mutationFn: async (input: { id: string; patch: TaskUpdateRpcPatch }) => {
      if (!client) throw new Error("Host is not connected");
      return client.taskUpdate(groupId, input.id, input.patch);
    },
    onSuccess: () => void invalidateTasks(),
    onError,
  });
  const deleteTask = useMutation({
    mutationFn: async (id: string) => {
      if (!client) throw new Error("Host is not connected");
      await client.taskDelete(groupId, id);
    },
    onSuccess: () => {
      setExpandedId(null);
      void invalidateTasks();
    },
    onError,
  });
  const moveTask = useMutation({
    mutationFn: async (input: { task: StoredTask; projectGroupId: string }) => {
      if (!client) throw new Error("Host is not connected");
      if (input.projectGroupId === input.task.metadata.projectGroupId) {
        return input.task;
      }
      return client.taskMove(
        input.task.metadata.projectGroupId,
        input.task.metadata.id,
        input.projectGroupId,
      );
    },
    onSuccess: (task) => {
      setExpandedId(taskKey(task));
      void invalidateTasks();
    },
    onError,
  });
  const startTimer = useMutation({
    mutationFn: async (task: StoredTask) => {
      if (!client) throw new Error("Host is not connected");
      return client.taskTimerStart(task.metadata.projectGroupId, task.metadata.id);
    },
    onSuccess: () => void invalidateTasks(),
    onError,
  });
  const stopTimer = useMutation({
    mutationFn: async (task: StoredTask) => {
      if (!client) throw new Error("Host is not connected");
      return client.taskTimerStop(task.metadata.projectGroupId, task.metadata.id);
    },
    onSuccess: () => void invalidateTasks(),
    onError,
  });
  const runTask = useMutation({
    mutationFn: async (task: StoredTask) => {
      if (!client) throw new Error("Host is not connected");
      if (!taskRunRepoRoot) {
        throw new Error("Task runs require exactly one git folder in this Project");
      }
      const provider = task.metadata.provider?.trim();
      if (!provider) {
        throw new Error("Set an agent provider before running this task");
      }
      return client.taskRun({
        projectGroupId: task.metadata.projectGroupId,
        id: task.metadata.id,
        repoRoot: taskRunRepoRoot,
        provider,
      });
    },
    onSuccess: (result) => {
      void invalidateTasks();
      toast.show(`Started agent ${result.agentId}`, { variant: "success" });
    },
    onError,
  });
  const updateConfig = useMutation({
    mutationFn: async (config: TaskConfig) => {
      if (!client) throw new Error("Host is not connected");
      return client.taskConfigUpdate(groupId, config);
    },
    onSuccess: (config) => queryClient.setQueryData(configKey, config),
    onError,
  });

  const createMutate = createTask.mutate;
  const handleCreate = useCallback(() => {
    const title = newTitle.trim();
    if (title) createMutate(title);
  }, [createMutate, newTitle]);
  const patchMutate = patchTask.mutate;
  const handlePatch = useCallback(
    (task: StoredTask, patch: TaskUpdateRpcPatch) => patchMutate({ id: task.metadata.id, patch }),
    [patchMutate],
  );
  const deleteMutate = deleteTask.mutate;
  const handleDelete = useCallback(
    (task: StoredTask) => deleteMutate(task.metadata.id),
    [deleteMutate],
  );
  const moveMutate = moveTask.mutate;
  const handleChangeProject = useCallback(
    (task: StoredTask, projectGroupId: string) => moveMutate({ task, projectGroupId }),
    [moveMutate],
  );
  const startTimerMutate = startTimer.mutate;
  const stopTimerMutate = stopTimer.mutate;
  const handleTimerStart = useCallback(
    (task: StoredTask) => startTimerMutate(task),
    [startTimerMutate],
  );
  const handleTimerStop = useCallback(
    (task: StoredTask) => stopTimerMutate(task),
    [stopTimerMutate],
  );
  const runTaskMutate = runTask.mutate;
  const handleRunTask = useCallback((task: StoredTask) => runTaskMutate(task), [runTaskMutate]);
  const getRunDisabled = useCallback(
    (task: StoredTask) => runTask.isPending || !taskRunRepoRoot || !task.metadata.provider?.trim(),
    [runTask.isPending, taskRunRepoRoot],
  );
  const handleToggleExpanded = useCallback((task: StoredTask) => {
    const key = taskKey(task);
    setExpandedId((current) => (current === key ? null : key));
  }, []);

  const config = configQuery.data ?? EMPTY_CONFIG;
  const updateConfigMutate = updateConfig.mutate;
  const addConfigValue = useCallback(
    (key: keyof TaskConfig, value: string) => {
      if (!config[key].includes(value)) {
        updateConfigMutate({ ...config, [key]: [...config[key], value] });
      }
    },
    [config, updateConfigMutate],
  );
  const removeConfigValue = useCallback(
    (key: keyof TaskConfig, value: string) => {
      updateConfigMutate({ ...config, [key]: config[key].filter((entry) => entry !== value) });
    },
    [config, updateConfigMutate],
  );
  const handleAddType = useCallback(
    (value: string) => addConfigValue("types", value),
    [addConfigValue],
  );
  const handleAddPerson = useCallback(
    (value: string) => addConfigValue("people", value),
    [addConfigValue],
  );
  const handleAddContext = useCallback(
    (value: string) => addConfigValue("contexts", value),
    [addConfigValue],
  );
  const handleRemoveType = useCallback(
    (value: string) => removeConfigValue("types", value),
    [removeConfigValue],
  );
  const handleRemovePerson = useCallback(
    (value: string) => removeConfigValue("people", value),
    [removeConfigValue],
  );
  const handleRemoveContext = useCallback(
    (value: string) => removeConfigValue("contexts", value),
    [removeConfigValue],
  );

  const addDisabled = !newTitle.trim() || createTask.isPending;
  const addButtonStyle = useCallback(
    ({ pressed }: PressableStateCallbackType) => [
      styles.addButton,
      addDisabled && styles.disabled,
      pressed && styles.pressed,
    ],
    [addDisabled],
  );

  if (!projectsSupported || !group || !tasksSupported) {
    return (
      <View style={styles.container}>
        {embedded ? null : <ProjectSurfaceHeader title="Project" />}
        <View style={styles.centered}>
          <Text style={styles.muted}>
            {!projectsSupported || !tasksSupported
              ? "Update the host to use structured Project Tasks"
              : "Project not found"}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {embedded ? null : <ProjectSurfaceHeader title={group.displayName} />}
      <View style={styles.composer}>
        <TextInput
          style={styles.input}
          value={newTitle}
          onChangeText={setNewTitle}
          onSubmitEditing={handleCreate}
          placeholder="New task"
          placeholderTextColor={PLACEHOLDER_COLOR}
          returnKeyType="done"
        />
        <Pressable
          accessibilityRole="button"
          disabled={addDisabled}
          onPress={handleCreate}
          style={addButtonStyle}
        >
          <Text style={styles.addButtonText}>Add</Text>
        </Pressable>
      </View>
      <TaskList
        pending={tasksQuery.isPending}
        error={tasksQuery.error}
        tasks={tasksQuery.data ?? EMPTY_TASKS}
        emptyTitle="No Project tasks yet"
        emptyDescription="Create the first task above. Tasks are stored as plain Markdown in this Project and can be opened beside agents, notes, terminals, and browser tabs."
        expandedId={expandedId}
        config={config}
        onToggleExpanded={handleToggleExpanded}
        onPatch={handlePatch}
        onTimerStart={handleTimerStart}
        onTimerStop={handleTimerStop}
        onDelete={handleDelete}
        onRun={handleRunTask}
        getRunDisabled={getRunDisabled}
        projectOptions={projectOptions}
        onChangeProject={handleChangeProject}
        onAddType={handleAddType}
        onAddPerson={handleAddPerson}
        onAddContext={handleAddContext}
        onRemoveType={handleRemoveType}
        onRemovePerson={handleRemovePerson}
        onRemoveContext={handleRemoveContext}
      />
    </View>
  );
}

const PLACEHOLDER_COLOR = "#9ca3af";

const styles = StyleSheet.create((theme) => ({
  container: { flex: 1, minHeight: 0, backgroundColor: theme.colors.surface0 },
  composer: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    padding: theme.spacing[3],
    borderBottomWidth: theme.borderWidth[1],
    borderBottomColor: theme.colors.border,
  },
  input: {
    flex: 1,
    height: 36,
    paddingHorizontal: theme.spacing[3],
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surface2,
    color: theme.colors.foreground,
  },
  addButton: {
    height: 36,
    paddingHorizontal: theme.spacing[4],
    justifyContent: "center",
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.accent,
  },
  addButtonText: { color: theme.colors.accentForeground, fontWeight: theme.fontWeight.medium },
  disabled: { opacity: theme.opacity[50] },
  pressed: { opacity: 0.8 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: theme.spacing[6] },
  muted: { color: theme.colors.foregroundMuted, fontSize: theme.fontSize.xs },
}));
