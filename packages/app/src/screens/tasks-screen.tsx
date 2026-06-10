import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { StoredTask, TaskConfig } from "@getpaseo/protocol/task/types";
import type { TaskUpdateRpcPatch } from "@getpaseo/client/internal/daemon-client";
import { StyleSheet } from "react-native-unistyles";
import { MenuHeader } from "@/components/headers/menu-header";
import { TaskList, taskKey } from "@/components/task-list";
import { TaskSelect, type SelectOption } from "@/components/task-select";
import { useToast } from "@/contexts/toast-context";
import { useProjectGroups } from "@/hooks/use-project-groups";
import { useSessionStore } from "@/stores/session-store";
import { BUILTIN_TASK_VIEWS, filterTasksByView, taskCreateInputForView } from "@/utils/task-views";
import {
  addTaskTimeDays,
  aggregateProjectDayTotals,
  formatTaskTimeDayLabel,
} from "@/utils/task-time";
import { formatDuration } from "@/components/task-timer";

const EMPTY_CONFIG: TaskConfig = { types: [], people: [], contexts: [] };
const EMPTY_TASKS: StoredTask[] = [];
const NOOP = () => {};

export function TasksScreen({
  serverId,
  initialTaskId = null,
  initialTaskProjectGroupId = null,
}: {
  serverId: string;
  initialTaskId?: string | null;
  initialTaskProjectGroupId?: string | null;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [viewId, setViewId] = useState("today");
  const [newTitle, setNewTitle] = useState("");
  const [newProjectGroupId, setNewProjectGroupId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const client = useSessionStore((state) => state.sessions[serverId]?.client ?? null);
  const supported = useSessionStore(
    (state) => state.sessions[serverId]?.serverInfo?.features?.tasks === true,
  );
  const { groups } = useProjectGroups(serverId);
  const queryKey = useMemo(() => ["tasks", serverId], [serverId]);
  const projectOptions = useMemo<SelectOption[]>(
    () => groups.map((group) => ({ value: group.groupId, label: group.displayName })),
    [groups],
  );

  useEffect(() => {
    if (!newProjectGroupId && groups[0]) {
      setNewProjectGroupId(groups[0].groupId);
    }
  }, [groups, newProjectGroupId]);

  const query = useQuery({
    queryKey,
    enabled: Boolean(client && supported),
    queryFn: async () => (client ? client.taskQuery() : []),
    staleTime: 2_000,
  });
  const viewsQuery = useQuery({
    queryKey: ["task-views", serverId],
    enabled: Boolean(client && supported),
    queryFn: async () => (client ? client.taskViewsGet() : []),
  });
  const invalidate = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey }),
      queryClient.invalidateQueries({ queryKey: ["project-tasks", serverId] }),
    ]);
  }, [queryClient, queryKey, serverId]);
  const onError = useCallback(
    (error: unknown) =>
      toast.error(error instanceof Error ? error.message : "Task operation failed"),
    [toast],
  );
  const views = useMemo(
    () => [...BUILTIN_TASK_VIEWS, ...(viewsQuery.data ?? [])],
    [viewsQuery.data],
  );
  const view = views.find((candidate) => candidate.id === viewId) ?? views[0]!;
  const createTask = useMutation({
    mutationFn: async () => {
      if (!client) throw new Error("Host is not connected");
      if (!newProjectGroupId) throw new Error("Select a Project");
      return client.taskCreate(
        taskCreateInputForView({
          projectGroupId: newProjectGroupId,
          title: newTitle.trim(),
          view,
        }),
      );
    },
    onSuccess: () => {
      setNewTitle("");
      void invalidate();
    },
    onError,
  });
  const patchTask = useMutation({
    mutationFn: async (input: { task: StoredTask; patch: TaskUpdateRpcPatch }) => {
      if (!client) throw new Error("Host is not connected");
      return client.taskUpdate(
        input.task.metadata.projectGroupId,
        input.task.metadata.id,
        input.patch,
      );
    },
    onSuccess: () => void invalidate(),
    onError,
  });
  const deleteTask = useMutation({
    mutationFn: async (task: StoredTask) => {
      if (!client) throw new Error("Host is not connected");
      await client.taskDelete(task.metadata.projectGroupId, task.metadata.id);
    },
    onSuccess: () => {
      setExpandedId(null);
      void invalidate();
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
      void invalidate();
    },
    onError,
  });
  const startTimer = useMutation({
    mutationFn: async (task: StoredTask) => {
      if (!client) throw new Error("Host is not connected");
      return client.taskTimerStart(task.metadata.projectGroupId, task.metadata.id);
    },
    onSuccess: () => void invalidate(),
    onError,
  });
  const stopTimer = useMutation({
    mutationFn: async (task: StoredTask) => {
      if (!client) throw new Error("Host is not connected");
      return client.taskTimerStop(task.metadata.projectGroupId, task.metadata.id);
    },
    onSuccess: () => void invalidate(),
    onError,
  });

  const patchMutate = patchTask.mutate;
  const handlePatch = useCallback(
    (task: StoredTask, patch: TaskUpdateRpcPatch) => patchMutate({ task, patch }),
    [patchMutate],
  );
  const moveMutate = moveTask.mutate;
  const handleChangeProject = useCallback(
    (task: StoredTask, projectGroupId: string) => moveMutate({ task, projectGroupId }),
    [moveMutate],
  );
  const handleCreate = useCallback(() => {
    if (newTitle.trim() && newProjectGroupId) createTask.mutate();
  }, [createTask, newProjectGroupId, newTitle]);
  const handleToggleExpanded = useCallback((task: StoredTask) => {
    const key = taskKey(task);
    setExpandedId((current) => (current === key ? null : key));
  }, []);
  const tasks = useMemo(
    () => filterTasksByView(query.data ?? EMPTY_TASKS, view),
    [query.data, view],
  );
  useEffect(() => {
    if (!initialTaskId || !initialTaskProjectGroupId) {
      return;
    }
    const targetKey = `${initialTaskProjectGroupId}:${initialTaskId}`;
    setViewId("all");
    setExpandedId(targetKey);
  }, [initialTaskId, initialTaskProjectGroupId]);

  if (!supported) {
    return (
      <View style={styles.container}>
        <MenuHeader title="Tasks" />
        <View style={styles.centered}>
          <Text style={styles.muted}>Update the host to use structured Tasks</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <MenuHeader title="Tasks" />
      <View style={styles.views}>
        {views.map((candidate) => (
          <TaskViewButton
            key={candidate.id}
            label={candidate.label}
            value={candidate.id}
            selected={viewId === candidate.id}
            onSelect={setViewId}
          />
        ))}
        <TaskViewButton
          label="Timesheet"
          value="timesheet"
          selected={viewId === "timesheet"}
          onSelect={setViewId}
        />
      </View>
      <View style={styles.composer}>
        <View style={styles.projectSelect}>
          <TaskSelect
            label=""
            options={projectOptions}
            value={newProjectGroupId}
            onSelect={setNewProjectGroupId}
            clearable={false}
          />
        </View>
        <TextInput
          style={styles.input}
          value={newTitle}
          onChangeText={setNewTitle}
          onSubmitEditing={handleCreate}
          placeholder="New task"
          returnKeyType="done"
        />
        <Pressable accessibilityRole="button" onPress={handleCreate} style={styles.addButton}>
          <Text style={styles.addButtonText}>Add</Text>
        </Pressable>
      </View>
      {viewId === "timesheet" ? (
        <TimesheetView tasks={query.data ?? EMPTY_TASKS} groups={groups} />
      ) : (
        <TaskList
          pending={query.isPending}
          error={query.error}
          tasks={tasks}
          expandedId={expandedId}
          config={EMPTY_CONFIG}
          onToggleExpanded={handleToggleExpanded}
          onPatch={handlePatch}
          onTimerStart={startTimer.mutate}
          onTimerStop={stopTimer.mutate}
          onDelete={deleteTask.mutate}
          projectOptions={projectOptions}
          onChangeProject={handleChangeProject}
          onAddType={NOOP}
          onAddPerson={NOOP}
          onAddContext={NOOP}
          onRemoveType={NOOP}
          onRemovePerson={NOOP}
          onRemoveContext={NOOP}
        />
      )}
    </View>
  );
}

