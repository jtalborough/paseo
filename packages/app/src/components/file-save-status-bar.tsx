import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import type { SaveState } from "@/components/use-autosave-file";

interface FileSaveStatusBarProps {
  saveState: SaveState;
  /** Re-fetch the file from disk (used to recover after a conflict). */
  onReload: () => void;
  /** Optional trailing action, e.g. a markdown "View source" toggle. */
  actionLabel?: string;
  onAction?: () => void;
}

/**
 * Shared header for editable file panes: shows save status (Editing / Saving… /
 * Saved / error) and a non-destructive conflict banner with a Reload action.
 */
export function FileSaveStatusBar({
  saveState,
  onReload,
  actionLabel,
  onAction,
}: FileSaveStatusBarProps) {
  if (saveState.status === "conflict") {
    return (
      <View style={styles.statusBarConflict}>
        <Text style={styles.statusConflictText}>
          File changed on disk — reload to keep editing.
        </Text>
        <Pressable onPress={onReload} hitSlop={8}>
          <Text style={styles.reloadText}>Reload</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.statusBar}>
      <StatusBarLabel saveState={saveState} />
      {actionLabel && onAction ? (
        <Pressable onPress={onAction} hitSlop={8} style={styles.trailing}>
          <Text style={styles.actionText}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function StatusBarLabel({ saveState }: { saveState: SaveState }) {
  if (saveState.status === "saving") {
    return (
      <View style={styles.statusRow}>
        <ActivityIndicator size="small" />
        <Text style={styles.statusText}>Saving…</Text>
      </View>
    );
  }
  if (saveState.status === "saved") {
    return <Text style={styles.statusText}>Saved</Text>;
  }
  if (saveState.status === "error") {
    return <Text style={styles.statusErrorText}>{saveState.message}</Text>;
  }
  return <Text style={styles.statusText}>Editing</Text>;
}

const styles = StyleSheet.create((theme) => ({
  statusBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[2],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
    backgroundColor: theme.colors.surface0,
  },
  statusBarConflict: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[2],
    backgroundColor: theme.colors.destructive,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  trailing: {
    flexDirection: "row",
    alignItems: "center",
  },
  actionText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    fontWeight: "600",
  },
  statusText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  statusErrorText: {
    color: theme.colors.destructive,
    fontSize: theme.fontSize.sm,
  },
  statusConflictText: {
    color: theme.colors.background,
    fontSize: theme.fontSize.sm,
    flexShrink: 1,
  },
  reloadText: {
    color: theme.colors.background,
    fontSize: theme.fontSize.sm,
    fontWeight: "600",
    marginLeft: theme.spacing[3],
  },
}));
