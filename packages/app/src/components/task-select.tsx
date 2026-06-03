import { useCallback, useState } from "react";
import { Text, TextInput, View } from "react-native";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { StyleSheet } from "react-native-unistyles";

export interface SelectOption {
  value: string;
  label: string;
}

const PLACEHOLDER_COLOR = "#9ca3af";

function triggerStyle({ pressed, hovered }: { pressed: boolean; hovered: boolean }) {
  return [styles.trigger, (pressed || hovered) && styles.triggerActive];
}

/** Single-select dropdown. Optionally editable (add/remove option values). */
export function TaskSelect({
  label,
  options,
  value,
  onSelect,
  clearable = true,
  editable = false,
  onAddOption,
  onRemoveOption,
  placeholder = "—",
}: {
  label: string;
  options: SelectOption[];
  value: string | null;
  onSelect: (value: string | null) => void;
  clearable?: boolean;
  editable?: boolean;
  onAddOption?: (value: string) => void;
  onRemoveOption?: (value: string) => void;
  placeholder?: string;
}) {
  const current = options.find((option) => option.value === value);
  return (
    <View style={styles.fieldRow}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <DropdownMenu>
        <DropdownMenuTrigger style={triggerStyle}>
          <Text style={current ? styles.triggerText : styles.triggerPlaceholder}>
            {current ? current.label : placeholder}
          </Text>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" minWidth={200}>
          <SelectBody
            options={options}
            value={value}
            selectedValues={EMPTY}
            multi={false}
            onPick={onSelect}
            clearable={clearable}
            editable={editable}
            onAddOption={onAddOption}
            onRemoveOption={onRemoveOption}
          />
        </DropdownMenuContent>
      </DropdownMenu>
    </View>
  );
}

const EMPTY: string[] = [];

/** Multi-select dropdown. Optionally editable (add/remove option values). */
export function TaskMultiSelect({
  label,
  options,
  selected,
  onChange,
  editable = false,
  onAddOption,
  onRemoveOption,
}: {
  label: string;
  options: SelectOption[];
  selected: string[];
  onChange: (values: string[]) => void;
  editable?: boolean;
  onAddOption?: (value: string) => void;
  onRemoveOption?: (value: string) => void;
}) {
  const handlePick = useCallback(
    (next: string | null) => {
      if (next === null) {
        onChange(EMPTY);
        return;
      }
      if (selected.includes(next)) {
        onChange(selected.filter((item) => item !== next));
      } else {
        onChange([...selected, next]);
      }
    },
    [selected, onChange],
  );
  const summary = selected.length > 0 ? selected.join(", ") : null;
  return (
    <View style={styles.fieldRow}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <DropdownMenu>
        <DropdownMenuTrigger style={triggerStyle}>
          <Text style={summary ? styles.triggerText : styles.triggerPlaceholder} numberOfLines={1}>
            {summary ?? "—"}
          </Text>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" minWidth={200}>
          <SelectBody
            options={options}
            value={null}
            selectedValues={selected}
            multi
            onPick={handlePick}
            clearable={selected.length > 0}
            clearLabel="Clear all"
            editable={editable}
            onAddOption={onAddOption}
            onRemoveOption={onRemoveOption}
          />
        </DropdownMenuContent>
      </DropdownMenu>
    </View>
  );
}

function SelectBody({
  options,
  value,
  selectedValues,
  multi,
  onPick,
  clearable,
  clearLabel = "Clear",
  editable,
  onAddOption,
  onRemoveOption,
}: {
  options: SelectOption[];
  value: string | null;
  selectedValues: string[];
  multi: boolean;
  onPick: (value: string | null) => void;
  clearable: boolean;
  clearLabel?: string;
  editable?: boolean;
  onAddOption?: (value: string) => void;
  onRemoveOption?: (value: string) => void;
}) {
  const [manage, setManage] = useState(false);
  const [adding, setAdding] = useState(false);
  const toggleManage = useCallback(() => setManage((v) => !v), []);
  const startAdd = useCallback(() => setAdding(true), []);
  const handleClear = useCallback(() => onPick(null), [onPick]);
  const finishAdd = useCallback(
    (next: string) => {
      setAdding(false);
      const trimmed = next.trim();
      if (trimmed.length > 0) {
        onAddOption?.(trimmed);
      }
    },
    [onAddOption],
  );

  return (
    <>
      {options.map((option) => (
        <SelectItem
          key={option.value}
          option={option}
          selected={multi ? selectedValues.includes(option.value) : option.value === value}
          manage={manage}
          keepOpen={multi}
          onPick={onPick}
          onRemove={onRemoveOption}
        />
      ))}
      {clearable && !manage ? (
        <DropdownMenuItem onSelect={handleClear} muted>
          {clearLabel}
        </DropdownMenuItem>
      ) : null}
      {editable ? <DropdownMenuSeparator /> : null}
      {editable && adding ? <AddOptionInput onCommit={finishAdd} /> : null}
      {editable && !adding ? (
        <DropdownMenuItem onSelect={startAdd} closeOnSelect={false}>
          ＋ Add option
        </DropdownMenuItem>
      ) : null}
      {editable && onRemoveOption ? (
        <DropdownMenuItem onSelect={toggleManage} closeOnSelect={false} muted>
          {manage ? "Done removing" : "Remove options…"}
        </DropdownMenuItem>
      ) : null}
    </>
  );
}

function SelectItem({
  option,
  selected,
  manage,
  keepOpen,
  onPick,
  onRemove,
}: {
  option: SelectOption;
  selected: boolean;
  manage: boolean;
  keepOpen: boolean;
  onPick: (value: string | null) => void;
  onRemove?: (value: string) => void;
}) {
  const handleSelect = useCallback(() => {
    if (manage) {
      onRemove?.(option.value);
    } else {
      onPick(option.value);
    }
  }, [manage, onRemove, onPick, option.value]);
  return (
    <DropdownMenuItem
      onSelect={handleSelect}
      selected={!manage && selected}
      showSelectedCheck={!manage}
      destructive={manage}
      closeOnSelect={!manage && !keepOpen}
    >
      {manage ? `Remove “${option.label}”` : option.label}
    </DropdownMenuItem>
  );
}

function AddOptionInput({ onCommit }: { onCommit: (value: string) => void }) {
  const [draft, setDraft] = useState("");
  const handleCommit = useCallback(() => onCommit(draft), [draft, onCommit]);
  return (
    <TextInput
      style={styles.addInput}
      value={draft}
      onChangeText={setDraft}
      onSubmitEditing={handleCommit}
      onBlur={handleCommit}
      placeholder="New option…"
      placeholderTextColor={PLACEHOLDER_COLOR}
      autoFocus
      autoCapitalize="none"
      autoCorrect={false}
      returnKeyType="done"
    />
  );
}

const styles = StyleSheet.create((theme) => ({
  fieldRow: { gap: theme.spacing[1] },
  fieldLabel: { color: theme.colors.foregroundMuted, fontSize: theme.fontSize.xs },
  trigger: {
    height: 34,
    paddingHorizontal: theme.spacing[3],
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surface2,
    flexDirection: "row",
    alignItems: "center",
  },
  triggerActive: { backgroundColor: theme.colors.surface3 },
  triggerText: { color: theme.colors.foreground, fontSize: theme.fontSize.sm },
  triggerPlaceholder: { color: theme.colors.foregroundMuted, fontSize: theme.fontSize.sm },
  addInput: {
    margin: theme.spacing[1],
    paddingHorizontal: theme.spacing[2],
    height: 32,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surface2,
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
  },
}));
