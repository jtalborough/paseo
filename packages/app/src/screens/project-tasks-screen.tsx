import { useCallback, useMemo, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import type { PressableStateCallbackType } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { StoredTask, TaskConfig } from "@getpaseo/protocol/task/types";
import type {
  ScheduleApprovalMode,
  ScheduleExecutionMode,
  ScheduleMissedRunPolicy,
  ScheduleRetryPolicy,
  ScheduleSummary,
} from "@getpaseo/protocol/schedule/types";
import type { TaskUpdateRpcPatch } from "@getpaseo/client/internal/daemon-client";
import { StyleSheet } from "react-native-unistyles";
import { ProjectSurfaceHeader } from "@/components/project-surface-header";
import type { TaskScheduleDraft, TaskScheduleUpdateDraft } from "@/components/task-editor";
import { TaskList, taskKey } from "@/components/task-list";
import { formatDuration } from "@/components/task-timer";
import type { SelectOption } from "@/components/task-select";
import { useToast } from "@/contexts/toast-context";
import { useProjectGroups } from "@/hooks/use-project-groups";
import { useSessionStore } from "@/stores/session-store";
import { confirmDialog } from "@/utils/confirm-dialog";
import {
  addTaskTimeDays,
  aggregateTaskDayTotals,
  formatTaskTimeDayLabel,
  totalSecondsForDay,
} from "@/utils/task-time";

interface ProjectTasksScreenProps {
  serverId: string;
  groupId: string;
  embedded?: boolean;
}

type ProjectTaskView = "tasks" | "schedules" | "timesheet";

interface ProjectScheduleItem {
  task: StoredTask;
  scheduleId: string;
  schedule: ScheduleSummary | null;
}

interface ProjectTaskViewContentProps {
  view: ProjectTaskView;
  tasksPending: boolean;
  tasksError: Error | null;
  schedulesPending: boolean;
  schedulesError: Error | null;
  tasks: StoredTask[];
  projectScheduleItems: ProjectScheduleItem[];
  scheduleActionDisabled: boolean;
  expandedId: string | null;
  config: TaskConfig;
  projectOptions: SelectOption[];
  onOpenScheduledTask: (task: StoredTask) => void;
  onRunScheduleNow: (scheduleId: string) => void;
  onPauseSchedule: (scheduleId: string) => void;
  onResumeSchedule: (scheduleId: string) => void;
  onDeleteSchedule: (task: StoredTask, scheduleId: string) => void;
  onAcknowledgeScheduleRun: (task: StoredTask, scheduleId: string, runId: string) => void;
  onOpenTimesheetTask: (taskKey: string) => void;
  onSelectView: (view: ProjectTaskView) => void;
  onToggleExpanded: (task: StoredTask) => void;
  onPatch: (task: StoredTask, patch: TaskUpdateRpcPatch) => void;
  onTimerStart: (task: StoredTask) => void;
  onTimerStop: (task: StoredTask) => void;
  onDeleteTask: (task: StoredTask) => void;
  onRunTask: (task: StoredTask) => void;
  getRunDisabled: (task: StoredTask) => boolean;
  onScheduleTask: (task: StoredTask, draft: TaskScheduleDraft) => void;
  getScheduleDisabled: (task: StoredTask) => boolean;
  getScheduleDisabledReason: (task: StoredTask) => string | null;
  getSchedules: (task: StoredTask) => ScheduleSummary[];
  getScheduleActions: (task: StoredTask) => {
    disabled: boolean;
    onRunNow: (scheduleId: string) => void;
    onPause: (scheduleId: string) => void;
    onResume: (scheduleId: string) => void;
    onUpdate: (scheduleId: string, draft: TaskScheduleUpdateDraft) => void;
    onDelete: (scheduleId: string) => void;
  };
  onChangeProject: (task: StoredTask, projectGroupId: string) => void;
  onAddType: (value: string) => void;
  onAddPerson: (value: string) => void;
  onAddContext: (value: string) => void;
  onRemoveType: (value: string) => void;
  onRemovePerson: (value: string) => void;
  onRemoveContext: (value: string) => void;
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
  const [view, setView] = useState<ProjectTaskView>("tasks");
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
  const schedulesKey = useMemo(() => ["schedules", serverId], [serverId]);
  const invalidateTasks = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: tasksKey }),
      queryClient.invalidateQueries({ queryKey: ["tasks", serverId] }),
      queryClient.invalidateQueries({ queryKey: ["project-tasks", serverId] }),
    ]);
  }, [queryClient, serverId, tasksKey]);
  const invalidateSchedules = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: schedulesKey });
  }, [queryClient, schedulesKey]);
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
  const schedulesQuery = useQuery({
    queryKey: schedulesKey,
    enabled: Boolean(client && group && tasksSupported),
    queryFn: async () => {
      if (!client) {
        return [];
      }
      const payload = await client.scheduleList();
      if (payload.error) {
        throw new Error(payload.error);
      }
      return payload.schedules;
    },
    staleTime: 2_000,
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
  const scheduleTask = useMutation({
    mutationFn: async (input: { task: StoredTask; draft: TaskScheduleDraft }) => {
      if (!client) throw new Error("Host is not connected");
      if (!taskRunRepoRoot) {
        throw new Error("Task schedules require exactly one git folder in this Project");
      }
      const provider = input.task.metadata.provider?.trim();
      if (!provider) {
        throw new Error("Set an agent provider before scheduling this task");
      }
      return client.taskScheduleCreate({
        projectGroupId: input.task.metadata.projectGroupId,
        id: input.task.metadata.id,
        repoRoot: taskRunRepoRoot,
        provider,
        cadence: input.draft.cadence,
        executionMode: input.draft.executionMode,
        approvalMode: input.draft.approvalMode,
        missedRunPolicy: input.draft.missedRunPolicy,
        retryPolicy: input.draft.retryPolicy,
        name: input.draft.name,
        runOnCreate: input.draft.runOnCreate,
      });
    },
    onSuccess: (result) => {
      void invalidateTasks();
      void invalidateSchedules();
      toast.show(`Scheduled ${result.schedule.id}`, { variant: "success" });
    },
    onError,
  });
  const runScheduleNow = useMutation({
    mutationFn: async (scheduleId: string) => {
      if (!client) throw new Error("Host is not connected");
      const payload = await client.scheduleRunOnce({ id: scheduleId });
      if (payload.error) {
        throw new Error(payload.error);
      }
      return payload.schedule;
    },
    onSuccess: () => {
      void invalidateTasks();
      void invalidateSchedules();
      toast.show("Scheduled agent run started", { variant: "success" });
    },
    onError,
  });
  const pauseSchedule = useMutation({
    mutationFn: async (scheduleId: string) => {
      if (!client) throw new Error("Host is not connected");
      const payload = await client.schedulePause({ id: scheduleId });
      if (payload.error) {
        throw new Error(payload.error);
      }
      return payload.schedule;
    },
    onSuccess: () => {
      void invalidateSchedules();
      toast.show("Schedule paused", { variant: "success" });
    },
    onError,
  });
  const resumeSchedule = useMutation({
    mutationFn: async (scheduleId: string) => {
      if (!client) throw new Error("Host is not connected");
      const payload = await client.scheduleResume({ id: scheduleId });
      if (payload.error) {
        throw new Error(payload.error);
      }
      return payload.schedule;
    },
    onSuccess: () => {
      void invalidateSchedules();
      toast.show("Schedule resumed", { variant: "success" });
    },
    onError,
  });
  const updateSchedule = useMutation({
    mutationFn: async (input: { scheduleId: string; draft: TaskScheduleUpdateDraft }) => {
      if (!client) throw new Error("Host is not connected");
      const name = input.draft.name;
      const payload = await client.scheduleUpdate({
        id: input.scheduleId,
        cadence: input.draft.cadence,
        executionMode: input.draft.executionMode,
        approvalMode: input.draft.approvalMode,
        missedRunPolicy: input.draft.missedRunPolicy,
        retryPolicy: input.draft.retryPolicy,
        ...(name !== undefined ? { name } : {}),
      });
      if (payload.error) {
        throw new Error(payload.error);
      }
      return payload.schedule;
    },
    onSuccess: () => {
      void invalidateSchedules();
      toast.show("Schedule updated", { variant: "success" });
    },
    onError,
  });
  const deleteSchedule = useMutation({
    mutationFn: async (input: { task: StoredTask; scheduleId: string }) => {
      if (!client) throw new Error("Host is not connected");
      const payload = await client.scheduleDelete({ id: input.scheduleId });
      if (payload.error) {
        throw new Error(payload.error);
      }
      await client.taskUpdate(input.task.metadata.projectGroupId, input.task.metadata.id, {
        scheduleIds: input.task.metadata.scheduleIds.filter((id) => id !== input.scheduleId),
      });
      return payload.scheduleId;
    },
    onSuccess: () => {
      void invalidateTasks();
      void invalidateSchedules();
      toast.show("Schedule deleted", { variant: "success" });
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
  const handleAcknowledgeScheduleRun = useCallback(
    (task: StoredTask, scheduleId: string, runId: string) => {
      const acknowledgedAt = new Date().toISOString();
      patchMutate({
        id: task.metadata.id,
        patch: {
          scheduledRuns: task.metadata.scheduledRuns.map((run) =>
            run.scheduleId === scheduleId && run.runId === runId ? { ...run, acknowledgedAt } : run,
          ),
        },
      });
    },
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
  const scheduleTaskMutate = scheduleTask.mutate;
  const handleScheduleTask = useCallback(
    (task: StoredTask, draft: TaskScheduleDraft) => scheduleTaskMutate({ task, draft }),
    [scheduleTaskMutate],
  );
  const runScheduleNowMutate = runScheduleNow.mutate;
  const pauseScheduleMutate = pauseSchedule.mutate;
  const resumeScheduleMutate = resumeSchedule.mutate;
  const updateScheduleMutate = updateSchedule.mutate;
  const deleteScheduleMutate = deleteSchedule.mutate;
  const confirmDeleteSchedule = useCallback(
    async (task: StoredTask, scheduleId: string) => {
      const confirmed = await confirmDialog({
        title: "Delete schedule?",
        message: `Delete schedule ${scheduleId} from "${task.metadata.title}"? Future runs will stop.`,
        confirmLabel: "Delete",
        destructive: true,
      });
      if (confirmed) {
        deleteScheduleMutate({ task, scheduleId });
      }
    },
    [deleteScheduleMutate],
  );
  const getRunDisabled = useCallback(
    (task: StoredTask) => isTaskAgentActionDisabled(runTask.isPending, taskRunRepoRoot, task),
    [runTask.isPending, taskRunRepoRoot],
  );
  const getScheduleDisabled = useCallback(
    (task: StoredTask) =>
      getTaskScheduleDisabledReason(scheduleTask.isPending, taskRunRepoRoot, task) !== null,
    [scheduleTask.isPending, taskRunRepoRoot],
  );
  const getScheduleDisabledReason = useCallback(
    (task: StoredTask) =>
      getTaskScheduleDisabledReason(scheduleTask.isPending, taskRunRepoRoot, task),
    [scheduleTask.isPending, taskRunRepoRoot],
  );
  const scheduleActionDisabled = isAnyScheduleActionPending({
    runScheduleNow: runScheduleNow.isPending,
    pauseSchedule: pauseSchedule.isPending,
    resumeSchedule: resumeSchedule.isPending,
    updateSchedule: updateSchedule.isPending,
    deleteSchedule: deleteSchedule.isPending,
  });
  const schedulesById = useMemo(() => {
    const map = new Map<string, ScheduleSummary>();
    for (const schedule of schedulesQuery.data ?? []) {
      map.set(schedule.id, schedule);
    }
    return map;
  }, [schedulesQuery.data]);
  const getTaskSchedules = useCallback(
    (task: StoredTask) =>
      task.metadata.scheduleIds
        .map((id) => schedulesById.get(id))
        .filter((schedule): schedule is ScheduleSummary => schedule !== undefined),
    [schedulesById],
  );
  const projectScheduleItems = useMemo<ProjectScheduleItem[]>(
    () =>
      (tasksQuery.data ?? EMPTY_TASKS).flatMap((task) =>
        task.metadata.scheduleIds.map((scheduleId) => ({
          task,
          scheduleId,
          schedule: schedulesById.get(scheduleId) ?? null,
        })),
      ),
    [schedulesById, tasksQuery.data],
  );
  const getScheduleActions = useCallback(
    (task: StoredTask) => ({
      disabled: scheduleActionDisabled,
      onRunNow: runScheduleNowMutate,
      onPause: pauseScheduleMutate,
      onResume: resumeScheduleMutate,
      onUpdate: (scheduleId: string, draft: TaskScheduleUpdateDraft) =>
        updateScheduleMutate({ scheduleId, draft }),
      onDelete: (scheduleId: string) => void confirmDeleteSchedule(task, scheduleId),
    }),
    [
      confirmDeleteSchedule,
      pauseScheduleMutate,
      resumeScheduleMutate,
      runScheduleNowMutate,
      scheduleActionDisabled,
      updateScheduleMutate,
    ],
  );
  const handleToggleExpanded = useCallback((task: StoredTask) => {
    const key = taskKey(task);
    setExpandedId((current) => (current === key ? null : key));
  }, []);
  const handleOpenScheduledTask = useCallback((task: StoredTask) => {
    setExpandedId(taskKey(task));
    setView("tasks");
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
      <View style={styles.viewTabs}>
        <ProjectTaskViewButton
          label="Tasks"
          value="tasks"
          selected={view === "tasks"}
          onSelect={setView}
        />
        <ProjectTaskViewButton
          label="Schedules"
          value="schedules"
          selected={view === "schedules"}
          onSelect={setView}
        />
        <ProjectTaskViewButton
          label="Timesheet"
          value="timesheet"
          selected={view === "timesheet"}
          onSelect={setView}
        />
      </View>
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
      <ProjectTaskViewContent
        view={view}
        tasksPending={tasksQuery.isPending}
        tasksError={tasksQuery.error}
        schedulesPending={schedulesQuery.isPending}
        schedulesError={schedulesQuery.error}
        tasks={tasksQuery.data ?? EMPTY_TASKS}
        projectScheduleItems={projectScheduleItems}
        scheduleActionDisabled={scheduleActionDisabled}
        expandedId={expandedId}
        config={config}
        projectOptions={projectOptions}
        onOpenScheduledTask={handleOpenScheduledTask}
        onRunScheduleNow={runScheduleNowMutate}
        onPauseSchedule={pauseScheduleMutate}
        onResumeSchedule={resumeScheduleMutate}
        onDeleteSchedule={confirmDeleteSchedule}
        onAcknowledgeScheduleRun={handleAcknowledgeScheduleRun}
        onOpenTimesheetTask={setExpandedId}
        onSelectView={setView}
        onToggleExpanded={handleToggleExpanded}
        onPatch={handlePatch}
        onTimerStart={handleTimerStart}
        onTimerStop={handleTimerStop}
        onDeleteTask={handleDelete}
        onRunTask={handleRunTask}
        getRunDisabled={getRunDisabled}
        onScheduleTask={handleScheduleTask}
        getScheduleDisabled={getScheduleDisabled}
        getScheduleDisabledReason={getScheduleDisabledReason}
        getSchedules={getTaskSchedules}
        getScheduleActions={getScheduleActions}
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

function ProjectTaskViewContent({
  view,
  tasksPending,
  tasksError,
  schedulesPending,
  schedulesError,
  tasks,
  projectScheduleItems,
  scheduleActionDisabled,
  expandedId,
  config,
  projectOptions,
  onOpenScheduledTask,
  onRunScheduleNow,
  onPauseSchedule,
  onResumeSchedule,
  onDeleteSchedule,
  onAcknowledgeScheduleRun,
  onOpenTimesheetTask,
  onSelectView,
  onToggleExpanded,
  onPatch,
  onTimerStart,
  onTimerStop,
  onDeleteTask,
  onRunTask,
  getRunDisabled,
  onScheduleTask,
  getScheduleDisabled,
  getScheduleDisabledReason,
  getSchedules,
  getScheduleActions,
  onChangeProject,
  onAddType,
  onAddPerson,
  onAddContext,
  onRemoveType,
  onRemovePerson,
  onRemoveContext,
}: ProjectTaskViewContentProps) {
  if (view === "timesheet") {
    return (
      <ProjectTimesheetView
        pending={tasksPending}
        error={tasksError}
        tasks={tasks}
        onOpenTask={onOpenTimesheetTask}
        onSelectTasksView={onSelectView}
      />
    );
  }
  if (view === "schedules") {
    return (
      <ProjectSchedulesView
        pending={tasksPending || schedulesPending}
        error={tasksError ?? schedulesError}
        items={projectScheduleItems}
        disabled={scheduleActionDisabled}
        onOpenTask={onOpenScheduledTask}
        onRunNow={onRunScheduleNow}
        onPause={onPauseSchedule}
        onResume={onResumeSchedule}
        onDelete={onDeleteSchedule}
        onAcknowledge={onAcknowledgeScheduleRun}
      />
    );
  }
  return (
    <TaskList
      pending={tasksPending}
      error={tasksError}
      tasks={tasks}
      emptyTitle="No Project tasks yet"
      emptyDescription="Create the first task above. Tasks are stored as plain Markdown in this Project and can be opened beside agents, notes, terminals, and browser tabs."
      expandedId={expandedId}
      config={config}
      onToggleExpanded={onToggleExpanded}
      onPatch={onPatch}
      onTimerStart={onTimerStart}
      onTimerStop={onTimerStop}
      onDelete={onDeleteTask}
      onRun={onRunTask}
      getRunDisabled={getRunDisabled}
      onSchedule={onScheduleTask}
      getScheduleDisabled={getScheduleDisabled}
      getScheduleDisabledReason={getScheduleDisabledReason}
      getSchedules={getSchedules}
      getScheduleActions={getScheduleActions}
      projectOptions={projectOptions}
      onChangeProject={onChangeProject}
      onAddType={onAddType}
      onAddPerson={onAddPerson}
      onAddContext={onAddContext}
      onRemoveType={onRemoveType}
      onRemovePerson={onRemovePerson}
      onRemoveContext={onRemoveContext}
    />
  );
}

function ProjectTaskViewButton({
  label,
  value,
  selected,
  onSelect,
}: {
  label: string;
  value: ProjectTaskView;
  selected: boolean;
  onSelect: (view: ProjectTaskView) => void;
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

function ProjectSchedulesView({
  pending,
  error,
  items,
  disabled,
  onOpenTask,
  onRunNow,
  onPause,
  onResume,
  onDelete,
  onAcknowledge,
}: {
  pending: boolean;
  error: Error | null;
  items: ProjectScheduleItem[];
  disabled: boolean;
  onOpenTask: (task: StoredTask) => void;
  onRunNow: (scheduleId: string) => void;
  onPause: (scheduleId: string) => void;
  onResume: (scheduleId: string) => void;
  onDelete: (task: StoredTask, scheduleId: string) => void;
  onAcknowledge: (task: StoredTask, scheduleId: string, runId: string) => void;
}) {
  const attentionCount = useMemo(() => items.filter(hasUnacknowledgedFailure).length, [items]);
  if (pending) {
    return (
      <View style={styles.centered}>
        <Text style={styles.muted}>Loading schedules...</Text>
      </View>
    );
  }
  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.muted}>{error.message}</Text>
      </View>
    );
  }
  return (
    <View style={styles.schedules}>
      <View style={styles.schedulesHeader}>
        <Text style={styles.schedulesTitle}>Scheduled agent tasks</Text>
        <Text style={styles.muted}>
          {items.length} active task link{items.length === 1 ? "" : "s"}
          {attentionCount > 0 ? ` - ${attentionCount} need attention` : ""}
        </Text>
      </View>
      {items.length > 0 ? (
        items.map((item) => (
          <ProjectScheduleRow
            key={`${item.task.metadata.id}:${item.scheduleId}`}
            item={item}
            disabled={disabled}
            onOpenTask={onOpenTask}
            onRunNow={onRunNow}
            onPause={onPause}
            onResume={onResume}
            onDelete={onDelete}
            onAcknowledge={onAcknowledge}
          />
        ))
      ) : (
        <Text style={styles.muted}>No scheduled agent tasks in this Project</Text>
      )}
    </View>
  );
}

function ProjectScheduleRow({
  item,
  disabled,
  onOpenTask,
  onRunNow,
  onPause,
  onResume,
  onDelete,
  onAcknowledge,
}: {
  item: ProjectScheduleItem;
  disabled: boolean;
  onOpenTask: (task: StoredTask) => void;
  onRunNow: (scheduleId: string) => void;
  onPause: (scheduleId: string) => void;
  onResume: (scheduleId: string) => void;
  onDelete: (task: StoredTask, scheduleId: string) => void;
  onAcknowledge: (task: StoredTask, scheduleId: string, runId: string) => void;
}) {
  const { task, schedule, scheduleId } = item;
  const openTask = useCallback(() => onOpenTask(task), [onOpenTask, task]);
  const runNow = useCallback(() => onRunNow(scheduleId), [onRunNow, scheduleId]);
  const pause = useCallback(() => onPause(scheduleId), [onPause, scheduleId]);
  const resume = useCallback(() => onResume(scheduleId), [onResume, scheduleId]);
  const deleteSchedule = useCallback(
    () => onDelete(task, scheduleId),
    [onDelete, scheduleId, task],
  );
  const isPaused = schedule?.status === "paused";
  const latestRun = task.metadata.scheduledRuns
    .toReversed()
    .find((run) => run.scheduleId === scheduleId);
  const needsAttention = latestRun?.status === "failed" && latestRun.acknowledgedAt === null;
  const acknowledge = useCallback(() => {
    if (latestRun) {
      onAcknowledge(task, scheduleId, latestRun.runId);
    }
  }, [latestRun, onAcknowledge, scheduleId, task]);
  const rowStyle = useMemo(
    () => [styles.scheduleRow, needsAttention ? styles.scheduleRowAttention : null],
    [needsAttention],
  );
  return (
    <View style={rowStyle}>
      <View style={styles.scheduleRowMain}>
        <Text style={styles.scheduleRowTitle} numberOfLines={1}>
          {schedule?.name ?? task.metadata.title}
        </Text>
        <Text style={styles.scheduleRowTask} numberOfLines={1}>
          {task.metadata.title}
        </Text>
        <Text style={styles.scheduleRowMeta}>{formatProjectScheduleTiming(schedule)}</Text>
        {schedule ? (
          <Text style={styles.scheduleRowMeta}>
            {formatProjectScheduleExecutionMode(schedule.executionMode)}
          </Text>
        ) : null}
        {schedule ? (
          <Text style={styles.scheduleRowMeta}>
            {formatProjectScheduleApprovalMode(schedule.approvalMode)}
          </Text>
        ) : null}
        {schedule ? (
          <Text style={styles.scheduleRowMeta}>
            {formatProjectScheduleMissedRunPolicy(schedule.missedRunPolicy)}
          </Text>
        ) : null}
        {schedule ? (
          <Text style={styles.scheduleRowMeta}>
            {formatProjectScheduleRetryPolicy(schedule.retryPolicy)}
          </Text>
        ) : null}
        {schedule ? (
          <Text style={styles.scheduleRowMeta}>
            {formatProjectScheduleCadence(schedule.cadence)}
          </Text>
        ) : (
          <Text style={styles.scheduleRowError}>Schedule definition missing</Text>
        )}
        {latestRun ? (
          <Text style={needsAttention ? styles.scheduleRowError : styles.scheduleRowMeta}>
            Last run {latestRun.status} - {formatProjectScheduleTime(latestRun.scheduledFor)}
            {needsAttention ? " - needs attention" : ""}
          </Text>
        ) : null}
      </View>
      <View style={styles.scheduleRowActions}>
        <ScheduleRowButton label="Open task" disabled={false} onPress={openTask} />
        {needsAttention ? (
          <ScheduleRowButton label="Acknowledge" disabled={disabled} onPress={acknowledge} />
        ) : null}
        <ScheduleRowButton label="Run" disabled={disabled || !schedule} onPress={runNow} />
        {isPaused ? (
          <ScheduleRowButton label="Resume" disabled={disabled || !schedule} onPress={resume} />
        ) : (
          <ScheduleRowButton label="Pause" disabled={disabled || !schedule} onPress={pause} />
        )}
        <ScheduleRowButton
          label="Delete"
          destructive
          disabled={disabled}
          onPress={deleteSchedule}
        />
      </View>
    </View>
  );
}

function ScheduleRowButton({
  label,
  disabled,
  destructive = false,
  onPress,
}: {
  label: string;
  disabled: boolean;
  destructive?: boolean;
  onPress: () => void;
}) {
  const buttonStyle = useMemo(
    () => [
      styles.scheduleRowButton,
      destructive ? styles.scheduleRowButtonDanger : null,
      disabled ? styles.disabled : null,
    ],
    [destructive, disabled],
  );
  const textStyle = useMemo(
    () => [styles.scheduleRowButtonText, destructive ? styles.scheduleRowButtonDangerText : null],
    [destructive],
  );
  return (
    <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={buttonStyle}>
      <Text style={textStyle}>{label}</Text>
    </Pressable>
  );
}

function ProjectTimesheetView({
  pending,
  error,
  tasks,
  onOpenTask,
  onSelectTasksView,
}: {
  pending: boolean;
  error: Error | null;
  tasks: StoredTask[];
  onOpenTask: (taskKey: string) => void;
  onSelectTasksView: (view: "tasks") => void;
}) {
  const [day, setDay] = useState(() => new Date());
  const now = useMemo(() => new Date(), []);
  const totals = useMemo(() => aggregateTaskDayTotals(tasks, day, now), [day, now, tasks]);
  const totalSeconds = useMemo(() => totalSecondsForDay(tasks, day, now), [day, now, tasks]);
  const dayLabel = useMemo(() => formatTaskTimeDayLabel(day, now), [day, now]);
  const openTask = useCallback(
    (selectedTaskKey: string) => {
      onOpenTask(selectedTaskKey);
      onSelectTasksView("tasks");
    },
    [onOpenTask, onSelectTasksView],
  );
  const goPreviousDay = useCallback(() => setDay((current) => addTaskTimeDays(current, -1)), []);
  const goNextDay = useCallback(() => setDay((current) => addTaskTimeDays(current, 1)), []);
  const goToday = useCallback(() => setDay(new Date()), []);

  if (pending) {
    return (
      <View style={styles.centered}>
        <Text style={styles.muted}>Loading time entries...</Text>
      </View>
    );
  }
  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.muted}>{error.message}</Text>
      </View>
    );
  }
  return (
    <View style={styles.timesheet}>
      <View style={styles.timesheetHeader}>
        <View>
          <Text style={styles.timesheetTitle}>{dayLabel} by task</Text>
          <Text style={styles.muted}>Tracked from task time entries</Text>
        </View>
        <View style={styles.timesheetHeaderActions}>
          <Text style={styles.timesheetTotal}>{formatDuration(totalSeconds)}</Text>
          <View style={styles.timesheetControls}>
            <TimesheetDayButton label="Prev" onPress={goPreviousDay} />
            <TimesheetDayButton label="Today" onPress={goToday} />
            <TimesheetDayButton label="Next" onPress={goNextDay} />
          </View>
        </View>
      </View>
      {totals.length > 0 ? (
        totals.map((total) => (
          <ProjectTimesheetRow
            key={total.taskKey}
            taskKey={total.taskKey}
            title={total.title}
            seconds={total.seconds}
            onOpen={openTask}
          />
        ))
      ) : (
        <Text style={styles.muted}>No tracked time for this day</Text>
      )}
    </View>
  );
}

function formatProjectScheduleTiming(schedule: ScheduleSummary | null): string {
  if (!schedule) {
    return "Missing schedule";
  }
  if (schedule.nextRunAt) {
    return `${schedule.status} - next ${formatProjectScheduleTime(schedule.nextRunAt)}`;
  }
  if (schedule.lastRunAt) {
    return `${schedule.status} - last ${formatProjectScheduleTime(schedule.lastRunAt)}`;
  }
  return `${schedule.status} - no runs yet`;
}

function hasUnacknowledgedFailure(item: ProjectScheduleItem): boolean {
  return item.task.metadata.scheduledRuns.some(
    (run) =>
      run.scheduleId === item.scheduleId && run.status === "failed" && run.acknowledgedAt === null,
  );
}

function formatProjectScheduleCadence(cadence: ScheduleSummary["cadence"]): string {
  if (cadence.type === "cron") {
    return cadence.timezone
      ? `Cron ${cadence.expression} ${cadence.timezone}`
      : `Cron ${cadence.expression}`;
  }
  return `Every ${formatProjectScheduleInterval(cadence.everyMs)}`;
}

function formatProjectScheduleApprovalMode(value: ScheduleApprovalMode): string {
  switch (value) {
    case "auto":
      return "Auto-run";
    case "plan_only":
      return "Plan only";
    case "approval_before_edit":
      return "Ask before edits";
  }
  return "Auto-run";
}

function formatProjectScheduleExecutionMode(value: ScheduleExecutionMode): string {
  if (value === "dry_run") {
    return "Dry run";
  }
  return "Live run";
}

function formatProjectScheduleRetryPolicy(value: ScheduleRetryPolicy): string {
  if (value.maxAttempts <= 1) {
    return "No retry";
  }
  return `${value.maxAttempts - 1} ${value.maxAttempts === 2 ? "retry" : "retries"}`;
}

function formatProjectScheduleMissedRunPolicy(value: ScheduleMissedRunPolicy): string {
  if (value === "run_once") {
    return "Run once if missed";
  }
  return "Skip missed runs";
}

function formatProjectScheduleInterval(value: number): string {
  const units = [
    { label: "week", ms: 604_800_000 },
    { label: "day", ms: 86_400_000 },
    { label: "hour", ms: 3_600_000 },
    { label: "minute", ms: 60_000 },
  ];
  for (const unit of units) {
    if (value % unit.ms === 0) {
      const amount = value / unit.ms;
      return `${amount} ${unit.label}${amount === 1 ? "" : "s"}`;
    }
  }
  return `${value} ms`;
}

function formatProjectScheduleTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function TimesheetDayButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.timesheetControl}>
      <Text style={styles.timesheetControlText}>{label}</Text>
    </Pressable>
  );
}

function ProjectTimesheetRow({
  taskKey: rowTaskKey,
  title,
  seconds,
  onOpen,
}: {
  taskKey: string;
  title: string;
  seconds: number;
  onOpen: (taskKey: string) => void;
}) {
  const handlePress = useCallback(() => onOpen(rowTaskKey), [onOpen, rowTaskKey]);
  return (
    <Pressable accessibilityRole="button" onPress={handlePress} style={styles.timesheetRow}>
      <Text style={styles.timesheetTask} numberOfLines={1}>
        {title}
      </Text>
      <Text style={styles.timesheetTime}>{formatDuration(seconds)}</Text>
    </Pressable>
  );
}

const PLACEHOLDER_COLOR = "#9ca3af";

function isTaskAgentActionDisabled(
  pending: boolean,
  repoRoot: string | null,
  task: StoredTask,
): boolean {
  return pending || !repoRoot || !task.metadata.provider?.trim();
}

function getTaskScheduleDisabledReason(
  pending: boolean,
  repoRoot: string | null,
  task: StoredTask,
): string | null {
  if (pending) {
    return "Scheduling task...";
  }
  if (!repoRoot) {
    return "Project must have exactly one git folder.";
  }
  if (!task.metadata.provider?.trim()) {
    return "Set an agent provider first.";
  }
  return null;
}

function isAnyScheduleActionPending(state: {
  runScheduleNow: boolean;
  pauseSchedule: boolean;
  resumeSchedule: boolean;
  updateSchedule: boolean;
  deleteSchedule: boolean;
}): boolean {
  return (
    state.runScheduleNow ||
    state.pauseSchedule ||
    state.resumeSchedule ||
    state.updateSchedule ||
    state.deleteSchedule
  );
}

const styles = StyleSheet.create((theme) => ({
  container: { flex: 1, minHeight: 0, backgroundColor: theme.colors.surface0 },
  viewTabs: {
    flexDirection: "row",
    gap: theme.spacing[1],
    paddingHorizontal: theme.spacing[3],
    paddingTop: theme.spacing[3],
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
  schedules: { padding: theme.spacing[4], gap: theme.spacing[2] },
  schedulesHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: theme.spacing[3],
  },
  schedulesTitle: { color: theme.colors.foreground, fontSize: theme.fontSize.base },
  scheduleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: theme.spacing[3],
    padding: theme.spacing[3],
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.surface1,
  },
  scheduleRowAttention: {
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.destructive,
  },
  scheduleRowMain: { flex: 1, minWidth: 0, gap: 2 },
  scheduleRowTitle: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
  },
  scheduleRowTask: { color: theme.colors.foregroundMuted, fontSize: theme.fontSize.xs },
  scheduleRowMeta: { color: theme.colors.foregroundMuted, fontSize: theme.fontSize.xs },
  scheduleRowError: { color: theme.colors.destructive, fontSize: theme.fontSize.xs },
  scheduleRowActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-end",
    gap: theme.spacing[1],
  },
  scheduleRowButton: {
    minHeight: 28,
    paddingHorizontal: theme.spacing[2],
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.borderRadius.sm,
    backgroundColor: theme.colors.surface2,
  },
  scheduleRowButtonDanger: { borderWidth: 1, borderColor: theme.colors.destructive },
  scheduleRowButtonText: { color: theme.colors.foreground, fontSize: theme.fontSize.xs },
  scheduleRowButtonDangerText: { color: theme.colors.destructive },
  timesheet: { padding: theme.spacing[4], gap: theme.spacing[2] },
  timesheetHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: theme.spacing[3],
  },
  timesheetHeaderActions: {
    alignItems: "flex-end",
    gap: theme.spacing[2],
  },
  timesheetTitle: { color: theme.colors.foreground, fontSize: theme.fontSize.base },
  timesheetTotal: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
    fontVariant: ["tabular-nums"],
  },
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
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[3],
    padding: theme.spacing[3],
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.surface1,
  },
  timesheetTask: {
    flex: 1,
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
  },
  timesheetTime: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    fontVariant: ["tabular-nums"],
  },
}));
