import { useCallback, useMemo, useState } from "react";
import type { PressableStateCallbackType } from "react-native";
import { Pressable, Text, TextInput, View } from "react-native";
import type {
  ActionState,
  StoredTask,
  TaskAttention,
  TaskConfig,
  TaskPriority,
} from "@getpaseo/protocol/task/types";
import type { TaskUpdateRpcPatch } from "@getpaseo/client/internal/daemon-client";
import { type SelectOption, TaskMultiSelect, TaskSelect } from "@/components/task-select";
import { StyleSheet } from "react-native-unistyles";

const PLACEHOLDER_COLOR = "#9ca3af";

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
  projectOptions?: SelectOption[];
  onChangeProject?: (project: string) => void;
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
  const setProvider = useCallback(
    (value: string) => patchField({ provider: value || null }),
    [patchField],
  );
  const setGithub = useCallback(
    (value: string) => patchField({ github: value || null }),
    [patchField],
  );
  const setBody = useCallback((value: string) => patchField({ body: value }), [patchField]);

  const handleRunPress = useCallback(() => onRun?.(id), [onRun, id]);
  const handleDelete = useCallback(() => onDelete(id), [onDelete, id]);

  const typeOptions = useMemo(() => config.types.map(toOption), [config.types]);
  const peopleOptions = useMemo(() => config.people.map(toOption), [config.people]);
  const contextOptions = useMemo(() => config.contexts.map(toOption), [config.contexts]);

  return (
    <View style={styles.editor}>
      {projectOptions && onChangeProject ? (
        <TaskSelect
          label="Project"
          options={projectOptions}
          value={metadata.project}
          onSelect={onChangeProjectAdapter(onChangeProject)}
          clearable={false}
          editable
          onAddOption={onChangeProject}
        />
      ) : null}
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
      <AgentRunField
        value={metadata.provider}
        onCommit={setProvider}
        onRun={onRun ? handleRunPress : undefined}
        runDisabled={runDisabled ?? false}
      />
      <TextField
        label="GitHub"
        value={metadata.github}
        placeholder="https://github.com/…/issues/1"
        onCommit={setGithub}
      />
      <NotesField value={body} onCommit={setBody} />
      <View style={styles.editorActions}>
        <Pressable accessibilityRole="button" onPress={handleDelete} style={rowActionStyle}>
          <Text style={styles.rowActionDanger}>Delete task</Text>
        </Pressable>
      </View>
    </View>
  );
}

/** Project select gives `string | null`; a project is never cleared, so coerce. */
function onChangeProjectAdapter(onChangeProject: (project: string) => void) {
  return (value: string | null) => {
    if (value) {
      onChangeProject(value);
    }
  };
}

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

function QuickChip({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.addChip}>
      <Text style={styles.addChipText}>{label}</Text>
    </Pressable>
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
  fieldLabel: { color: theme.colors.foregroundMuted, fontSize: theme.fontSize.xs },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: theme.spacing[1] },
  addChip: {
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[1],
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  addChipText: { color: theme.colors.foregroundMuted, fontSize: theme.fontSize.xs },
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
