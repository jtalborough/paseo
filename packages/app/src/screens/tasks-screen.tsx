import { useCallback, useMemo, useState } from "react";
import type { PressableStateCallbackType } from "react-native";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useIsFocused } from "@react-navigation/native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { StyleSheet } from "react-native-unistyles";
import type { ActionState, StoredTask } from "@getpaseo/protocol/task/types";
import { MenuHeader } from "@/components/headers/menu-header";
import { type SelectOption, TaskSelect } from "@/components/task-select";
import { useToast } from "@/contexts/toast-context";
import { useSessionStore } from "@/stores/session-store";
import {
  countTasksByView,
  filterTasksForView,
  TASK_VIEW_LABEL,
  TASK_VIEWS,
  type TaskView,
} from "@/screens/tasks-view-filter";

const ACTION_STATE_LABEL: Record<ActionState, string> = {
  todo: "ToDo",
  waiting: "Waiting",
  info: "Info",
  someday: "Someday",
  dropped: "Dropped",
  done: "Done",
};

export function TasksScreen({ serverId }: { serverId: string }) {
  const isFocused = useIsFocused();
  if (!isFocused) {
    return <View style={styles.container} />;
  }
  return <TasksScreenContent serverId={serverId} />;
}

function todayIso(): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString().slice(0, 10);
}

function TasksScreenContent({ serverId }: { serverId: string }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const client = useSessionStore((state) => state.sessions[serverId]?.client ?? null);
  const tasksSupported = useSessionStore(
    (state) => state.sessions[serverId]?.serverInfo?.features?.tasks === true,
  );

  const [view, setView] = useState<TaskView>("today");
  const [newTitle, setNewTitle] = useState("");
  const [project, setProject] = useState<string | null>(null);

  const queryKey = useMemo(() => ["tasks-all", serverId], [serverId]);
  const invalidate = useCallback(
    () => queryClient.invalidateQueries({ queryKey }),
    [queryClient, queryKey],
  );

  const tasksQuery = useQuery({
    queryKey,
    enabled: Boolean(client && tasksSupported),
    queryFn: async () => (client ? client.taskQuery() : ([] as StoredTask[])),
    staleTime: 2_000,
  });

  const createTask = useMutation({
    mutationFn: async (input: { project: string; title: string }) => {
      if (!client) throw new Error("Host is not connected");
      return client.taskCreate(input);
    },
    onSuccess: () => {
      setNewTitle("");
      void invalidate();
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Failed to create task"),
  });

  const toggleDone = useMutation({
    mutationFn: async (input: { project: string; id: string; next: ActionState }) => {
      if (!client) throw new Error("Host is not connected");
      return client.taskUpdate(input.project, input.id, { actionState: input.next });
    },
    onSuccess: () => void invalidate(),
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Failed to update task"),
  });

  const allTasks = tasksQuery.data ?? EMPTY;
  const today = todayIso();
  const counts = useMemo(() => countTasksByView(allTasks, today), [allTasks, today]);
  const visible = useMemo(() => filterTasksForView(allTasks, view, today), [allTasks, view, today]);
  const projectOptions = useMemo<SelectOption[]>(() => {
    const names = Array.from(new Set(allTasks.map((t) => t.metadata.project))).sort();
    return names.map((name) => ({ value: name, label: name }));
  }, [allTasks]);

  const resolvedProject = project ?? projectOptions[0]?.value ?? null;
  const createMutate = createTask.mutate;
  const handleAdd = useCallback(() => {
    const title = newTitle.trim();
    if (title.length > 0 && resolvedProject) {
      createMutate({ project: resolvedProject, title });
    }
  }, [createMutate, newTitle, resolvedProject]);

  const toggleMutate = toggleDone.mutate;
  const handleToggle = useCallback(
    (task: StoredTask) => {
      const next: ActionState = task.metadata.actionState === "done" ? "todo" : "done";
      toggleMutate({ project: task.metadata.project, id: task.metadata.id, next });
    },
    [toggleMutate],
  );

  const addDisabled = newTitle.trim().length === 0 || !resolvedProject || createTask.isPending;
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
      <View style={styles.container}>
        <MenuHeader title="Tasks" />
        <View style={styles.centered}>
          <Text style={styles.emptyText}>Update the host to use Tasks.</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <MenuHeader title="Tasks" />

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabsScroll}
        contentContainerStyle={styles.tabs}
      >
        {TASK_VIEWS.map((candidate) => (
          <ViewTab
            key={candidate}
            view={candidate}
            label={TASK_VIEW_LABEL[candidate]}
            count={counts[candidate]}
            active={candidate === view}
            onSelect={setView}
          />
        ))}
      </ScrollView>

      <View style={styles.composer}>
        <TextInput
          style={styles.input}
          value={newTitle}
          onChangeText={setNewTitle}
          placeholder="New task…"
          placeholderTextColor={PLACEHOLDER_COLOR}
          onSubmitEditing={handleAdd}
          returnKeyType="done"
        />
        <Pressable
          accessibilityRole="button"
          disabled={addDisabled}
          onPress={handleAdd}
          style={addButtonStyle}
        >
          <Text style={styles.addButtonText}>Add</Text>
        </Pressable>
      </View>
      <View style={styles.projectPickerRow}>
        <TaskSelect
          label="Project"
          options={projectOptions}
          value={resolvedProject}
          onSelect={setProject}
          clearable={false}
          editable
          onAddOption={setProject}
          placeholder="Pick or add a project"
        />
      </View>

      <TasksBody
        pending={tasksQuery.isPending}
        tasks={visible}
        emptyLabel={TASK_VIEW_LABEL[view]}
        onToggle={handleToggle}
      />
    </View>
  );
}