function TimesheetView({
  tasks,
  groups,
}: {
  tasks: StoredTask[];
  groups: Array<{ groupId: string; displayName: string }>;
}) {
  const [day, setDay] = useState(() => new Date());
  const now = useMemo(() => new Date(), []);
  const totals = useMemo(() => aggregateProjectDayTotals(tasks, day, now), [day, now, tasks]);
  const dayLabel = useMemo(() => formatTaskTimeDayLabel(day, now), [day, now]);
  const names = useMemo(
    () => new Map(groups.map((group) => [group.groupId, group.displayName])),
    [groups],
  );
  const goPreviousDay = useCallback(() => setDay((current) => addTaskTimeDays(current, -1)), []);
  const goNextDay = useCallback(() => setDay((current) => addTaskTimeDays(current, 1)), []);
  const goToday = useCallback(() => setDay(new Date()), []);
  return (
    <View style={styles.timesheet}>
      <View style={styles.timesheetHeader}>
        <Text style={styles.timesheetTitle}>{dayLabel} by Project</Text>
        <View style={styles.timesheetControls}>
          <TimesheetDayButton label="Prev" onPress={goPreviousDay} />
          <TimesheetDayButton label="Today" onPress={goToday} />
          <TimesheetDayButton label="Next" onPress={goNextDay} />
        </View>
      </View>
      {totals.length > 0 ? (
        totals.map((total) => (
          <View key={total.projectGroupId} style={styles.timesheetRow}>
            <Text style={styles.timesheetProject}>
              {names.get(total.projectGroupId) ?? total.projectGroupId}
            </Text>
            <Text style={styles.timesheetTime}>{formatDuration(total.seconds)}</Text>
          </View>
        ))
      ) : (
        <Text style={styles.muted}>No tracked time for this day</Text>
      )}
    </View>
  );
}

function TimesheetDayButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.timesheetControl}>
      <Text style={styles.timesheetControlText}>{label}</Text>
    </Pressable>
  );
}

function TaskViewButton({
  label,
  value,
  selected,
  onSelect,
}: {
  label: string;
  value: string;
  selected: boolean;
  onSelect: (view: string) => void;
}) {
  const handlePress = useCallback(() => onSelect(value), [onSelect, value]);
  const buttonStyle = useMemo(
    () => (selected ? [styles.viewButton, styles.viewButtonSelected] : styles.viewButton),
    [selected],
  );
  return (
    <Pressable accessibilityRole="button" onPress={handlePress} style={buttonStyle}>
      <Text style={selected ? styles.viewLabelSelected : styles.viewLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: { flex: 1, minHeight: 0, backgroundColor: theme.colors.surface0 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: theme.spacing[6] },
  muted: { color: theme.colors.foregroundMuted, fontSize: theme.fontSize.xs },
  views: {
    flexDirection: "row",
    gap: theme.spacing[1],
    padding: theme.spacing[3],
    borderBottomWidth: theme.borderWidth[1],
    borderBottomColor: theme.colors.border,
  },
  viewButton: {
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    borderRadius: theme.borderRadius.md,
  },
  viewButtonSelected: { backgroundColor: theme.colors.surface2 },
  viewLabel: { color: theme.colors.foregroundMuted, fontSize: theme.fontSize.sm },
  viewLabelSelected: { color: theme.colors.foreground, fontSize: theme.fontSize.sm },
  composer: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    padding: theme.spacing[3],
    borderBottomWidth: theme.borderWidth[1],
    borderBottomColor: theme.colors.border,
  },
  projectSelect: { width: 220 },
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
  timesheet: { padding: theme.spacing[4], gap: theme.spacing[2] },
  timesheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[3],
  },
  timesheetTitle: { color: theme.colors.foreground, fontSize: theme.fontSize.base },
  timesheetControls: {
    flexDirection: "row",
    gap: theme.spacing[1],
  },
  timesheetControl: {
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[1],
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surface2,
  },
  timesheetControlText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
  timesheetRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    padding: theme.spacing[3],
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.surface1,
  },
  timesheetProject: { color: theme.colors.foreground, fontSize: theme.fontSize.sm },
  timesheetTime: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    fontVariant: ["tabular-nums"],
  },
}));
