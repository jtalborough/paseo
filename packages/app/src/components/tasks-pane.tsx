import { useCallback, useMemo, useState } from "react";
import type { PressableStateCallbackType } from "react-native";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  ActionState,
  StoredTask,
  TaskConfig,
  TaskPriority,
} from "@getpaseo/protocol/task/types";
import type { TaskUpdateRpcPatch } from "@getpaseo/client/internal/daemon-client";
import { TaskEditor } from "@/components/task-editor";
import { useToast } from "@/contexts/toast-context";
import { useSessionStore } from "@/stores/session-store";
import { useWorkspaceExecutionAuthority } from "@/stores/session-store-hooks";
import { StyleSheet } from "react-native-unistyles";

const ACTION_STATE_LABEL: Record<ActionState, string> = {
  todo: "ToDo",
  waiting: "Waiting",
  info: "Info",
  someday: "Someday",
  dropped: "Dropped",
  done: "Done",
};

interface TasksPaneProps {
  serverId: string;
  workspaceId: string;
}

export function TasksPane({ serverId, workspaceId }: TasksPaneProps) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const client = useSessionStore((state) => state.sessions[serverId]?.client ?? null);
  const tasksSupported = useSessionStore(
    (state) => state.sessions[serverId]?.serverInfo?.features?.tasks === true,
  );
  const authority = useWorkspaceExecutionAuthority(serverId, workspaceId);
  const projectId = authority?.ok ? authority.authority.workspace.projectId : null;
  const projectRootPath = authority?.ok ? authority.authority.workspace.projectRootPath : null;

  const [newTitle, setNewTitle] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const tasksKey = useMemo(() => ["tasks", serverId, projectId], [serverId, projectId]);
  const configKey = useMemo(() => ["task-config", serverId, projectId], [serverId, projectId]);
  const invalidateTasks = useCallback(
    () => queryClient.invalidateQueries({ queryKey: tasksKey }),
    [queryClient, tasksKey],
  );

  const tasksQuery = useQuery({
    queryKey: tasksKey,
    enabled: Boolean(client && projectId && tasksSupported),
    queryFn: async () => {
      if (!client || !projectId) {
        return [] as StoredTask[];
      }
      return client.taskList(projectId);
    },
    staleTime: 2_000,
  });

  const configQuery = useQuery({
    queryKey: configKey,
    enabled: Boolean(client && projectId && tasksSupported),
    queryFn: async () => {
      if (!client || !projectId) {
        return { types: [], people: [], contexts: [] } as TaskConfig;
      }
      return client.taskConfigGet(projectId);
    },
    staleTime: 30_000,
  });

  const createTask = useMutation({
    mutationFn: async (title: string) => {
      if (!client || !projectId) {
        throw new Error("Host is not connected");
      }
      return client.taskCreate({ project: projectId, title });
    },
    onSuccess: () => {
      setNewTitle("");
      void invalidateTasks();
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Failed to create task"),
  });

  const patchTask = useMutation({
    mutationFn: async (params: { id: string; patch: TaskUpdateRpcPatch }) => {
      if (!client || !projectId) {
        throw new Error("Host is not connected");
      }
      return client.taskUpdate(projectId, params.id, params.patch);
    },
    onSuccess: () => void invalidateTasks(),
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Failed to update task"),
  });

  const deleteTask = useMutation({
    mutationFn: async (id: string) => {
      if (!client || !projectId) {
        throw new Error("Host is not connected");
      }
      await client.taskDelete(projectId, id);
    },
    onSuccess: () => void invalidateTasks(),
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Failed to delete task"),
  });

  const runTask = useMutation({
    mutationFn: async (id: string) => {
      if (!client || !projectId || !projectRootPath) {
        throw new Error("Host is not connected");
      }
      return client.taskRun({ project: projectId, id, repoRoot: projectRootPath });
    },
    onSuccess: (result) => {
      if (result.ok) {
        toast.show("Task dispatched to an agent.");
        void invalidateTasks();
      } else {
        toast.error(result.error);
      }
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to run task"),
  });

  const updateConfig = useMutation({
    mutationFn: async (config: TaskConfig) => {
      if (!client || !projectId) {
        throw new Error("Host is not connected");
      }
      return client.taskConfigUpdate(projectId, config);
    },
    onSuccess: (config) => queryClient.setQueryData(configKey, config),
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Failed to update options"),
  });

  const trimmedTitle = newTitle.trim();
  const createMutate = createTask.mutate;
  const handleSubmit = useCallback(() => {
    if (trimmedTitle.length > 0) {
      createMutate(trimmedTitle);
    }
  }, [createMutate, trimmedTitle]);

  const patchMutate = patchTask.mutate;
  const runMutate = runTask.mutate;
  const deleteMutate = deleteTask.mutate;
  const updateConfigMutate = updateConfig.mutate;
  const config = configQuery.data ?? EMPTY_CONFIG;

  const handlePatch = useCallback(
    (id: string, patch: TaskUpdateRpcPatch) => patchMutate({ id, patch }),
    [patchMutate],
  );
  const handleToggleExpand = useCallback(
    (id: string) => setExpandedId((current) => (current === id ? null : id)),
    [],
  );
  const handleAddType = useCallback(
    (value: string) => {
      if (!config.types.includes(value)) {
        updateConfigMutate({ ...config, types: [...config.types, value] });
      }
    },
    [config, updateConfigMutate],
  );
  const handleAddPerson = useCallback(
    (value: string) => {
      if (!config.people.includes(value)) {
        updateConfigMutate({ ...config, people: [...config.people, value] });
      }
    },
    [config, updateConfigMutate],
  );
  const handleRemoveType = useCallback(
    (value: string) =>
      updateConfigMutate({ ...config, types: config.types.filter((t) => t !== value) }),
    [config, updateConfigMutate],
  );
  const handleRemovePerson = useCallback(
    (value: string) =>
      updateConfigMutate({ ...config, people: config.people.filter((p) => p !== value) }),
    [config, updateConfigMutate],
  );

  const addDisabled = trimmedTitle.length === 0 || createTask.isPending;
  const addButtonStyle = useCallback(
    ({ pressed }: PressableStateCallbackType) => [
      styles.addButton,
      addDisabled && styles.addButtonDisabled,
      pressed && styles.addButtonPressed,
    ],
    [addDisabled],
  );

  if (!tasksSupported) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyText}>Update the host to use Tasks.</Text>
      </View>
    );
  }
  if (!projectId) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyText}>This workspace has no project.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.composer}>
        <TextInput
          style={styles.input}
          value={newTitle}
          onChangeText={setNewTitle}
          placeholder="New task title…"
          placeholderTextColor={PLACEHOLDER_COLOR}
          onSubmitEditing={handleSubmit}
          returnKeyType="done"
        />
        <Pressable
          accessibilityRole="button"
          disabled={addDisabled}
          onPress={handleSubmit}
          style={addButtonStyle}
        >
          <Text style={styles.addButtonText}>Add</Text>
        </Pressable>
      </View>

      <TaskListBody
        query={tasksQuery}
        tasks={tasksQuery.data}
        config={config}
        expandedId={expandedId}
        onToggleExpand={handleToggleExpand}
        onPatch={handlePatch}
        onRun={runMutate}
        onDelete={deleteMutate}
        onAddType={handleAddType}
        onAddPerson={handleAddPerson}
        onRemoveType={handleRemoveType}
        onRemovePerson={handleRemovePerson}
        runDisabled={runTask.isPending}
      />
    </View>
  );
}

