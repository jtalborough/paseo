import { useCallback, useMemo, useState } from "react";
import type { PressableStateCallbackType } from "react-native";
import { Pressable, Text, TextInput, View } from "react-native";
import type {
  ActionState,
  Recurrence,
  StoredTask,
  TaskAttention,
  TaskScheduledAgentRun,
  TaskConfig,
  TaskPriority,
} from "@getpaseo/protocol/task/types";
import type {
  ScheduleApprovalMode,
  ScheduleCadence,
  ScheduleExecutionMode,
  ScheduleMissedRunPolicy,
  ScheduleRetryPolicy,
  ScheduleSummary,
} from "@getpaseo/protocol/schedule/types";
import type { TaskUpdateRpcPatch } from "@getpaseo/client/internal/daemon-client";
import { type SelectOption, TaskMultiSelect, TaskSelect } from "@/components/task-select";
import {
  TASK_RECURRENCE_OPTIONS,
  WEEKDAY_OPTIONS,
  taskRecurrenceFromOption,
  taskRecurrenceCompletionPreview,
  taskRecurrenceToOption,
} from "@/utils/task-recurrence";
import { linksToText, textToLinks } from "@/utils/task-links";
import { remindersToText, textToReminders } from "@/utils/task-reminders";
import { StyleSheet } from "react-native-unistyles";

const PLACEHOLDER_COLOR = "#9ca3af";
const EMPTY_SCHEDULES: ScheduleSummary[] = [];
const EMPTY_SCHEDULE_RUNS: TaskScheduledAgentRun[] = [];
const SCHEDULE_APPROVAL_OPTIONS: Option<ScheduleApprovalMode>[] = [
  { value: "auto", label: "Auto" },
  { value: "plan_only", label: "Plan only" },
  { value: "approval_before_edit", label: "Ask before edits" },
];
const SCHEDULE_EXECUTION_MODE_OPTIONS: Option<ScheduleExecutionMode>[] = [
  { value: "live", label: "Live" },
  { value: "dry_run", label: "Dry run" },
];
const SCHEDULE_RETRY_OPTIONS: Array<Option<string> & { retryPolicy: ScheduleRetryPolicy }> = [
  { value: "none", label: "No retry", retryPolicy: { maxAttempts: 1, backoffMs: 5 * 60_000 } },
  { value: "once", label: "Retry once", retryPolicy: { maxAttempts: 2, backoffMs: 5 * 60_000 } },
  { value: "three", label: "Retry 3x", retryPolicy: { maxAttempts: 4, backoffMs: 5 * 60_000 } },
];
const SCHEDULE_MISSED_RUN_OPTIONS: Option<ScheduleMissedRunPolicy>[] = [
  { value: "skip", label: "Skip missed" },
  { value: "run_once", label: "Run once" },
];

interface Option<T> {
  value: T;
  label: string;
}

const ACTION_STATES: Option<ActionState>[] = [
  { value: "todo", label: "ToDo" },
  { value: "waiting", label: "Waiting" },
  { value: "info", label: "Info" },
  { value: "someday", label: "Someday" },
  { value: "dropped", label: "Dropped" },
  { value: "done", label: "Done" },
];
const PRIORITIES: Option<TaskPriority>[] = [
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
];
const ATTENTIONS: Option<TaskAttention>[] = [
  { value: "full", label: "Full" },
  { value: "medium", label: "Medium" },
  { value: "minimal", label: "Minimal" },
];

export interface TaskScheduleDraft {
  cadence: ScheduleCadence;
  executionMode: ScheduleExecutionMode;
  approvalMode: ScheduleApprovalMode;
  missedRunPolicy: ScheduleMissedRunPolicy;
  retryPolicy: ScheduleRetryPolicy;
  name?: string;
  runOnCreate?: boolean;
}

export interface TaskScheduleUpdateDraft {
  cadence: ScheduleCadence;
  executionMode: ScheduleExecutionMode;
  approvalMode: ScheduleApprovalMode;
  missedRunPolicy: ScheduleMissedRunPolicy;
  retryPolicy: ScheduleRetryPolicy;
  name?: string | null;
}

export interface TaskScheduleActions {
  onRunNow?: (scheduleId: string) => void;
  onPause?: (scheduleId: string) => void;
  onResume?: (scheduleId: string) => void;
  onUpdate?: (scheduleId: string, draft: TaskScheduleUpdateDraft) => void;
  onDelete?: (scheduleId: string) => void;
  onOpenPacket?: (packetPath: string) => void;
  onOpenAgent?: (agentId: string) => void;
  disabled?: boolean;
}

function toOption(value: string): SelectOption {
  return { value, label: value };
}

/**
 * Shared task properties editor used by both the per-project pane and the global
 * Tasks screen. Pass `onRun` to enable agent dispatch (only where a repo exists);
 * pass `projectOptions` + `onChangeProject` to allow moving the task between
 * projects (the global screen, which has no fixed project context).
 */
