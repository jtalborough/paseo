import { TextInput, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import { FileSaveStatusBar } from "@/components/file-save-status-bar";
import { useAutosaveFile } from "@/components/use-autosave-file";

interface FileEditorProps {
  client: DaemonClient;
  cwd: string;
  /** Read-target relative path the file was loaded with. */
  path: string;
  initialContent: string;
  initialModifiedAt: string;
  /** Re-fetch the file from disk (used to recover after a conflict). */
  onReload: () => void;
}

/**
 * Editable plain-text file view with debounced autosave. Writes carry the
 * last-known mtime so a change made on disk surfaces a conflict instead of being
 * silently clobbered — see [[use-autosave-file]] and CLAUDE.md.
 */
export function FileEditor({
  client,
  cwd,
  path,
  initialContent,
  initialModifiedAt,
  onReload,
}: FileEditorProps) {
  const { content, setContent, saveState, isConflicted } = useAutosaveFile({
    client,
    cwd,
    path,
    initialContent,
    initialModifiedAt,
  });

  return (
    <View style={styles.container}>
      <FileSaveStatusBar saveState={saveState} onReload={onReload} />
      <TextInput
        value={content}
        onChangeText={setContent}
        editable={!isConflicted}
        multiline
        autoCapitalize="none"
        autoCorrect={false}
        spellCheck={false}
        textAlignVertical="top"
        style={styles.input}
        testID="workspace-file-editor"
      />
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    flex: 1,
    minHeight: 0,
  },
  input: {
    flex: 1,
    minHeight: 0,
    color: theme.colors.foreground,
    backgroundColor: theme.colors.surface0,
    fontFamily: theme.fontFamily.mono,
    fontSize: theme.fontSize.code,
    lineHeight: theme.fontSize.code * 1.45,
    padding: theme.spacing[4],
  },
}));