const EMPTY_CONFIG: TaskConfig = { types: [], people: [], contexts: [] };

function TaskListBody({
  query,
  tasks,
  config,
  expandedId,
  onToggleExpand,
  onPatch,
  onRun,
  onDelete,
  onAddType,
  onAddPerson,
  onRemoveType,
  onRemovePerson,
  runDisabled,
}: {
  query: { isPending: boolean; isError: boolean; error: unknown };
  tasks: StoredTask[] | undefined;
  config: TaskConfig;
  expandedId: string | null;
  onToggleExpand: (id: string) => void;
  onPatch: (id: string, patch: TaskUpdateRpcPatch) => void;
  onRun: (id: string) => void;
  onDelete: (id: string) => void;
  onAddType: (value: string) => void;
  onAddPerson: (value: string) => void;
  onRemoveType: (value: string) => void;
  onRemovePerson: (value: string) => void;
  runDisabled: boolean;
}) {
  if (query.isPending) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
      </View>
    );
  }
  if (query.isError) {
    const message = query.error instanceof Error ? query.error.message : "Failed to load tasks.";
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyText}>{message}</Text>
      </View>
    );
  }
  const list = tasks ?? [];
  if (list.length === 0) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyText}>No tasks yet. Add one above.</Text>
      </View>
    );
  }
  return (
    <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
      {list.map((task) => (
        <TaskRow
          key={task.metadata.id}
          task={task}
          config={config}
          expanded={expandedId === task.metadata.id}
          onToggleExpand={onToggleExpand}
          onPatch={onPatch}
          onRun={onRun}
          onDelete={onDelete}
          onAddType={onAddType}
          onAddPerson={onAddPerson}
          onRemoveType={onRemoveType}
          onRemovePerson={onRemovePerson}
          runDisabled={runDisabled}
        />
      ))}
    </ScrollView>
  );
}

