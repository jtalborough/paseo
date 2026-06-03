import { useCallback, useMemo, useState } from "react";
import type { PressableStateCallbackType } from "react-native";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  ActionState,
  StoredTask,
  TaskAttention,
  TaskConfig,
  TaskPriority,
} from "@getpaseo/protocol/task/types";
import type { TaskUpdateRpcPatch } from "@getpaseo/client/internal/daemon-client";
import { useToast } from "@/contexts/toast-context";
import { useSessionStore } from "@/stores/session-store";
import { useWorkspaceExecutionAuthority } from "@/stores/session-store-hooks";
import { StyleSheet } from "react-native-unistyles";

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
const ACTION_STATE_LABEL: Record<ActionState, string> = {
  todo: "ToDo",
  waiting: "Waiting",
  info: "Info",
  someday: "Someday",
  dropped: "Dropped",
  done: "Done",
};
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
        return { types: [], people: [] } as TaskConfig;
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
        runDisabled={runTask.isPending}
      />
    </View>
  );
}

const EMPTY_CONFIG: TaskConfig = { types: [], people: [] };

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
          runDisabled={runDisabled}
        />
      ) : null}
    </View>
  );
}

function TaskEditor({
  task,
  config,
  onPatch,
  onRun,
  onDelete,
  onAddType,
  onAddPerson,
  runDisabled,
}: {
  task: StoredTask;
  config: TaskConfig;
  onPatch: (id: string, patch: TaskUpdateRpcPatch) => void;
  onRun: (id: string) => void;
  onDelete: (id: string) => void;
  onAddType: (value: string) => void;
  onAddPerson: (value: string) => void;
  runDisabled: boolean;
}) {
  const { metadata, body } = task;
  const id = metadata.id;
  const patchField = useCallback((patch: TaskUpdateRpcPatch) => onPatch(id, patch), [onPatch, id]);

  const setActionState = useCallback(
    (value: ActionState | null) => {
      if (value) {
        patchField({ actionState: value });
      }
    },
    [patchField],
  );
  const setPriority = useCallback(
    (value: TaskPriority | null) => patchField({ priority: value }),
    [patchField],
  );
  const setAttention = useCallback(
    (value: TaskAttention | null) => patchField({ attention: value }),
    [patchField],
  );
  const setType = useCallback((value: string | null) => patchField({ type: value }), [patchField]);
  const setPeople = useCallback((people: string[]) => patchField({ people }), [patchField]);
  const setContext = useCallback(
    (value: string) => patchField({ context: value || null }),
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

  const handleRun = useCallback(() => onRun(id), [onRun, id]);
  const handleDelete = useCallback(() => onDelete(id), [onDelete, id]);

  return (
    <View style={styles.editor}>
      <OptionRow
        label="Status"
        options={ACTION_STATES}
        value={metadata.actionState}
        onSelect={setActionState}
        clearable={false}
      />
      <OptionRow
        label="Priority"
        options={PRIORITIES}
        value={metadata.priority}
        onSelect={setPriority}
        clearable
      />
      <OptionRow
        label="Attention"
        options={ATTENTIONS}
        value={metadata.attention}
        onSelect={setAttention}
        clearable
      />
      <SingleSelectField
        label="Type"
        options={config.types}
        value={metadata.type}
        onSelect={setType}
        onAdd={onAddType}
      />
      <MultiSelectField
        label="People"
        options={config.people}
        selected={metadata.people}
        onChange={setPeople}
        onAdd={onAddPerson}
      />
      <DateField label="Do date" value={metadata.doDate} onCommit={setDoDate} />
      <TextField
        label="Context"
        value={metadata.context}
        placeholder="cpu / home / outdoors"
        onCommit={setContext}
      />
      <AgentRunField
        value={metadata.provider}
        onCommit={setProvider}
        onRun={handleRun}
        runDisabled={runDisabled}
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

function OptionRow<T extends string>({
  label,
  options,
  value,
  onSelect,
  clearable,
}: {
  label: string;
  options: Option<T>[];
  value: T | null;
  onSelect: (value: T | null) => void;
  clearable: boolean;
}) {
  const handleSelect = useCallback(
    (next: T) => {
      if (clearable && next === value) {
        onSelect(null);
      } else {
        onSelect(next);
      }
    },
    [clearable, value, onSelect],
  );
  return (
    <View style={styles.fieldRow}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.chips}>
        {options.map((option) => (
          <OptionChip
            key={option.value}
            option={option}
            selected={option.value === value}
            onSelect={handleSelect}
          />
        ))}
      </View>
    </View>
  );
}

function OptionChip<T extends string>({
  option,
  selected,
  onSelect,
}: {
  option: Option<T>;
  selected: boolean;
  onSelect: (value: T) => void;
}) {
  const handlePress = useCallback(() => onSelect(option.value), [onSelect, option.value]);
  const chipStyle = useMemo(() => [styles.chip, selected ? styles.chipSelected : null], [selected]);
  const textStyle = useMemo(
    () => [styles.chipText, selected ? styles.chipTextSelected : null],
    [selected],
  );
  return (
    <Pressable accessibilityRole="button" onPress={handlePress} style={chipStyle}>
      <Text style={textStyle}>{option.label}</Text>
    </Pressable>
  );
}

function SingleSelectField({
  label,
  options,
  value,
  onSelect,
  onAdd,
}: {
  label: string;
  options: string[];
  value: string | null;
  onSelect: (value: string | null) => void;
  onAdd: (value: string) => void;
}) {
  const handleToggle = useCallback(
    (next: string) => onSelect(next === value ? null : next),
    [value, onSelect],
  );
  const handleAdd = useCallback(
    (next: string) => {
      onAdd(next);
      onSelect(next);
    },
    [onAdd, onSelect],
  );
  return (
    <View style={styles.fieldRow}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.chips}>
        {options.map((option) => (
          <StringChip
            key={option}
            value={option}
            selected={option === value}
            onPress={handleToggle}
          />
        ))}
        <AddChip onAdd={handleAdd} />
      </View>
    </View>
  );
}

function MultiSelectField({
  label,
  options,
  selected,
  onChange,
  onAdd,
}: {
  label: string;
  options: string[];
  selected: string[];
  onChange: (values: string[]) => void;
  onAdd: (value: string) => void;
}) {
  const handleToggle = useCallback(
    (next: string) => {
      if (selected.includes(next)) {
        onChange(selected.filter((value) => value !== next));
      } else {
        onChange([...selected, next]);
      }
    },
    [selected, onChange],
  );
  const handleAdd = useCallback(
    (next: string) => {
      onAdd(next);
      if (!selected.includes(next)) {
        onChange([...selected, next]);
      }
    },
    [onAdd, onChange, selected],
  );
  return (
    <View style={styles.fieldRow}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.chips}>
        {options.map((option) => (
          <StringChip
            key={option}
            value={option}
            selected={selected.includes(option)}
            onPress={handleToggle}
          />
        ))}
        <AddChip onAdd={handleAdd} />
      </View>
    </View>
  );
}