export function TaskEditor({
  task,
  config,
  onPatch,
  onDelete,
  onAddType,
  onAddPerson,
  onRemoveType,
  onRemovePerson,
  onAddContext,
  onRemoveContext,
  onRun,
  runDisabled,
  onSchedule,
  scheduleDisabled,
  scheduleDisabledReason,
  schedules,
  scheduleActions,
  projectOptions,
  onChangeProject,
}: {
  task: StoredTask;
  config: TaskConfig;
  onPatch: (id: string, patch: TaskUpdateRpcPatch) => void;
  onDelete: (id: string) => void;
  onAddType: (value: string) => void;
  onAddPerson: (value: string) => void;
  onRemoveType: (value: string) => void;
  onRemovePerson: (value: string) => void;
  onAddContext?: (value: string) => void;
  onRemoveContext?: (value: string) => void;
  onRun?: (id: string) => void;
  runDisabled?: boolean;
  onSchedule?: (id: string, draft: TaskScheduleDraft) => void;
  scheduleDisabled?: boolean;
  scheduleDisabledReason?: string | null;
  schedules?: ScheduleSummary[];
  scheduleActions?: TaskScheduleActions;
  projectOptions?: SelectOption[];
  onChangeProject?: (projectGroupId: string) => void;
}) {
  const { metadata, body } = task;
  const id = metadata.id;
  const patchField = useCallback((patch: TaskUpdateRpcPatch) => onPatch(id, patch), [onPatch, id]);

  const setActionState = useCallback(
    (value: string | null) => {
      if (value) {
        patchField({ actionState: value as ActionState });
      }
    },
    [patchField],
  );
  const setPriority = useCallback(
    (value: string | null) => patchField({ priority: value as TaskPriority | null }),
    [patchField],
  );
  const setAttention = useCallback(
    (value: string | null) => patchField({ attention: value as TaskAttention | null }),
    [patchField],
  );
  const setTitle = useCallback(
    (value: string) => {
      const title = value.trim();
      if (title.length > 0) {
        patchField({ title });
      }
    },
    [patchField],
  );
  const setType = useCallback((value: string | null) => patchField({ type: value }), [patchField]);
  const setPeople = useCallback((people: string[]) => patchField({ people }), [patchField]);
  const setContext = useCallback(
    (value: string | null) => patchField({ context: value }),
    [patchField],
  );
  const setDoDate = useCallback(
    (value: string) => patchField({ doDate: value || null }),
    [patchField],
  );
  const setRecurrence = useCallback(
    (value: string | null) => {
      const recurrence = taskRecurrenceFromOption(value);
      if (recurrence !== undefined) {
        patchField({ recurrence });
      }
    },
    [patchField],
  );
  const setReminders = useCallback(
    (value: string) => patchField({ remind: textToReminders(value) }),
    [patchField],
  );
  const setWeeklyDays = useCallback(
    (weekdays: string[]) => {
      if (weekdays.length > 0) {
        patchField({ recurrence: { kind: "weekly", weekdays: weekdays as RecurrenceWeekday[] } });
      }
    },
    [patchField],
  );
  const setProvider = useCallback(
    (value: string) => patchField({ provider: value || null }),
    [patchField],
  );
  const setGithub = useCallback(
    (value: string) => patchField({ github: value || null }),
    [patchField],
  );
  const setLinks = useCallback(
    (value: string) => patchField({ links: textToLinks(value) }),
    [patchField],
  );
  const setBody = useCallback((value: string) => patchField({ body: value }), [patchField]);

  const handleRunPress = useCallback(() => onRun?.(id), [onRun, id]);
  const handleSchedule = useCallback(
    (draft: TaskScheduleDraft) => onSchedule?.(id, draft),
    [id, onSchedule],
  );
  const taskSchedules = schedules ?? EMPTY_SCHEDULES;
  const handleDelete = useCallback(() => onDelete(id), [onDelete, id]);

  const typeOptions = useMemo(() => config.types.map(toOption), [config.types]);
  const peopleOptions = useMemo(() => config.people.map(toOption), [config.people]);
  const contextOptions = useMemo(() => config.contexts.map(toOption), [config.contexts]);
  const recurrencePreview = useMemo(
    () =>
      taskRecurrenceCompletionPreview({
        recurrence: metadata.recurrence,
        doDate: metadata.doDate,
        completedAt: new Date().toISOString(),
      }),
    [metadata.doDate, metadata.recurrence],
  );

  return (
    <View style={styles.editor}>
      {projectOptions && onChangeProject ? (
        <TaskSelect
          label="Project"
          options={projectOptions}
          value={metadata.projectGroupId}
          onSelect={onChangeProjectAdapter(onChangeProject)}
          clearable={false}
        />
      ) : null}
      <TitleField value={metadata.title} onCommit={setTitle} />
      <TaskSelect
        label="Status"
        options={ACTION_STATES}
        value={metadata.actionState}
        onSelect={setActionState}
        clearable={false}
      />
      <TaskSelect
        label="Priority"
        options={PRIORITIES}
        value={metadata.priority}
        onSelect={setPriority}
      />
      <TaskSelect
        label="Attention"
        options={ATTENTIONS}
        value={metadata.attention}
        onSelect={setAttention}
      />
      <TaskSelect
        label="Type"
        options={typeOptions}
        value={metadata.type}
        onSelect={setType}
        editable
        onAddOption={onAddType}
        onRemoveOption={onRemoveType}
      />
      <TaskMultiSelect
        label="People"
        options={peopleOptions}
        selected={metadata.people}
        onChange={setPeople}
        editable
        onAddOption={onAddPerson}
        onRemoveOption={onRemovePerson}
      />
      <TaskSelect
        label="Context"
        options={contextOptions}
        value={metadata.context}
        onSelect={setContext}
        editable={Boolean(onAddContext)}
        onAddOption={onAddContext}
        onRemoveOption={onRemoveContext}
      />
      <DateField label="Do date" value={metadata.doDate} onCommit={setDoDate} />
      <TaskSelect
        label="Repeats"
        options={recurrenceOptions(metadata.recurrence)}
        value={taskRecurrenceToOption(metadata.recurrence)}
        onSelect={setRecurrence}
        placeholder="None"
      />
      {metadata.recurrence?.kind === "weekly" ? (
        <TaskMultiSelect
          label="Repeat days"
          options={WEEKDAY_OPTIONS}
          selected={metadata.recurrence.weekdays}
          onChange={setWeeklyDays}
        />
      ) : null}
      {recurrencePreview ? <Text style={styles.recurrencePreview}>{recurrencePreview}</Text> : null}
      <RemindersField value={remindersToText(metadata.remind)} onCommit={setReminders} />
      <AgentRunField
        value={metadata.provider}
        onCommit={setProvider}
        onRun={onRun ? handleRunPress : undefined}
        runDisabled={runDisabled ?? false}
      />
      <ScheduledAgentTaskSection
        task={task}
        schedules={taskSchedules}
        onSchedule={onSchedule ? handleSchedule : undefined}
        actions={scheduleActions}
        disabled={scheduleDisabled ?? false}
        disabledReason={scheduleDisabledReason ?? null}
      />
      <TextField
        label="GitHub"
        value={metadata.github}
        placeholder="https://github.com/…/issues/1"
        onCommit={setGithub}
      />
      <LinksField value={linksToText(metadata.links)} onCommit={setLinks} />
      <NotesField value={body} onCommit={setBody} />
      <View style={styles.editorActions}>
        <Pressable accessibilityRole="button" onPress={handleDelete} style={rowActionStyle}>
          <Text style={styles.rowActionDanger}>Delete task</Text>
        </Pressable>
      </View>
    </View>
  );
}