function TaskRow({
  task,
  config,
  expanded,
  onToggleExpand,
  onPatch,
  onRun,
  onDelete,
  onAddType,
  onAddPerson,
  onRemoveType,
  onRemovePerson,
  runDisabled,
}: {
  task: StoredTask;
  config: TaskConfig;
  expanded: boolean;
  onToggleExpand: (id: string) => void;
  onPatch: (id: string, patch: TaskUpdateRpcPatch) => void;
  onRun: (id: string) => void;
  onDelete: (id: string) => void;
  onAddType: (value: string) => void;
  onAddPerson: (value: string) => void;
  onRemoveType: (value: string) => void;
  onRemovePerson: (value: string) => void;
  runDisabled: boolean;
}) {
  const { id, actionState, title, priority } = task.metadata;
  const handleToggle = useCallback(() => onToggleExpand(id), [onToggleExpand, id]);

  const titleStyle = useMemo(
    () => [styles.rowTitle, actionState === "done" ? styles.rowTitleDone : null],
    [actionState],
  );
  const dotStyle = useMemo(() => [styles.stateDot, stateDotStyle(actionState)], [actionState]);

  return (
    <View style={styles.rowOuter}>
      <Pressable accessibilityRole="button" onPress={handleToggle} style={rowHeaderStyle}>
        <View style={dotStyle} />
        <Text style={titleStyle} numberOfLines={2}>
          {title}
        </Text>
        {priority ? (
          <Text style={priorityTextStyle(priority)}>{priorityGlyph(priority)}</Text>
        ) : null}
        <Text style={styles.stateLabel}>{ACTION_STATE_LABEL[actionState]}</Text>
      </Pressable>
      {expanded ? (
        <TaskEditor
          task={task}
          config={config}
          onPatch={onPatch}
          onRun={onRun}
          onDelete={onDelete}
          onAddType={onAddType}
          onAddPerson={onAddPerson}
          onRemoveType={onRemoveType}
          onRemovePerson={onRemovePerson}
          runDisabled={runDisabled}
        />
      ) : null}
    </View>
  );
}

function rowHeaderStyle({ pressed }: PressableStateCallbackType) {
  return [styles.rowHeader, pressed ? styles.rowHeaderPressed : null];
}

function stateDotStyle(state: ActionState) {
  return styles[STATE_DOT_KEY[state]];
}

const STATE_DOT_KEY: Record<
  ActionState,
  "dotTodo" | "dotWaiting" | "dotInfo" | "dotSomeday" | "dotDropped" | "dotDone"
> = {
  todo: "dotTodo",
  waiting: "dotWaiting",
  info: "dotInfo",
  someday: "dotSomeday",
  dropped: "dotDropped",
  done: "dotDone",
};

function priorityGlyph(priority: TaskPriority): string {
  if (priority === "high") return "!!!";
  if (priority === "medium") return "!!";
  return "!";
}

function priorityTextStyle(priority: TaskPriority) {
  if (priority === "high") return styles.priorityHigh;
  if (priority === "medium") return styles.priorityMedium;
  return styles.priorityLow;
}