function StringChip({
  value,
  selected,
  onPress,
}: {
  value: string;
  selected: boolean;
  onPress: (value: string) => void;
}) {
  const handlePress = useCallback(() => onPress(value), [onPress, value]);
  const chipStyle = useMemo(() => [styles.chip, selected ? styles.chipSelected : null], [selected]);
  const textStyle = useMemo(
    () => [styles.chipText, selected ? styles.chipTextSelected : null],
    [selected],
  );
  return (
    <Pressable accessibilityRole="button" onPress={handlePress} style={chipStyle}>
      <Text style={textStyle}>{value}</Text>
    </Pressable>
  );
}

function AddChip({ onAdd }: { onAdd: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const handleOpen = useCallback(() => setOpen(true), []);
  const handleCommit = useCallback(() => {
    const value = draft.trim();
    if (value.length > 0) {
      onAdd(value);
    }
    setDraft("");
    setOpen(false);
  }, [draft, onAdd]);
  if (!open) {
    return (
      <Pressable accessibilityRole="button" onPress={handleOpen} style={styles.addChip}>
        <Text style={styles.addChipText}>+ Add</Text>
      </Pressable>
    );
  }
  return (
    <TextInput
      style={styles.addChipInput}
      value={draft}
      onChangeText={setDraft}
      onBlur={handleCommit}
      onSubmitEditing={handleCommit}
      placeholder="New…"
      placeholderTextColor={PLACEHOLDER_COLOR}
      autoFocus
      autoCapitalize="none"
      autoCorrect={false}
      returnKeyType="done"
    />
  );
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
      <TextField label="" value={value} placeholder="2026-06-20" onCommit={onCommit} />
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
  onRun: () => void;
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
        <Pressable
          accessibilityRole="button"
          disabled={runDisabled}
          onPress={onRun}
          style={runButtonStyle}
        >
          <Text style={styles.runButtonText}>Run</Text>
        </Pressable>
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

function rowHeaderStyle({ pressed }: PressableStateCallbackType) {
  return [styles.rowHeader, pressed ? styles.rowHeaderPressed : null];
}

function rowActionStyle({ pressed }: PressableStateCallbackType) {
  return [styles.rowAction, pressed ? styles.rowActionPressed : null];
}

function runButtonStyle({ pressed }: PressableStateCallbackType) {
  return [styles.runButton, pressed ? styles.runButtonPressed : null];
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
  addButtonText: { color: theme.colors.palette.white, fontWeight: theme.fontWeight.medium },
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
  runButtonText: { color: theme.colors.palette.white, fontSize: theme.fontSize.sm },
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
