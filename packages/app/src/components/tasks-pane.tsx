import { useCallback, useMemo, useState } from "react";
import type { PressableStateCallbackType } from "react-native";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { StoredTask, TaskStatus } from "@getpaseo/protocol/task/types";
import { useToast } from "@/contexts/toast-context";
import { useSessionStore } from "@/stores/session-store";
import { useWorkspaceExecutionAuthority } from "@/stores/session-store-hooks";
import { StyleSheet } from "react-native-unistyles";

const STATUS_ORDER: TaskStatus[] = ["todo", "doing", "done"];
const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: "To do",
  doing: "Doing",
  done: "Done",
};

function nextStatus(status: TaskStatus): TaskStatus {
  const index = STATUS_ORDER.indexOf(status);
  return STATUS_ORDER[(index + 1) % STATUS_ORDER.length];
}

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

  const queryKey = useMemo(() => ["tasks", serverId, projectId], [serverId, projectId]);
  const invalidate = useCallback(
    () => queryClient.invalidateQueries({ queryKey }),
    [queryClient, queryKey],
  );

  const tasksQuery = useQuery({
    queryKey,
    enabled: Boolean(client && projectId && tasksSupported),
    queryFn: async () => {
      if (!client || !projectId) {
        return [] as StoredTask[];
      }
      return client.taskList(projectId);
    },
    staleTime: 2_000,
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
      void invalidate();
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Failed to create task"),
  });

  const updateStatus = useMutation({
    mutationFn: async (params: { id: string; status: TaskStatus }) => {
      if (!client || !projectId) {
        throw new Error("Host is not connected");
      }
      return client.taskUpdate(projectId, params.id, { status: params.status });
    },
    onSuccess: () => void invalidate(),
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
    onSuccess: () => void invalidate(),
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
        void invalidate();
      } else {
        toast.error(result.error);
      }
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to run task"),
  });

  const trimmedTitle = newTitle.trim();
  const createMutate = createTask.mutate;
  const handleSubmit = useCallback(() => {
    if (trimmedTitle.length > 0) {
      createMutate(trimmedTitle);
    }
  }, [createMutate, trimmedTitle]);

  const updateMutate = updateStatus.mutate;
  const runMutate = runTask.mutate;
  const deleteMutate = deleteTask.mutate;
  const handleCycleStatus = useCallback(
    (id: string, status: TaskStatus) => updateMutate({ id, status: nextStatus(status) }),
    [updateMutate],
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
        onCycleStatus={handleCycleStatus}
        onRun={runMutate}
        onDelete={deleteMutate}
        runDisabled={runTask.isPending}
      />
    </View>
  );
}

function TaskListBody({
  query,
  tasks,
  onCycleStatus,
  onRun,
  onDelete,
  runDisabled,
}: {
  query: { isPending: boolean; isError: boolean; error: unknown };
  tasks: StoredTask[] | undefined;
  onCycleStatus: (id: string, status: TaskStatus) => void;
  onRun: (id: string) => void;
  onDelete: (id: string) => void;
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
          onCycleStatus={onCycleStatus}
          onRun={onRun}
          onDelete={onDelete}
          runDisabled={runDisabled}
        />
      ))}
    </ScrollView>
  );
}

function TaskRow({
  task,
  onCycleStatus,
  onRun,
  onDelete,
  runDisabled,
}: {
  task: StoredTask;
  onCycleStatus: (id: string, status: TaskStatus) => void;
  onRun: (id: string) => void;
  onDelete: (id: string) => void;
  runDisabled: boolean;
}) {
  const { id, status, title } = task.metadata;
  const handleCycle = useCallback(() => onCycleStatus(id, status), [onCycleStatus, id, status]);
  const handleRun = useCallback(() => onRun(id), [onRun, id]);
  const handleDelete = useCallback(() => onDelete(id), [onDelete, id]);

  const chipStyle = useMemo(() => [styles.statusChip, statusChipStyle(status)], [status]);
  const chipTextStyle = useMemo(
    () => [styles.statusChipText, statusChipTextStyle(status)],
    [status],
  );
  const titleStyle = useMemo(
    () => [styles.rowTitle, status === "done" ? styles.rowTitleDone : null],
    [status],
  );

  return (
    <View style={styles.row}>
      <Pressable accessibilityRole="button" onPress={handleCycle} style={chipStyle}>
        <Text style={chipTextStyle}>{STATUS_LABEL[status]}</Text>
      </Pressable>
      <Text style={titleStyle} numberOfLines={2}>
        {title}
      </Text>
      <Pressable
        accessibilityRole="button"
        disabled={runDisabled}
        onPress={handleRun}
        style={rowActionStyle}
      >
        <Text style={styles.rowActionText}>Run</Text>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={handleDelete} style={rowActionStyle}>
        <Text style={styles.rowActionDanger}>Delete</Text>
      </Pressable>
    </View>
  );
}

function rowActionStyle({ pressed }: PressableStateCallbackType) {
  return [styles.rowAction, pressed ? styles.rowActionPressed : null];
}

function statusChipStyle(status: TaskStatus) {
  if (status === "done") return styles.chipDone;
  if (status === "doing") return styles.chipDoing;
  return styles.chipTodo;
}

function statusChipTextStyle(status: TaskStatus) {
  if (status === "done") return styles.chipTextDone;
  if (status === "doing") return styles.chipTextDoing;
  return styles.chipTextTodo;
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
  addButtonText: { color: theme.colors.palette.white, fontWeight: theme.fontWeight.medium },
  list: { flex: 1, minHeight: 0 },
  listContent: { padding: theme.spacing[3], gap: theme.spacing[2] },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[3],
    padding: theme.spacing[3],
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.surface1,
  },
  rowTitle: { flex: 1, color: theme.colors.foreground, fontSize: theme.fontSize.sm },
  rowTitleDone: { color: theme.colors.foregroundMuted, textDecorationLine: "line-through" },
  statusChip: {
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[1],
    borderRadius: theme.borderRadius.md,
    minWidth: 56,
    alignItems: "center",
  },
  statusChipText: { fontSize: theme.fontSize.xs, fontWeight: theme.fontWeight.medium },
  chipTodo: { backgroundColor: theme.colors.surface3 },
  chipDoing: { backgroundColor: theme.colors.palette.amber[500] },
  chipDone: { backgroundColor: theme.colors.palette.green[600] },
  chipTextTodo: { color: theme.colors.foregroundMuted },
  chipTextDoing: { color: theme.colors.palette.white },
  chipTextDone: { color: theme.colors.palette.white },
  rowAction: { paddingHorizontal: theme.spacing[2], paddingVertical: theme.spacing[1] },
  rowActionPressed: { opacity: 0.6 },
  rowActionText: { color: theme.colors.accent, fontSize: theme.fontSize.sm },
  rowActionDanger: { color: theme.colors.destructive, fontSize: theme.fontSize.sm },
}));