const PLACEHOLDER_COLOR = "#9ca3af";

const styles = StyleSheet.create((theme) => ({
  container: { flex: 1, backgroundColor: theme.colors.surface0 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: theme.spacing[6] },
  emptyText: { color: theme.colors.foregroundMuted, fontSize: theme.fontSize.sm },
  composer: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    padding: theme.spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  input: {
    flex: 1,
    height: 36,
    paddingHorizontal: theme.spacing[3],
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surface2,
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
  },
  addButton: {
    paddingHorizontal: theme.spacing[4],
    height: 36,
    borderRadius: theme.borderRadius.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.accent,
  },
  addButtonDisabled: { opacity: 0.5 },
  addButtonPressed: { opacity: 0.8 },
  addButtonText: { color: theme.colors.accentForeground, fontWeight: theme.fontWeight.medium },
  list: { flex: 1, minHeight: 0 },
  listContent: { padding: theme.spacing[3], gap: theme.spacing[2] },
  rowOuter: {
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.surface1,
    overflow: "hidden",
  },
  rowHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[3],
    padding: theme.spacing[3],
  },
  rowHeaderPressed: { backgroundColor: theme.colors.surface2 },
  rowTitle: { flex: 1, color: theme.colors.foreground, fontSize: theme.fontSize.sm },
  rowTitleDone: { color: theme.colors.foregroundMuted, textDecorationLine: "line-through" },
  stateLabel: { color: theme.colors.foregroundMuted, fontSize: theme.fontSize.xs },
  stateDot: { width: 10, height: 10, borderRadius: 5 },
  dotTodo: { backgroundColor: theme.colors.accent },
  dotWaiting: { backgroundColor: theme.colors.palette.amber[500] },
  dotInfo: { backgroundColor: theme.colors.palette.blue[500] },
  dotSomeday: { backgroundColor: theme.colors.foregroundMuted },
  dotDropped: { backgroundColor: theme.colors.destructive },
  dotDone: { backgroundColor: theme.colors.palette.green[600] },
  priorityHigh: {
    color: theme.colors.destructive,
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.bold,
  },
  priorityMedium: {
    color: theme.colors.palette.amber[500],
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.bold,
  },
  priorityLow: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.bold,
  },
  editor: {
    padding: theme.spacing[3],
    gap: theme.spacing[3],
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  fieldRow: { gap: theme.spacing[1] },
  fieldLabel: { color: theme.colors.foregroundMuted, fontSize: theme.fontSize.xs },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: theme.spacing[1] },
  chip: {
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[1],
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surface3,
  },
  chipSelected: { backgroundColor: theme.colors.accent },
  chipText: { color: theme.colors.foregroundMuted, fontSize: theme.fontSize.xs },
  chipTextSelected: { color: theme.colors.palette.white },
  addChip: {
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[1],
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  addChipText: { color: theme.colors.foregroundMuted, fontSize: theme.fontSize.xs },
  addChipInput: {
    minWidth: 90,
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[1],
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surface2,
    color: theme.colors.foreground,
    fontSize: theme.fontSize.xs,
  },
  fieldInput: {
    height: 32,
    paddingHorizontal: theme.spacing[2],
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surface2,
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
  },
  agentRow: { flexDirection: "row", alignItems: "center", gap: theme.spacing[2] },
  agentInput: {
    flex: 1,
    height: 32,
    paddingHorizontal: theme.spacing[2],
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surface2,
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
  },
  runButton: {
    paddingHorizontal: theme.spacing[3],
    height: 32,
    borderRadius: theme.borderRadius.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.accent,
  },
  runButtonPressed: { opacity: 0.8 },
  runButtonText: { color: theme.colors.accentForeground, fontSize: theme.fontSize.sm },
  notesInput: {
    minHeight: 80,
    padding: theme.spacing[2],
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surface2,
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
  },
  editorActions: { flexDirection: "row", gap: theme.spacing[2], marginTop: theme.spacing[1] },
  rowAction: { paddingHorizontal: theme.spacing[2], paddingVertical: theme.spacing[1] },
  rowActionPressed: { opacity: 0.6 },
  rowActionDanger: { color: theme.colors.destructive, fontSize: theme.fontSize.sm },
}));