function TasksBody({
  pending,
  tasks,
  emptyLabel,
  onToggle,
}: {
  pending: boolean;
  tasks: StoredTask[];
  emptyLabel: string;
  onToggle: (task: StoredTask) => void;
}) {
  if (pending) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
      </View>
    );
  }
  if (tasks.length === 0) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyText}>Nothing in {emptyLabel}.</Text>
      </View>
    );
  }
  return (
    <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
      {tasks.map((task) => (
        <TaskRow
          key={`${task.metadata.project}/${task.metadata.id}`}
          task={task}
          onToggle={onToggle}
        />
      ))}
    </ScrollView>
  );
}

const EMPTY: StoredTask[] = [];
const PLACEHOLDER_COLOR = "#9ca3af";

function ViewTab({
  view,
  label,
  count,
  active,
  onSelect,
}: {
  view: TaskView;
  label: string;
  count: number;
  active: boolean;
  onSelect: (view: TaskView) => void;
}) {
  const handlePress = useCallback(() => onSelect(view), [onSelect, view]);
  const tabStyle = useMemo(() => [styles.tab, active ? styles.tabActive : null], [active]);
  const textStyle = useMemo(() => [styles.tabText, active ? styles.tabTextActive : null], [active]);
  return (
    <Pressable accessibilityRole="button" onPress={handlePress} style={tabStyle}>
      <Text style={textStyle}>
        {label}
        {count > 0 ? ` ${count}` : ""}
      </Text>
    </Pressable>
  );
}

function TaskRow({ task, onToggle }: { task: StoredTask; onToggle: (task: StoredTask) => void }) {
  const { actionState, title, project, doDate, priority } = task.metadata;
  const done = actionState === "done";
  const handleToggle = useCallback(() => onToggle(task), [onToggle, task]);
  const checkStyle = useMemo(() => [styles.check, done ? styles.checkDone : null], [done]);
  const titleStyle = useMemo(() => [styles.rowTitle, done ? styles.rowTitleDone : null], [done]);
  const subtitle = [project, doDate, priority ? `!${priority}` : null].filter(Boolean).join(" · ");
  return (
    <View style={styles.row}>
      <Pressable accessibilityRole="button" onPress={handleToggle} style={checkStyle}>
        {done ? <Text style={styles.checkMark}>✓</Text> : null}
      </Pressable>
      <View style={styles.rowBody}>
        <Text style={titleStyle} numberOfLines={2}>
          {title}
        </Text>
        <Text style={styles.rowSubtitle} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
      <Text style={styles.rowState}>{ACTION_STATE_LABEL[actionState]}</Text>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: { flex: 1, backgroundColor: theme.colors.surface0 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: theme.spacing[6] },
  emptyText: { color: theme.colors.foregroundMuted, fontSize: theme.fontSize.sm },
  tabsScroll: { flexGrow: 0, borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  tabs: { gap: theme.spacing[1], padding: theme.spacing[2] },
  tab: {
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[1],
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surface2,
  },
  tabActive: { backgroundColor: theme.colors.accent },
  tabText: { color: theme.colors.foregroundMuted, fontSize: theme.fontSize.sm },
  tabTextActive: { color: theme.colors.accentForeground, fontWeight: theme.fontWeight.medium },
  composer: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
    paddingTop: theme.spacing[3],
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
  projectPickerRow: { paddingHorizontal: theme.spacing[3], paddingVertical: theme.spacing[2] },
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
  check: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: theme.colors.foregroundMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  checkDone: { backgroundColor: theme.colors.accent, borderColor: theme.colors.accent },
  checkMark: { color: theme.colors.accentForeground, fontSize: theme.fontSize.sm },
  rowBody: { flex: 1, gap: 2 },
  rowTitle: { color: theme.colors.foreground, fontSize: theme.fontSize.sm },
  rowTitleDone: { color: theme.colors.foregroundMuted, textDecorationLine: "line-through" },
  rowSubtitle: { color: theme.colors.foregroundMuted, fontSize: theme.fontSize.xs },
  rowState: { color: theme.colors.foregroundMuted, fontSize: theme.fontSize.xs },
}));
