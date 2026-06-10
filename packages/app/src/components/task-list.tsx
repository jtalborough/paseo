import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import type { ActionState, StoredTask, TaskConfig } from "@getpaseo/protocol/task/types";
import type { TaskUpdateRpcPatch } from "@getpaseo/client/internal/daemon-client";
import { StyleSheet } from "react-native-unistyles";
import { TaskEditor } from "@/components/task-editor";
import type { SelectOption } from "@/components/task-select";
import { TaskTimer } from "@/components/task-timer";
import { taskRecurrenceLabel } from "@/utils/task-recurrence";

const ACTION_STATE_LABEL: Record<ActionState, string> = {
  todo: "ToDo",
  waiting: "Waiting",
  info: "Info",
  someday: "Someday",
  dropped: "Dropped",
  done: "Done",
};

export function TaskList({
  pending,
  error,
  tasks,
  emptyTitle = "No tasks yet",
  emptyDescription,
  expandedId,
  config,
  onToggleExpanded,
  onPatch,
  onTimerStart,
  onTimerStop,
  onDelete,
  onAddType,
  onAddPerson,
  onAddContext,
  onRemoveType,
  onRemovePerson,
  onRemoveContext,
  projectOptions,
  onChangeProject,
  onRun,
  getRunDisabled,
}: {
  pending: boolean;
  error: Error | null;
  tasks: StoredTask[];
  emptyTitle?: string;
  emptyDescription?: string;
  expandedId: string | null;
  config: TaskConfig;
  onToggleExpanded: (task: StoredTask) => void;
  onPatch: (task: StoredTask, patch: TaskUpdateRpcPatch) => void;
  onTimerStart: (task: StoredTask) => void;
  onTimerStop: (task: StoredTask) => void;
  onDelete: (task: StoredTask) => void;
  onAddType: (value: string) => void;
  onAddPerson: (value: string) => void;
  onAddContext: (value: string) => void;
  onRemoveType: (value: string) => void;
  onRemovePerson: (value: string) => void;
  onRemoveContext: (value: string) => void;
  projectOptions?: SelectOption[];
  onChangeProject?: (task: StoredTask, projectGroupId: string) => void;
  onRun?: (task: StoredTask) => void;
  getRunDisabled?: (task: StoredTask) => boolean;
}) {
  const [showCompleted, setShowCompleted] = useState(false);
  const { activeTasks, completedTasks } = useMemo(() => {
    const active: StoredTask[] = [];
    const completed: StoredTask[] = [];
    for (const task of tasks) {
      if (task.metadata.actionState === "done") {
        completed.push(task);
      } else {
        active.push(task);
      }
    }
    return { activeTasks: active, completedTasks: completed };
  }, [tasks]);
  const completedVisible = showCompleted || activeTasks.length === 0;
  const completedToggleable = activeTasks.length > 0;
  const toggleCompleted = useCallback(() => {
    setShowCompleted((current) => !current);
  }, []);
  const renderTask = useCallback(
    (task: StoredTask) => (
      <TaskRow
        key={`${task.metadata.projectGroupId}:${task.metadata.id}`}
        task={task}
        expanded={expandedId === taskKey(task)}
        config={config}
        onToggleExpanded={onToggleExpanded}
        onPatch={onPatch}
        onTimerStart={onTimerStart}
        onTimerStop={onTimerStop}
        onDelete={onDelete}
        onAddType={onAddType}
        onAddPerson={onAddPerson}
        onAddContext={onAddContext}
        onRemoveType={onRemoveType}
        onRemovePerson={onRemovePerson}
        onRemoveContext={onRemoveContext}
        projectOptions={projectOptions}
        onChangeProject={onChangeProject}
        onRun={onRun}
        getRunDisabled={getRunDisabled}
      />
    ),
    [
      config,
      expandedId,
      onAddContext,
      onAddPerson,
      onAddType,
      onChangeProject,
      onDelete,
      onPatch,
      onRemoveContext,
      onRemovePerson,
      onRemoveType,
      onTimerStart,
      onTimerStop,
      onToggleExpanded,
      onRun,
      getRunDisabled,
      projectOptions,
    ],
  );

  if (pending) {
    return <ActivityIndicator style={styles.loader} />;
  }
  if (error || tasks.length === 0) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyTitle}>{error?.message ?? emptyTitle}</Text>
        {!error && emptyDescription ? (
          <Text style={styles.emptyDescription}>{emptyDescription}</Text>
        ) : null}
      </View>
    );
  }
  return (
    <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
      {activeTasks.map(renderTask)}
      {completedTasks.length > 0 ? (
        <View style={styles.completedSection}>
          <Pressable
            accessibilityRole="button"
            disabled={!completedToggleable}
            onPress={completedToggleable ? toggleCompleted : undefined}
            style={styles.completedHeader}
          >
            <Text style={styles.completedTitle}>
              {completedTasks.length} completed task{completedTasks.length === 1 ? "" : "s"}
            </Text>
            {completedToggleable ? (
              <Text style={styles.completedAction}>{completedVisible ? "Hide" : "Show"}</Text>
            ) : null}
          </Pressable>
          {completedVisible ? completedTasks.map(renderTask) : null}
        </View>
      ) : null}
    </ScrollView>
  );
}

