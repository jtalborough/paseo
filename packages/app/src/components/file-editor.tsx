import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";

const AUTOSAVE_DELAY_MS = 800;

type SaveState =
  | { status: "idle" }
  | { status: "saving" }
  | { status: "saved" }
  | { status: "error"; message: string }
  | { status: "conflict" };

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
 * Editable text-file view with debounced autosave. Writes carry the last-known
 * mtime as `expectedModifiedAt` so a change made on disk (e.g. by an agent)
 * surfaces a conflict instead of being silently clobbered — see CLAUDE.md.
 */
export function FileEditor({
  client,
  cwd,
  path,
  initialContent,
  initialModifiedAt,
  onReload,
}: FileEditorProps) {
  const [content, setContent] = useState(initialContent);
  const [saveState, setSaveState] = useState<SaveState>({ status: "idle" });

  // The mtime + content we last persisted. Refs because autosave reads the
  // latest values without re-arming the debounce on every keystroke.
  const savedModifiedAtRef = useRef(initialModifiedAt);
  const savedContentRef = useRef(initialContent);
  const conflictedRef = useRef(false);

  // Reset when the underlying file changes (different path or a reload).
  useEffect(() => {
    setContent(initialContent);
    setSaveState({ status: "idle" });
    savedModifiedAtRef.current = initialModifiedAt;
    savedContentRef.current = initialContent;
    conflictedRef.current = false;
  }, [initialContent, initialModifiedAt]);

  const save = useCallback(
    async (next: string) => {
      setSaveState({ status: "saving" });
      try {
        const result = await client.writeFile(cwd, path, next, {
          expectedModifiedAt: savedModifiedAtRef.current,
        });
        if (result.outcome === "conflict") {
          conflictedRef.current = true;
          setSaveState({ status: "conflict" });
          return;
        }
        if (result.error || !result.modifiedAt) {
          setSaveState({ status: "error", message: result.error ?? "Failed to save" });
          return;
        }
        savedModifiedAtRef.current = result.modifiedAt;
        savedContentRef.current = next;
        setSaveState({ status: "saved" });
      } catch (error) {
        setSaveState({
          status: "error",
          message: error instanceof Error ? error.message : "Failed to save",
        });
      }
    },
    [client, cwd, path],
  );

  // Debounced autosave: fire once the content has been idle for a moment and
  // differs from what is on disk. Stops once a conflict is detected.
  useEffect(() => {
    if (conflictedRef.current) {
      return;
    }
    if (content === savedContentRef.current) {
      return;
    }
    const timeout = setTimeout(() => {
      void save(content);
    }, AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timeout);
  }, [content, save]);

  return (
    <View style={styles.container}>
      <StatusBar saveState={saveState} onReload={onReload} />
      <TextInput
        value={content}
        onChangeText={setContent}
        editable={saveState.status !== "conflict"}
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

function StatusBar({ saveState, onReload }: { saveState: SaveState; onReload: () => void }) {
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
  container: {
    flex: 1,
    minHeight: 0,
  },
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