function ScheduledAgentTaskSection({
  task,
  schedules,
  onSchedule,
  actions,
  disabled,
  disabledReason,
}: {
  task: StoredTask;
  schedules: ScheduleSummary[];
  onSchedule?: (draft: TaskScheduleDraft) => void;
  actions?: TaskScheduleActions;
  disabled: boolean;
  disabledReason: string | null;
}) {
  const { scheduleIds, scheduledRuns } = task.metadata;
  const latestRuns = scheduledRuns.slice(-3).toReversed();
  const scheduleById = useMemo(
    () => new Map(schedules.map((schedule) => [schedule.id, schedule])),
    [schedules],
  );
  const runsByScheduleId = useMemo(() => {
    const map = new Map<string, TaskScheduledAgentRun[]>();
    for (const run of scheduledRuns) {
      const runs = map.get(run.scheduleId) ?? [];
      runs.push(run);
      map.set(run.scheduleId, runs);
    }
    return map;
  }, [scheduledRuns]);
  const [mode, setMode] = useState<"every" | "cron">("every");
  const [everyDraft, setEveryDraft] = useState("1d");
  const [cronDraft, setCronDraft] = useState("0 9 * * *");
  const [timezoneDraft, setTimezoneDraft] = useState("");
  const [nameDraft, setNameDraft] = useState("");
  const [executionMode, setExecutionMode] = useState<ScheduleExecutionMode>("live");
  const [approvalMode, setApprovalMode] = useState<ScheduleApprovalMode>("approval_before_edit");
  const [missedRunPolicy, setMissedRunPolicy] = useState<ScheduleMissedRunPolicy>("skip");
  const [retryPolicy, setRetryPolicy] = useState<ScheduleRetryPolicy>(
    SCHEDULE_RETRY_OPTIONS[0].retryPolicy,
  );
  const cadence = useMemo(
    () =>
      mode === "every" ? parseEveryCadence(everyDraft) : parseCronCadence(cronDraft, timezoneDraft),
    [cronDraft, everyDraft, mode, timezoneDraft],
  );
  const scheduleDisabled = disabled || !onSchedule || cadence === null;
  const cadencePreview = cadence ? formatCadence(cadence) : null;
  const scheduleReason = cadence === null ? "Invalid schedule cadence." : disabledReason;
  const scheduleButtonViewStyle = useMemo(
    () => [styles.scheduleButton, scheduleDisabled ? styles.scheduleButtonDisabled : null],
    [scheduleDisabled],
  );
  const handleSchedule = useCallback(() => {
    if (!onSchedule || !cadence) {
      return;
    }
    const name = nameDraft.trim();
    onSchedule({
      cadence,
      executionMode,
      approvalMode,
      missedRunPolicy,
      retryPolicy,
      ...(name ? { name } : {}),
      ...(cadence.type === "every" ? { runOnCreate: false } : {}),
    });
  }, [approvalMode, cadence, executionMode, missedRunPolicy, nameDraft, onSchedule, retryPolicy]);
  const setEveryMode = useCallback(() => setMode("every"), []);
  const setCronMode = useCallback(() => setMode("cron"), []);
  return (
    <View style={styles.fieldRow}>
      <View style={styles.sectionHeader}>
        <Text style={styles.fieldLabel}>Schedule</Text>
        <Pressable
          accessibilityRole="button"
          disabled={scheduleDisabled}
          onPress={handleSchedule}
          style={scheduleButtonViewStyle}
        >
          <Text style={styles.scheduleButtonText}>Schedule</Text>
        </Pressable>
      </View>
      <View style={styles.scheduleModeRow}>
        <QuickChip label="Every" onPress={setEveryMode} selected={mode === "every"} />
        <QuickChip label="Cron" onPress={setCronMode} selected={mode === "cron"} />
      </View>
      <ScheduleTextInput
        value={nameDraft}
        onChangeText={setNameDraft}
        placeholder="Schedule name"
      />
      <ScheduleExecutionModePicker value={executionMode} onChange={setExecutionMode} />
      <ScheduleApprovalModePicker value={approvalMode} onChange={setApprovalMode} />
      <ScheduleMissedRunPolicyPicker value={missedRunPolicy} onChange={setMissedRunPolicy} />
      <ScheduleRetryPolicyPicker value={retryPolicy} onChange={setRetryPolicy} />
      {mode === "every" ? (
        <ScheduleTextInput value={everyDraft} onChangeText={setEveryDraft} placeholder="1d" />
      ) : (
        <View style={styles.scheduleCronFields}>
          <ScheduleTextInput
            value={cronDraft}
            onChangeText={setCronDraft}
            placeholder="0 9 * * *"
          />
          <ScheduleTextInput
            value={timezoneDraft}
            onChangeText={setTimezoneDraft}
            placeholder="America/New_York"
          />
        </View>
      )}
      {cadence === null ? (
        <Text style={styles.scheduleError}>Invalid schedule cadence.</Text>
      ) : null}
      {cadencePreview ? <Text style={styles.scheduleHint}>{cadencePreview}</Text> : null}
      {scheduleReason && cadence !== null ? (
        <Text style={styles.scheduleHint}>{scheduleReason}</Text>
      ) : null}
      {scheduleIds.length > 0 ? (
        <View style={styles.attachedSchedules}>
          {scheduleIds.map((scheduleId) => (
            <AttachedScheduleRow
              key={scheduleId}
              scheduleId={scheduleId}
              schedule={scheduleById.get(scheduleId) ?? null}
              runs={runsByScheduleId.get(scheduleId) ?? EMPTY_SCHEDULE_RUNS}
              actions={actions}
            />
          ))}
        </View>
      ) : (
        <Text style={styles.scheduleEmpty}>No agent schedule is attached yet.</Text>
      )}
      {latestRuns.length > 0 ? (
        <View style={styles.scheduleRuns}>
          {latestRuns.map((run) => (
            <View key={`${run.scheduleId}:${run.runId}`} style={styles.scheduleRun}>
              <Text style={styles.scheduleRunTitle}>
                {run.status} - {formatScheduleRunTime(run.scheduledFor)}
              </Text>
              {run.summary ? <Text style={styles.scheduleRunDetail}>{run.summary}</Text> : null}
              <ScheduledRunMeta run={run} actions={actions} />
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function ScheduleTextInput({
  value,
  onChangeText,
  placeholder,
}: {
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
}) {
  return (
    <TextInput
      style={styles.fieldInput}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={PLACEHOLDER_COLOR}
      returnKeyType="done"
      autoCapitalize="none"
      autoCorrect={false}
    />
  );
}

function ScheduleApprovalModePicker({
  value,
  onChange,
}: {
  value: ScheduleApprovalMode;
  onChange: (value: ScheduleApprovalMode) => void;
}) {
  return (
    <View style={styles.scheduleModeRow}>
      {SCHEDULE_APPROVAL_OPTIONS.map((option) => (
        <ScheduleApprovalModeChip
          key={option.value}
          option={option}
          selected={value === option.value}
          onChange={onChange}
        />
      ))}
    </View>
  );
}

function ScheduleExecutionModePicker({
  value,
  onChange,
}: {
  value: ScheduleExecutionMode;
  onChange: (value: ScheduleExecutionMode) => void;
}) {
  return (
    <View style={styles.scheduleModeRow}>
      {SCHEDULE_EXECUTION_MODE_OPTIONS.map((option) => (
        <ScheduleExecutionModeChip
          key={option.value}
          option={option}
          selected={value === option.value}
          onChange={onChange}
        />
      ))}
    </View>
  );
}

function ScheduleExecutionModeChip({
  option,
  selected,
  onChange,
}: {
  option: Option<ScheduleExecutionMode>;
  selected: boolean;
  onChange: (value: ScheduleExecutionMode) => void;
}) {
  const handlePress = useCallback(() => onChange(option.value), [onChange, option.value]);
  return <QuickChip label={option.label} onPress={handlePress} selected={selected} />;
}

function ScheduleApprovalModeChip({
  option,
  selected,
  onChange,
}: {
  option: Option<ScheduleApprovalMode>;
  selected: boolean;
  onChange: (value: ScheduleApprovalMode) => void;
}) {
  const handlePress = useCallback(() => onChange(option.value), [onChange, option.value]);
  return <QuickChip label={option.label} onPress={handlePress} selected={selected} />;
}

function ScheduleRetryPolicyPicker({
  value,
  onChange,
}: {
  value: ScheduleRetryPolicy;
  onChange: (value: ScheduleRetryPolicy) => void;
}) {
  const selectedValue = retryPolicyToOption(value);
  return (
    <View style={styles.scheduleModeRow}>
      {SCHEDULE_RETRY_OPTIONS.map((option) => (
        <ScheduleRetryPolicyChip
          key={option.value}
          option={option}
          selected={selectedValue === option.value}
          onChange={onChange}
        />
      ))}
    </View>
  );
}

function ScheduleRetryPolicyChip({
  option,
  selected,
  onChange,
}: {
  option: Option<string> & { retryPolicy: ScheduleRetryPolicy };
  selected: boolean;
  onChange: (value: ScheduleRetryPolicy) => void;
}) {
  const handlePress = useCallback(() => onChange(option.retryPolicy), [onChange, option]);
  return <QuickChip label={option.label} onPress={handlePress} selected={selected} />;
}

function ScheduleMissedRunPolicyPicker({
  value,
  onChange,
}: {
  value: ScheduleMissedRunPolicy;
  onChange: (value: ScheduleMissedRunPolicy) => void;
}) {
  return (
    <View style={styles.scheduleModeRow}>
      {SCHEDULE_MISSED_RUN_OPTIONS.map((option) => (
        <ScheduleMissedRunPolicyChip
          key={option.value}
          option={option}
          selected={value === option.value}
          onChange={onChange}
        />
      ))}
    </View>
  );
}

function ScheduleMissedRunPolicyChip({
  option,
  selected,
  onChange,
}: {
  option: Option<ScheduleMissedRunPolicy>;
  selected: boolean;
  onChange: (value: ScheduleMissedRunPolicy) => void;
}) {
  const handlePress = useCallback(() => onChange(option.value), [onChange, option.value]);
  return <QuickChip label={option.label} onPress={handlePress} selected={selected} />;
}

function AttachedScheduleRow({
  scheduleId,
  schedule,
  runs,
  actions,
}: {
  scheduleId: string;
  schedule: ScheduleSummary | null;
  runs: TaskScheduledAgentRun[];
  actions?: TaskScheduleActions;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const actionDisabled = actions?.disabled ?? false;
  const runNow = useCallback(() => actions?.onRunNow?.(scheduleId), [actions, scheduleId]);
  const pause = useCallback(() => actions?.onPause?.(scheduleId), [actions, scheduleId]);
  const resume = useCallback(() => actions?.onResume?.(scheduleId), [actions, scheduleId]);
  const update = useCallback(
    (draft: TaskScheduleUpdateDraft) => actions?.onUpdate?.(scheduleId, draft),
    [actions, scheduleId],
  );
  const deleteSchedule = useCallback(() => actions?.onDelete?.(scheduleId), [actions, scheduleId]);
  const toggleExpanded = useCallback(() => setExpanded((current) => !current), []);
  const toggleEditing = useCallback(() => setEditing((current) => !current), []);
  const closeEditing = useCallback(() => setEditing(false), []);
  const title = schedule?.name ?? scheduleId;
  const status = schedule?.status ?? "missing";
  const timing = formatAttachedScheduleTiming(schedule);
  const cadence = schedule ? formatCadence(schedule.cadence) : null;
  const executionMode = schedule ? formatExecutionMode(schedule.executionMode) : null;
  const approvalMode = schedule ? formatApprovalMode(schedule.approvalMode) : null;
  const missedRunPolicy = schedule ? formatMissedRunPolicy(schedule.missedRunPolicy) : null;
  const retryPolicy = schedule ? formatRetryPolicy(schedule.retryPolicy) : null;
  const latestRuns = runs.slice(-3).toReversed();
  return (
    <View style={styles.attachedSchedule}>
      <View style={styles.attachedScheduleMain}>
        <Text style={styles.attachedScheduleTitle} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.attachedScheduleMeta}>
          {status} - {timing}
        </Text>
        {cadence ? <Text style={styles.attachedScheduleMeta}>{cadence}</Text> : null}
        {executionMode ? <Text style={styles.attachedScheduleMeta}>{executionMode}</Text> : null}
        {approvalMode ? <Text style={styles.attachedScheduleMeta}>{approvalMode}</Text> : null}
        {missedRunPolicy ? (
          <Text style={styles.attachedScheduleMeta}>{missedRunPolicy}</Text>
        ) : null}
        {retryPolicy ? <Text style={styles.attachedScheduleMeta}>{retryPolicy}</Text> : null}
      </View>
      <AttachedScheduleActions
        expanded={expanded}
        schedule={schedule}
        actionDisabled={actionDisabled}
        actions={actions}
        onToggleExpanded={toggleExpanded}
        onToggleEditing={toggleEditing}
        onRunNow={runNow}
        onPause={pause}
        onResume={resume}
        onDelete={deleteSchedule}
      />
      {editing && schedule ? (
        <ScheduleEditForm
          schedule={schedule}
          disabled={actionDisabled}
          onSave={update}
          onCancel={closeEditing}
        />
      ) : null}
      {expanded ? (
        <ScheduleDetails scheduleId={scheduleId} runs={latestRuns} actions={actions} />
      ) : null}
    </View>
  );
}

function AttachedScheduleActions({
  expanded,
  schedule,
  actionDisabled,
  actions,
  onToggleExpanded,
  onToggleEditing,
  onRunNow,
  onPause,
  onResume,
  onDelete,
}: {
  expanded: boolean;
  schedule: ScheduleSummary | null;
  actionDisabled: boolean;
  actions?: TaskScheduleActions;
  onToggleExpanded: () => void;
  onToggleEditing: () => void;
  onRunNow: () => void;
  onPause: () => void;
  onResume: () => void;
  onDelete: () => void;
}) {
  const canRun = Boolean(actions?.onRunNow && schedule);
  const canPause = Boolean(actions?.onPause && schedule);
  const canResume = Boolean(actions?.onResume);
  const canEdit = Boolean(actions?.onUpdate && schedule);
  const canDelete = Boolean(actions?.onDelete);
  const isPaused = schedule?.status === "paused";
  return (
    <View style={styles.attachedScheduleActions}>
      <ScheduleActionButton
        label={expanded ? "Hide" : "Details"}
        disabled={false}
        onPress={onToggleExpanded}
      />
      <ScheduleActionButton
        label="Edit"
        disabled={actionDisabled || !canEdit}
        onPress={onToggleEditing}
      />
      <ScheduleActionButton label="Run" disabled={actionDisabled || !canRun} onPress={onRunNow} />
      {isPaused ? (
        <ScheduleActionButton
          label="Resume"
          disabled={actionDisabled || !canResume}
          onPress={onResume}
        />
      ) : (
        <ScheduleActionButton
          label="Pause"
          disabled={actionDisabled || !canPause}
          onPress={onPause}
        />
      )}
      <ScheduleActionButton
        label="Delete"
        destructive
        disabled={actionDisabled || !canDelete}
        onPress={onDelete}
      />
    </View>
  );
}

function ScheduleEditForm({
  schedule,
  disabled,
  onSave,
  onCancel,
}: {
  schedule: ScheduleSummary;
  disabled: boolean;
  onSave: (draft: TaskScheduleUpdateDraft) => void;
  onCancel: () => void;
}) {
  const [mode, setMode] = useState<"every" | "cron">(schedule.cadence.type);
  const [nameDraft, setNameDraft] = useState(schedule.name ?? "");
  const [everyDraft, setEveryDraft] = useState(formatEveryInput(schedule.cadence));
  const [cronDraft, setCronDraft] = useState(
    schedule.cadence.type === "cron" ? schedule.cadence.expression : "0 9 * * *",
  );
  const [timezoneDraft, setTimezoneDraft] = useState(
    schedule.cadence.type === "cron" ? (schedule.cadence.timezone ?? "") : "",
  );
  const [executionMode, setExecutionMode] = useState<ScheduleExecutionMode>(schedule.executionMode);
  const [approvalMode, setApprovalMode] = useState<ScheduleApprovalMode>(schedule.approvalMode);
  const [missedRunPolicy, setMissedRunPolicy] = useState<ScheduleMissedRunPolicy>(
    schedule.missedRunPolicy,
  );
  const [retryPolicy, setRetryPolicy] = useState<ScheduleRetryPolicy>(schedule.retryPolicy);
  const cadence = useMemo(
    () =>
      mode === "every" ? parseEveryCadence(everyDraft) : parseCronCadence(cronDraft, timezoneDraft),
    [cronDraft, everyDraft, mode, timezoneDraft],
  );
  const saveDisabled = disabled || cadence === null;
  const setEveryMode = useCallback(() => setMode("every"), []);
  const setCronMode = useCallback(() => setMode("cron"), []);
  const save = useCallback(() => {
    if (!cadence) {
      return;
    }
    const name = nameDraft.trim();
    onSave({
      cadence,
      executionMode,
      approvalMode,
      missedRunPolicy,
      retryPolicy,
      name: name ? name : null,
    });
    onCancel();
  }, [
    approvalMode,
    cadence,
    executionMode,
    missedRunPolicy,
    nameDraft,
    onCancel,
    onSave,
    retryPolicy,
  ]);
  return (
    <View style={styles.scheduleEdit}>
      <View style={styles.scheduleModeRow}>
        <QuickChip label="Every" onPress={setEveryMode} selected={mode === "every"} />
        <QuickChip label="Cron" onPress={setCronMode} selected={mode === "cron"} />
      </View>
      <ScheduleTextInput
        value={nameDraft}
        onChangeText={setNameDraft}
        placeholder="Schedule name"
      />
      <ScheduleExecutionModePicker value={executionMode} onChange={setExecutionMode} />
      <ScheduleApprovalModePicker value={approvalMode} onChange={setApprovalMode} />
      <ScheduleMissedRunPolicyPicker value={missedRunPolicy} onChange={setMissedRunPolicy} />
      <ScheduleRetryPolicyPicker value={retryPolicy} onChange={setRetryPolicy} />
      {mode === "every" ? (
        <ScheduleTextInput value={everyDraft} onChangeText={setEveryDraft} placeholder="1d" />
      ) : (
        <View style={styles.scheduleCronFields}>
          <ScheduleTextInput
            value={cronDraft}
            onChangeText={setCronDraft}
            placeholder="0 9 * * *"
          />
          <ScheduleTextInput
            value={timezoneDraft}
            onChangeText={setTimezoneDraft}
            placeholder="America/New_York"
          />
        </View>
      )}
      {cadence ? (
        <Text style={styles.scheduleHint}>{formatCadence(cadence)}</Text>
      ) : (
        <Text style={styles.scheduleError}>Invalid schedule cadence.</Text>
      )}
      <View style={styles.attachedScheduleActions}>
        <ScheduleActionButton label="Save" disabled={saveDisabled} onPress={save} />
        <ScheduleActionButton label="Cancel" disabled={disabled} onPress={onCancel} />
      </View>
    </View>
  );
}

function ScheduleDetails({
  scheduleId,
  runs,
  actions,
}: {
  scheduleId: string;
  runs: TaskScheduledAgentRun[];
  actions?: TaskScheduleActions;
}) {
  return (
    <View style={styles.scheduleDetails}>
      <Text style={styles.scheduleDetailText}>ID {scheduleId}</Text>
      {runs.length > 0 ? (
        runs.map((run) => (
          <View key={`${run.scheduleId}:${run.runId}`} style={styles.scheduleDetailRun}>
            <Text style={styles.scheduleRunTitle}>
              {run.status} - {formatScheduleRunTime(run.scheduledFor)}
            </Text>
            {run.summary ? <Text style={styles.scheduleRunDetail}>{run.summary}</Text> : null}
            <ScheduledRunMeta run={run} actions={actions} />
          </View>
        ))
      ) : (
        <Text style={styles.scheduleDetailText}>No task run history yet</Text>
      )}
    </View>
  );
}

function ScheduledRunMeta({
  run,
  actions,
}: {
  run: TaskScheduledAgentRun;
  actions?: TaskScheduleActions;
}) {
  const entries = [
    run.provider ? `Provider ${run.provider}` : null,
    run.contextPacket ? `Packet ${run.contextPacket}` : null,
    run.agentId ? `Agent ${run.agentId.slice(0, 8)}` : null,
  ].filter(Boolean);
  const canOpenPacket = Boolean(actions?.onOpenPacket && run.contextPacket);
  const canOpenAgent = Boolean(actions?.onOpenAgent && run.agentId);
  const openPacket = useCallback(() => {
    if (run.contextPacket) {
      actions?.onOpenPacket?.(run.contextPacket);
    }
  }, [actions, run.contextPacket]);
  const openAgent = useCallback(() => {
    if (run.agentId) {
      actions?.onOpenAgent?.(run.agentId);
    }
  }, [actions, run.agentId]);
  if (entries.length === 0 && !canOpenPacket && !canOpenAgent) {
    return null;
  }
  return (
    <View style={styles.scheduleRunMetaBlock}>
      {entries.length > 0 ? (
        <Text style={styles.scheduleRunMeta} numberOfLines={2}>
          {entries.join(" · ")}
        </Text>
      ) : null}
      {canOpenPacket || canOpenAgent ? (
        <View style={styles.scheduleRunLinks}>
          {canOpenPacket ? (
            <ScheduleActionButton label="Open packet" disabled={false} onPress={openPacket} />
          ) : null}
          {canOpenAgent ? (
            <ScheduleActionButton label="Open agent" disabled={false} onPress={openAgent} />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function ScheduleActionButton({
  label,
  onPress,
  disabled,
  destructive = false,
}: {
  label: string;
  onPress: () => void;
  disabled: boolean;
  destructive?: boolean;
}) {
  const buttonStyle = useMemo(
    () => [
      styles.scheduleAction,
      destructive ? styles.scheduleActionDanger : null,
      disabled ? styles.scheduleActionDisabled : null,
    ],
    [destructive, disabled],
  );
  const textStyle = useMemo(
    () => [styles.scheduleActionText, destructive ? styles.scheduleActionDangerText : null],
    [destructive],
  );
  return (
    <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={buttonStyle}>
      <Text style={textStyle}>{label}</Text>
    </Pressable>
  );
}

function formatAttachedScheduleTiming(schedule: ScheduleSummary | null): string {
  if (!schedule) {
    return "Schedule not found";
  }
  if (schedule.nextRunAt) {
    return `Next ${formatScheduleRunTime(schedule.nextRunAt)}`;
  }
  if (schedule.lastRunAt) {
    return `Last ${formatScheduleRunTime(schedule.lastRunAt)}`;
  }
  return "No runs yet";
}

function formatCadence(cadence: ScheduleCadence): string {
  if (cadence.type === "cron") {
    return cadence.timezone
      ? `Cron ${cadence.expression} ${cadence.timezone}`
      : `Cron ${cadence.expression}`;
  }
  return `Every ${formatEveryMs(cadence.everyMs)}`;
}

function formatApprovalMode(value: ScheduleApprovalMode): string {
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

function formatExecutionMode(value: ScheduleExecutionMode): string {
  if (value === "dry_run") {
    return "Dry run";
  }
  return "Live run";
}

function formatRetryPolicy(value: ScheduleRetryPolicy): string {
  if (value.maxAttempts <= 1) {
    return "No retry";
  }
  return `${value.maxAttempts - 1} ${value.maxAttempts === 2 ? "retry" : "retries"}`;
}

function formatMissedRunPolicy(value: ScheduleMissedRunPolicy): string {
  if (value === "run_once") {
    return "Run once if missed";
  }
  return "Skip missed runs";
}

function retryPolicyToOption(value: ScheduleRetryPolicy): string {
  const option = SCHEDULE_RETRY_OPTIONS.find(
    (candidate) =>
      candidate.retryPolicy.maxAttempts === value.maxAttempts &&
      candidate.retryPolicy.backoffMs === value.backoffMs,
  );
  return option?.value ?? "none";
}

function formatEveryMs(value: number): string {
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

function formatEveryInput(cadence: ScheduleCadence): string {
  if (cadence.type !== "every") {
    return "1d";
  }
  const units = [
    { suffix: "w", ms: 604_800_000 },
    { suffix: "d", ms: 86_400_000 },
    { suffix: "h", ms: 3_600_000 },
    { suffix: "m", ms: 60_000 },
  ];
  for (const unit of units) {
    if (cadence.everyMs % unit.ms === 0) {
      return `${cadence.everyMs / unit.ms}${unit.suffix}`;
    }
  }
  return `${Math.max(1, Math.round(cadence.everyMs / 60_000))}m`;
}

function parseEveryCadence(value: string): ScheduleCadence | null {
  const match = value.trim().match(/^(\d+)\s*([mhdw])$/i);
  if (!match) {
    return null;
  }
  const amount = Number(match[1]);
  const unit = match[2]?.toLowerCase();
  const multiplier = everyUnitMultiplier(unit);
  if (!Number.isInteger(amount) || amount <= 0 || multiplier <= 0) {
    return null;
  }
  return { type: "every", everyMs: amount * multiplier };
}

function everyUnitMultiplier(unit: string | undefined): number {
  switch (unit) {
    case "m":
      return 60_000;
    case "h":
      return 3_600_000;
    case "d":
      return 86_400_000;
    case "w":
      return 604_800_000;
    default:
      return 0;
  }
}

function parseCronCadence(expression: string, timezone: string): ScheduleCadence | null {
  const trimmedExpression = expression.trim();
  if (!trimmedExpression) {
    return null;
  }
  const trimmedTimezone = timezone.trim();
  return {
    type: "cron",
    expression: trimmedExpression,
    ...(trimmedTimezone ? { timezone: trimmedTimezone } : {}),
  };
}

function formatScheduleRunTime(value: string): string {
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

/** Project select gives `string | null`; a project is never cleared, so coerce. */
function onChangeProjectAdapter(onChangeProject: (projectGroupId: string) => void) {
  return (value: string | null) => {
    if (value) {
      onChangeProject(value);
    }
  };
}

function recurrenceOptions(recurrence: Recurrence | null): SelectOption[] {
  if (taskRecurrenceToOption(recurrence) === "custom") {
    return TASK_RECURRENCE_OPTIONS;
  }
  return TASK_RECURRENCE_OPTIONS.filter((option) => option.value !== "custom");
}

type RecurrenceWeekday = Extract<Recurrence, { kind: "weekly" }>["weekdays"][number];

function DateField({
  label,
  value,
  onCommit,
}: {
  label: string;
  value: string | null;
  onCommit: (value: string) => void;
}) {
  const setToday = useCallback(() => onCommit(isoDateOffset(0)), [onCommit]);
  const setTomorrow = useCallback(() => onCommit(isoDateOffset(1)), [onCommit]);
  const setNextWeek = useCallback(() => onCommit(isoDateOffset(7)), [onCommit]);
  const clear = useCallback(() => onCommit(""), [onCommit]);
  return (
    <View style={styles.fieldRow}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.chips}>
        <QuickChip label="Today" onPress={setToday} />
        <QuickChip label="Tomorrow" onPress={setTomorrow} />
        <QuickChip label="+1 wk" onPress={setNextWeek} />
        <QuickChip label="Clear" onPress={clear} />
      </View>
      {/* key on value so quick-set chips (external changes) refresh the field */}
      <TextField
        key={value ?? "empty"}
        label=""
        value={value}
        placeholder="2026-06-20"
        onCommit={onCommit}
      />
    </View>
  );
}

function QuickChip({
  label,
  onPress,
  selected = false,
}: {
  label: string;
  onPress: () => void;
  selected?: boolean;
}) {
  const chipStyle = useMemo(
    () => [styles.addChip, selected ? styles.addChipSelected : null],
    [selected],
  );
  const textStyle = useMemo(
    () => [styles.addChipText, selected ? styles.addChipTextSelected : null],
    [selected],
  );
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={chipStyle}>
      <Text style={textStyle}>{label}</Text>
    </Pressable>
  );
}

function TitleField({ value, onCommit }: { value: string; onCommit: (value: string) => void }) {
  const [draft, setDraft] = useState(value);
  const handleBlur = useCallback(() => {
    const trimmed = draft.trim();
    if (trimmed.length === 0) {
      setDraft(value);
      return;
    }
    if (trimmed !== value) {
      onCommit(trimmed);
    }
    if (trimmed !== draft) {
      setDraft(trimmed);
    }
  }, [draft, value, onCommit]);
  return (
    <View style={styles.fieldRow}>
      <Text style={styles.fieldLabel}>Title</Text>
      <TextInput
        style={styles.titleInput}
        value={draft}
        onChangeText={setDraft}
        onBlur={handleBlur}
        onSubmitEditing={handleBlur}
        placeholder="Task title"
        placeholderTextColor={PLACEHOLDER_COLOR}
        returnKeyType="done"
      />
    </View>
  );
}

function AgentRunField({
  value,
  onCommit,
  onRun,
  runDisabled,
}: {
  value: string | null;
  onCommit: (value: string) => void;
  onRun?: () => void;
  runDisabled: boolean;
}) {
  const [draft, setDraft] = useState(value ?? "");
  const handleBlur = useCallback(() => {
    if (draft.trim() !== (value ?? "")) {
      onCommit(draft.trim());
    }
  }, [draft, value, onCommit]);
  return (
    <View style={styles.fieldRow}>
      <Text style={styles.fieldLabel}>Agent</Text>
      <View style={styles.agentRow}>
        <TextInput
          style={styles.agentInput}
          value={draft}
          onChangeText={setDraft}
          onBlur={handleBlur}
          onSubmitEditing={handleBlur}
          placeholder="claude / codex"
          placeholderTextColor={PLACEHOLDER_COLOR}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="done"
        />
        {onRun ? (
          <Pressable
            accessibilityRole="button"
            disabled={runDisabled}
            onPress={onRun}
            style={runButtonStyle}
          >
            <Text style={styles.runButtonText}>Run</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function TextField({
  label,
  value,
  placeholder,
  onCommit,
}: {
  label: string;
  value: string | null;
  placeholder: string;
  onCommit: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value ?? "");
  const handleBlur = useCallback(() => {
    if (draft.trim() !== (value ?? "")) {
      onCommit(draft.trim());
    }
  }, [draft, value, onCommit]);
  return (
    <View style={styles.fieldRow}>
      {label ? <Text style={styles.fieldLabel}>{label}</Text> : null}
      <TextInput
        style={styles.fieldInput}
        value={draft}
        onChangeText={setDraft}
        onBlur={handleBlur}
        onSubmitEditing={handleBlur}
        placeholder={placeholder}
        placeholderTextColor={PLACEHOLDER_COLOR}
        returnKeyType="done"
        autoCapitalize="none"
        autoCorrect={false}
      />
    </View>
  );
}

function NotesField({ value, onCommit }: { value: string; onCommit: (value: string) => void }) {
  const [draft, setDraft] = useState(value);
  const handleBlur = useCallback(() => {
    if (draft !== value) {
      onCommit(draft);
    }
  }, [draft, value, onCommit]);
  return (
    <View style={styles.fieldRow}>
      <Text style={styles.fieldLabel}>Notes</Text>
      <TextInput
        style={styles.notesInput}
        value={draft}
        onChangeText={setDraft}
        onBlur={handleBlur}
        placeholder="Notes, acceptance criteria, the prompt for the agent…"
        placeholderTextColor={PLACEHOLDER_COLOR}
        multiline
        textAlignVertical="top"
      />
    </View>
  );
}

function LinksField({ value, onCommit }: { value: string; onCommit: (value: string) => void }) {
  const [draft, setDraft] = useState(value);
  const handleBlur = useCallback(() => {
    if (draft !== value) {
      onCommit(draft);
    }
  }, [draft, value, onCommit]);
  return (
    <View style={styles.fieldRow}>
      <Text style={styles.fieldLabel}>Links</Text>
      <TextInput
        style={styles.linksInput}
        value={draft}
        onChangeText={setDraft}
        onBlur={handleBlur}
        placeholder="One URL or file path per line"
        placeholderTextColor={PLACEHOLDER_COLOR}
        multiline
        textAlignVertical="top"
        autoCapitalize="none"
        autoCorrect={false}
      />
    </View>
  );
}

function RemindersField({ value, onCommit }: { value: string; onCommit: (value: string) => void }) {
  const [draft, setDraft] = useState(value);
  const appendReminder = useCallback((reminder: string) => {
    setDraft((current) => {
      const reminders = textToReminders(current);
      if (reminders.includes(reminder)) {
        return remindersToText(reminders);
      }
      return remindersToText([...reminders, reminder]);
    });
  }, []);
  const addOneDay = useCallback(() => appendReminder("-1d"), [appendReminder]);
  const addThreeDays = useCallback(() => appendReminder("-3d"), [appendReminder]);
  const addOneHour = useCallback(() => appendReminder("-1h"), [appendReminder]);
  const clear = useCallback(() => setDraft(""), []);
  const handleBlur = useCallback(() => {
    const normalized = remindersToText(textToReminders(draft));
    if (normalized !== value) {
      onCommit(normalized);
    }
    if (normalized !== draft) {
      setDraft(normalized);
    }
  }, [draft, value, onCommit]);
  return (
    <View style={styles.fieldRow}>
      <Text style={styles.fieldLabel}>Reminders</Text>
      <View style={styles.chips}>
        <QuickChip label="-1h" onPress={addOneHour} />
        <QuickChip label="-1d" onPress={addOneDay} />
        <QuickChip label="-3d" onPress={addThreeDays} />
        <QuickChip label="Clear" onPress={clear} />
      </View>
      <TextInput
        style={styles.linksInput}
        value={draft}
        onChangeText={setDraft}
        onBlur={handleBlur}
        placeholder="One offset or ISO datetime per line"
        placeholderTextColor={PLACEHOLDER_COLOR}
        multiline
        textAlignVertical="top"
        autoCapitalize="none"
        autoCorrect={false}
      />
    </View>
  );
}

function isoDateOffset(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function rowActionStyle({ pressed }: PressableStateCallbackType) {
  return [styles.rowAction, pressed ? styles.rowActionPressed : null];
}

function runButtonStyle({ pressed }: PressableStateCallbackType) {
  return [styles.runButton, pressed ? styles.runButtonPressed : null];
}

const styles = StyleSheet.create((theme) => ({
  editor: {
    padding: theme.spacing[3],
    gap: theme.spacing[3],
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  fieldRow: { gap: theme.spacing[1] },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[2],
  },
  fieldLabel: { color: theme.colors.foregroundMuted, fontSize: theme.fontSize.xs },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: theme.spacing[1] },
  addChip: {
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[1],
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  addChipSelected: {
    borderColor: theme.colors.accent,
    backgroundColor: theme.colors.surface2,
  },
  addChipText: { color: theme.colors.foregroundMuted, fontSize: theme.fontSize.xs },
  addChipTextSelected: { color: theme.colors.foreground },
  recurrencePreview: {
    color: theme.colors.foregroundMuted,
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
  titleInput: {
    height: 36,
    paddingHorizontal: theme.spacing[2],
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surface2,
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.medium,
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
  scheduleModeRow: { flexDirection: "row", gap: theme.spacing[1] },
  scheduleCronFields: { gap: theme.spacing[1] },
  scheduleButton: {
    minHeight: 28,
    paddingHorizontal: theme.spacing[3],
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.accent,
  },
  scheduleButtonDisabled: {
    opacity: 0.5,
    backgroundColor: theme.colors.surface2,
  },
  scheduleButtonPressed: { opacity: 0.8 },
  scheduleButtonText: {
    color: theme.colors.accentForeground,
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.medium,
  },
  attachedSchedules: { gap: theme.spacing[1] },
  attachedSchedule: {
    gap: theme.spacing[2],
    padding: theme.spacing[2],
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surface2,
  },
  attachedScheduleMain: { minWidth: 0, gap: 2 },
  attachedScheduleTitle: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.medium,
  },
  attachedScheduleMeta: { color: theme.colors.foregroundMuted, fontSize: theme.fontSize.xs },
  attachedScheduleActions: { flexDirection: "row", flexWrap: "wrap", gap: theme.spacing[1] },
  scheduleAction: {
    minHeight: 24,
    paddingHorizontal: theme.spacing[2],
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.borderRadius.sm,
    backgroundColor: theme.colors.surface1,
  },
  scheduleActionDanger: { borderWidth: 1, borderColor: theme.colors.destructive },
  scheduleActionDisabled: { opacity: 0.5 },
  scheduleActionText: { color: theme.colors.foreground, fontSize: theme.fontSize.xs },
  scheduleActionDangerText: { color: theme.colors.destructive },
  scheduleDetails: {
    gap: theme.spacing[1],
    paddingTop: theme.spacing[1],
    borderTopWidth: theme.borderWidth[1],
    borderTopColor: theme.colors.border,
  },
  scheduleEdit: {
    gap: theme.spacing[1],
    paddingTop: theme.spacing[1],
    borderTopWidth: theme.borderWidth[1],
    borderTopColor: theme.colors.border,
  },
  scheduleDetailText: { color: theme.colors.foregroundMuted, fontSize: theme.fontSize.xs },
  scheduleDetailRun: {
    gap: 2,
    padding: theme.spacing[2],
    borderRadius: theme.borderRadius.sm,
    backgroundColor: theme.colors.surface1,
  },
  scheduleEmpty: { color: theme.colors.foregroundMuted, fontSize: theme.fontSize.xs },
  scheduleHint: { color: theme.colors.foregroundMuted, fontSize: theme.fontSize.xs },
  scheduleRuns: { gap: theme.spacing[1] },
  scheduleRun: {
    gap: 2,
    padding: theme.spacing[2],
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surface2,
  },
  scheduleRunTitle: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.medium,
  },
  scheduleRunDetail: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.xs,
  },
  scheduleRunMeta: { color: theme.colors.foregroundMuted, fontSize: theme.fontSize.xs },
  scheduleRunMetaBlock: { gap: theme.spacing[1] },
  scheduleRunLinks: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing[1],
  },
  scheduleError: { color: theme.colors.destructive, fontSize: theme.fontSize.xs },
  notesInput: {
    minHeight: 80,
    padding: theme.spacing[2],
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surface2,
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
  },
  linksInput: {
    minHeight: 56,
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