function TaskRow({
  task,
  expanded,
  config,
  onToggleExpanded,
  onPatch,
  onTimerStart,
  onTimerStop,
  onDelete,
  projectOptions,
  onChangeProject,
  onRun,
  getRunDisabled,
  ...editorProps
}: {
  task: StoredTask;
  expanded: boolean;
  config: TaskConfig;
  onToggleExpanded: (task: StoredTask) => void;
  onPatch: (task: StoredTask, patch: TaskUpdateRpcPatch) => void;
  onTimerStart: (task: StoredTask) => void;
  onTimerStop: (task: StoredTask) => void;
  onDelete: (task: StoredTask) => void;
  projectOptions?: SelectOption[];
  onChangeProject?: (task: StoredTask, projectGroupId: string) => void;
  onRun?: (task: StoredTask) => void;
  getRunDisabled?: (task: StoredTask) => boolean;
  onAddType: (value: string) => void;
  onAddPerson: (value: string) => void;
  onAddContext: (value: string) => void;
  onRemoveType: (value: string) => void;
  onRemovePerson: (value: string) => void;
  onRemoveContext: (value: string) => void;
}) {
  const handlePress = useCallback(() => onToggleExpanded(task), [onToggleExpanded, task]);
  const isDone = task.metadata.actionState === "done";
  const isRunning = Boolean(task.metadata.timerStartedAt);
  const handleToggleDone = useCallback(
    () => onPatch(task, { actionState: isDone ? "todo" : "done" }),
    [isDone, onPatch, task],
  );
  const titleStyle = useMemo(
    () => [styles.taskTitle, isRunning && styles.taskTitleRunning, isDone && styles.taskTitleDone],
    [isDone, isRunning],
  );
  const taskStyle = useMemo(() => [styles.task, isRunning && styles.taskRunning], [isRunning]);
  const stateDotStyle = useMemo(
    () => [styles.stateDot, isRunning && styles.stateDotRunning, isDone && styles.stateDotDone],
    [isDone, isRunning],
  );
  const checkboxAccessibilityState = useMemo(() => ({ checked: isDone }), [isDone]);
  const handleEditorPatch = useCallback(
    (_id: string, patch: TaskUpdateRpcPatch) => onPatch(task, patch),
    [onPatch, task],
  );
  const handleDelete = useCallback(() => onDelete(task), [onDelete, task]);
  const handleChangeProject = useCallback(
    (projectGroupId: string) => onChangeProject?.(task, projectGroupId),
    [onChangeProject, task],
  );
  const handleRun = useCallback(() => onRun?.(task), [onRun, task]);
  const badges = useMemo(
    () =>
      taskBadges(task, projectOptions && projectOptions.length > 1 ? projectOptions : undefined),
    [projectOptions, task],
  );
  return (
    <View style={taskStyle}>
      <View style={styles.taskHeader}>
        <Pressable
          accessibilityRole="checkbox"
          accessibilityLabel={isDone ? "Mark task not done" : "Mark task done"}
          accessibilityState={checkboxAccessibilityState}
          onPress={handleToggleDone}
          hitSlop={8}
          style={styles.stateButton}
        >
          <View style={stateDotStyle} />
        </Pressable>
        <Pressable accessibilityRole="button" onPress={handlePress} style={styles.taskText}>
          <Text style={titleStyle}>{task.metadata.title}</Text>
          <Text style={styles.muted}>
            {ACTION_STATE_LABEL[task.metadata.actionState]}
            {isRunning ? " - Active" : ""}
            {task.metadata.priority ? ` - ${task.metadata.priority}` : ""}
          </Text>
          {badges.length > 0 ? (
            <View style={styles.badges}>
              {badges.map((badge) => (
                <View key={badge} style={styles.badge}>
                  <Text style={styles.badgeText}>{badge}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </Pressable>
        <TaskTimer task={task} onStart={onTimerStart} onStop={onTimerStop} />
      </View>
      {expanded ? (
        <TaskEditor
          task={task}
          config={config}
          onPatch={handleEditorPatch}
          {...editorProps}
          projectOptions={projectOptions}
          onChangeProject={onChangeProject ? handleChangeProject : undefined}
          onRun={onRun ? handleRunAdapter(handleRun) : undefined}
          runDisabled={getRunDisabled?.(task) ?? false}
          onDelete={handleDeleteAdapter(handleDelete)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  loader: { flex: 1 },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: theme.spacing[6],
    gap: theme.spacing[2],
  },
  muted: { color: theme.colors.foregroundMuted, fontSize: theme.fontSize.xs },
  emptyTitle: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
  },
  emptyDescription: {
    maxWidth: 360,
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    lineHeight: theme.fontSize.sm * 1.4,
    textAlign: "center",
  },
  list: { flex: 1, minHeight: 0 },
  listContent: {
    width: "100%",
    padding: theme.spacing[4],
    gap: theme.spacing[2],
  },
  task: {
    overflow: "hidden",
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.surface1,
  },
  taskRunning: {
    borderWidth: 1,
    borderColor: theme.colors.accent,
    backgroundColor: theme.colors.surface2,
  },
  taskHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[3],
    padding: theme.spacing[3],
  },
  stateButton: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  stateDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.accent,
    backgroundColor: theme.colors.accent,
  },
  stateDotRunning: {
    shadowColor: theme.colors.accent,
    shadowOpacity: 0.5,
    shadowRadius: 6,
  },
  stateDotDone: {
    borderColor: theme.colors.foregroundMuted,
    backgroundColor: "transparent",
  },
  taskText: { flex: 1, minWidth: 0, gap: theme.spacing[1] },
  taskTitle: { color: theme.colors.foreground, fontSize: theme.fontSize.sm },
  taskTitleRunning: { fontWeight: theme.fontWeight.semibold },
  taskTitleDone: { color: theme.colors.foregroundMuted, textDecorationLine: "line-through" },
  completedSection: {
    gap: theme.spacing[2],
    marginTop: theme.spacing[2],
  },
  completedHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[2],
  },
  completedTitle: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.medium,
  },
  completedAction: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: theme.spacing[1] },
  badge: {
    maxWidth: 180,
    paddingHorizontal: theme.spacing[2],
    paddingVertical: 2,
    borderRadius: theme.borderRadius.sm,
    backgroundColor: theme.colors.surface2,
  },
  badgeText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
}));

