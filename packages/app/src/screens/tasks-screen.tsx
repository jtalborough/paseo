import { useCallback, useMemo, useState } from "react";
import type { PressableStateCallbackType } from "react-native";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useIsFocused } from "@react-navigation/native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { StyleSheet } from "react-native-unistyles";
import type { ActionState, StoredTask, TaskConfig } from "@getpaseo/protocol/task/types";
import type { TaskUpdateRpcPatch } from "@getpaseo/client/internal/daemon-client";
import { useIsCompactFormFactor } from "@/constants/layout";
import { MenuHeader } from "@/components/headers/menu-header";
import { TaskEditor } from "@/components/task-editor";
import type { SelectOption } from "@/components/task-select";
import { useToast } from "@/contexts/toast-context";
import { useSessionStore } from "@/stores/session-store";
import {
  countTasksByView,
  createDefaultsForView,
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

/** New tasks captured from the global screen land here until triaged. */
const CAPTURE_PROJECT = "inbox";

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

function rowKey(task: StoredTask): string {
  return `${task.metadata.project}/${task.metadata.id}`;
}

function TasksScreenContent({ serverId }: { serverId: string }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const isCompact = useIsCompactFormFactor();
  const client = useSessionStore((state) => state.sessions[serverId]?.client ?? null);
  const tasksSupported = useSessionStore(
    (state) => state.sessions[serverId]?.serverInfo?.features?.tasks === true,
  );

  const [view, setView] = useState<TaskView>("today");
  const [newTitle, setNewTitle] = useState("");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

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

  const today = todayIso();
  const createTask = useMutation({
    mutationFn: async (title: string) => {
      if (!client) throw new Error("Host is not connected");
      return client.taskCreate({
        project: CAPTURE_PROJECT,
        title,
        ...createDefaultsForView(view, today),
      });
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
  const counts = useMemo(() => countTasksByView(allTasks, today), [allTasks, today]);
  const visible = useMemo(() => filterTasksForView(allTasks, view, today), [allTasks, view, today]);
  const projectOptions = useMemo<SelectOption[]>(() => {
    const names = new Set(allTasks.map((t) => t.metadata.project));
    names.add(CAPTURE_PROJECT);
    return Array.from(names)
      .sort()
      .map((name) => ({ value: name, label: name }));
  }, [allTasks]);
  const selectedTask = useMemo(
    () => (selectedKey ? (allTasks.find((t) => rowKey(t) === selectedKey) ?? null) : null),
    [allTasks, selectedKey],
  );

  const createMutate = createTask.mutate;
  const handleAdd = useCallback(() => {
    const title = newTitle.trim();
    if (title.length > 0) {
      createMutate(title);
    }
  }, [createMutate, newTitle]);

  const toggleMutate = toggleDone.mutate;
  const handleToggle = useCallback(
    (task: StoredTask) => {
      const next: ActionState = task.metadata.actionState === "done" ? "todo" : "done";
      toggleMutate({ project: task.metadata.project, id: task.metadata.id, next });
    },
    [toggleMutate],
  );
  const handleSelect = useCallback((key: string) => setSelectedKey(key), []);
  const handleClosePanel = useCallback(() => setSelectedKey(null), []);

  const addDisabled = newTitle.trim().length === 0 || createTask.isPending;
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

  const showSidePanel = Boolean(selectedTask) && !isCompact;
  const showOverlayPanel = Boolean(selectedTask) && isCompact;

  return (
    <View style={styles.container}>
      <MenuHeader title="Tasks" />
      <View style={styles.body}>
        <View style={styles.listColumn}>
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
              placeholder={`New task in ${TASK_VIEW_LABEL[view]}…`}
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

          <TasksBody
            pending={tasksQuery.isPending}
            tasks={visible}
            emptyLabel={TASK_VIEW_LABEL[view]}
            selectedKey={selectedKey}
            onToggle={handleToggle}
            onSelect={handleSelect}
          />
        </View>

        {showSidePanel && selectedTask ? (
          <View style={styles.sidePanel}>
            <TaskPropertiesPanel
              task={selectedTask}
              serverId={serverId}
              projectOptions={projectOptions}
              onChanged={invalidate}
              onClose={handleClosePanel}
            />
          </View>
        ) : null}
      </View>

      {showOverlayPanel && selectedTask ? (
        <View style={styles.overlayPanel}>
          <TaskPropertiesPanel
            task={selectedTask}
            serverId={serverId}
            projectOptions={projectOptions}
            onChanged={invalidate}
            onClose={handleClosePanel}
          />
        </View>
      ) : null}
    </View>
  );
}

function TasksBody({
  pending,
  tasks,
  emptyLabel,
  selectedKey,
  onToggle,
  onSelect,
}: {
  pending: boolean;
  tasks: StoredTask[];
  emptyLabel: string;
  selectedKey: string | null;
  onToggle: (task: StoredTask) => void;
  onSelect: (key: string) => void;
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
          key={rowKey(task)}
          task={task}
          selected={selectedKey === rowKey(task)}
          onToggle={onToggle}
          onSelect={onSelect}
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

function TaskRow({
  task,
  selected,
  onToggle,
  onSelect,
}: {
  task: StoredTask;
  selected: boolean;
  onToggle: (task: StoredTask) => void;
  onSelect: (key: string) => void;
}) {
  const { actionState, title, project, doDate, priority } = task.metadata;
  const done = actionState === "done";
  const handleToggle = useCallback(() => onToggle(task), [onToggle, task]);
  const handleSelect = useCallback(() => onSelect(rowKey(task)), [onSelect, task]);
  const checkStyle = useMemo(() => [styles.check, done ? styles.checkDone : null], [done]);
  const titleStyle = useMemo(() => [styles.rowTitle, done ? styles.rowTitleDone : null], [done]);
  const rowStyle = useMemo(() => [styles.row, selected ? styles.rowSelected : null], [selected]);
  const subtitle = [project, doDate, priority ? `!${priority}` : null].filter(Boolean).join(" · ");

  return (
    <View style={rowStyle}>
      <Pressable accessibilityRole="button" onPress={handleToggle} style={checkStyle}>
        {done ? <Text style={styles.checkMark}>✓</Text> : null}
      </Pressable>
      <Pressable accessibilityRole="button" onPress={handleSelect} style={styles.rowBody}>
        <Text style={titleStyle} numberOfLines={2}>
          {title}
        </Text>
        <Text style={styles.rowSubtitle} numberOfLines={1}>
          {subtitle}
        </Text>
      </Pressable>
      <Text style={styles.rowState}>{ACTION_STATE_LABEL[actionState]}</Text>
    </View>
  );
}

const EMPTY_CONFIG: TaskConfig = { types: [], people: [], contexts: [] };

function TaskPropertiesPanel({
  task,
  serverId,
  projectOptions,
  onChanged,
  onClose,
}: {
  task: StoredTask;
  serverId: string;
  projectOptions: SelectOption[];
  onChanged: () => void;
  onClose: () => void;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const client = useSessionStore((state) => state.sessions[serverId]?.client ?? null);
  const project = task.metadata.project;

  const configKey = useMemo(() => ["task-config", serverId, project], [serverId, project]);
  const configQuery = useQuery({
    queryKey: configKey,
    enabled: Boolean(client),
    queryFn: async () => (client ? client.taskConfigGet(project) : EMPTY_CONFIG),
    staleTime: 30_000,
  });
  const config = configQuery.data ?? EMPTY_CONFIG;

  const onError = useCallback(
    (error: unknown) => toast.error(error instanceof Error ? error.message : "Failed"),
    [toast],
  );

  const patch = useMutation({
    mutationFn: async (input: { id: string; patch: TaskUpdateRpcPatch }) => {
      if (!client) throw new Error("Host is not connected");
      return client.taskUpdate(project, input.id, input.patch);
    },
    onSuccess: onChanged,
    onError,
  });
  const move = useMutation({
    mutationFn: async (newProject: string) => {
      if (!client) throw new Error("Host is not connected");
      return client.taskMove(project, task.metadata.id, newProject);
    },
    onSuccess: onChanged,
    onError,
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      if (!client) throw new Error("Host is not connected");
      await client.taskDelete(project, id);
    },
    onSuccess: () => {
      onChanged();
      onClose();
    },
    onError,
  });
  const updateConfig = useMutation({
    mutationFn: async (next: TaskConfig) => {
      if (!client) throw new Error("Host is not connected");
      return client.taskConfigUpdate(project, next);
    },
    onSuccess: (next) => queryClient.setQueryData(configKey, next),
    onError,
  });

  const patchMutate = patch.mutate;
  const handlePatch = useCallback(
    (id: string, p: TaskUpdateRpcPatch) => patchMutate({ id, patch: p }),
    [patchMutate],
  );
  const moveMutate = move.mutate;
  const handleChangeProject = useCallback((next: string) => moveMutate(next), [moveMutate]);
  const removeMutate = remove.mutate;
  const handleDelete = useCallback((id: string) => removeMutate(id), [removeMutate]);

  const updateConfigMutate = updateConfig.mutate;
  const addTo = useCallback(
    (key: "types" | "people" | "contexts", value: string) => {
      if (!config[key].includes(value)) {
        updateConfigMutate({ ...config, [key]: [...config[key], value] });
      }
    },
    [config, updateConfigMutate],
  );
  const removeFrom = useCallback(
    (key: "types" | "people" | "contexts", value: string) =>
      updateConfigMutate({ ...config, [key]: config[key].filter((v) => v !== value) }),
    [config, updateConfigMutate],
  );
  const onAddType = useCallback((v: string) => addTo("types", v), [addTo]);
  const onRemoveType = useCallback((v: string) => removeFrom("types", v), [removeFrom]);
  const onAddPerson = useCallback((v: string) => addTo("people", v), [addTo]);
  const onRemovePerson = useCallback((v: string) => removeFrom("people", v), [removeFrom]);
  const onAddContext = useCallback((v: string) => addTo("contexts", v), [addTo]);
  const onRemoveContext = useCallback((v: string) => removeFrom("contexts", v), [removeFrom]);

  return (
    <View style={styles.panel}>
      <View style={styles.panelHeader}>
        <Text style={styles.panelTitle} numberOfLines={2}>
          {task.metadata.title}
        </Text>
        <Pressable accessibilityRole="button" onPress={onClose} style={styles.panelClose}>
          <Text style={styles.panelCloseText}>✕</Text>
        </Pressable>
      </View>
      <ScrollView style={styles.panelScroll} contentContainerStyle={styles.panelScrollContent}>
        <TaskEditor
          task={task}
          config={config}
          onPatch={handlePatch}
          onDelete={handleDelete}
          onAddType={onAddType}
          onAddPerson={onAddPerson}
          onRemoveType={onRemoveType}
          onRemovePerson={onRemovePerson}
          onAddContext={onAddContext}
          onRemoveContext={onRemoveContext}
          projectOptions={projectOptions}
          onChangeProject={handleChangeProject}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: { flex: 1, backgroundColor: theme.colors.surface0 },
  body: { flex: 1, minHeight: 0, flexDirection: "row" },
  listColumn: { flex: 1, minWidth: 0 },
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
    padding: theme.spacing[3],
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
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[3],
    padding: theme.spacing[3],
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.surface1,
    borderWidth: 1,
    borderColor: "transparent",
  },
  rowSelected: { borderColor: theme.colors.accent },
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
  sidePanel: {
    width: 360,
    borderLeftWidth: 1,
    borderLeftColor: theme.colors.border,
    backgroundColor: theme.colors.surface0,
  },
  overlayPanel: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: theme.colors.surface0,
  },
  panel: { flex: 1, minHeight: 0 },
  panelHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    padding: theme.spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  panelTitle: {
    flex: 1,
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.medium,
  },
  panelClose: {
    width: 28,
    height: 28,
    borderRadius: theme.borderRadius.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.surface2,
  },
  panelCloseText: { color: theme.colors.foregroundMuted, fontSize: theme.fontSize.sm },
  panelScroll: { flex: 1, minHeight: 0 },
  panelScrollContent: { paddingBottom: theme.spacing[6] },
}));