export function taskKey(task: StoredTask): string {
  return `${task.metadata.projectGroupId}:${task.metadata.id}`;
}

function handleDeleteAdapter(handleDelete: () => void) {
  return () => handleDelete();
}

function handleRunAdapter(handleRun: () => void) {
  return () => handleRun();
}

function taskBadges(task: StoredTask, projectOptions?: SelectOption[]): string[] {
  const { metadata } = task;
  const badges: string[] = [];
  const projectName = projectOptions?.find((option) => option.value === metadata.projectGroupId);
  if (projectName) {
    badges.push(projectName.label);
  }
  if (metadata.doDate) {
    badges.push(`Do ${metadata.doDate}`);
  }
  const recurrence = taskRecurrenceLabel(metadata.recurrence);
  if (recurrence) {
    badges.push(recurrence);
  }
  if (metadata.remind.length > 0) {
    badges.push(`${metadata.remind.length} reminder${metadata.remind.length === 1 ? "" : "s"}`);
  }
  if (metadata.github) {
    badges.push("GitHub");
  }
  if (metadata.sources.some((source) => source.kind === "notion")) {
    badges.push("Notion");
  }
  if (metadata.links.length > 0) {
    badges.push(`${metadata.links.length} link${metadata.links.length === 1 ? "" : "s"}`);
  }
  return badges;
}
