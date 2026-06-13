import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  type PressableStateCallbackType,
} from "react-native";
import { Folder } from "lucide-react-native";
import { useQuery } from "@tanstack/react-query";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { useHostRuntimeClient, useHostRuntimeIsConnected } from "@/runtime/host-runtime";
import { useRecommendedProjectPaths } from "@/stores/session-store-hooks";
import { buildWorkingDirectorySuggestions } from "@/utils/working-directory-suggestions";
import { shortenPath } from "@/utils/shorten-path";
import { isNative } from "@/constants/platform";

interface ProjectFolderPickerModalProps {
  visible: boolean;
  serverId: string;
  title?: string;
  onClose: () => void;
  onSelectPath: (path: string) => Promise<void>;
}

interface PathRowProps {
  path: string;
  active: boolean;
  onSelect: (path: string) => void;
}

function PathRow({ path, active, onSelect }: PathRowProps) {
  const { theme } = useUnistyles();
  const handlePress = useCallback(() => onSelect(path), [onSelect, path]);
  const pressableStyle = useCallback(
    ({ hovered = false, pressed }: PressableStateCallbackType & { hovered?: boolean }) => [
      styles.row,
      (Boolean(hovered) || pressed || active) && {
        backgroundColor: theme.colors.surface1,
      },
    ],
    [active, theme.colors.surface1],
  );
  const rowTextStyle = useMemo(
    () => [styles.rowText, { color: theme.colors.foreground }],
    [theme.colors.foreground],
  );

  return (
    <Pressable style={pressableStyle} onPress={handlePress}>
      <View style={styles.rowContent}>
        <View style={styles.iconSlot}>
          <Folder size={16} strokeWidth={2.2} color={theme.colors.foregroundMuted} />
        </View>
        <Text style={rowTextStyle} numberOfLines={1}>
          {shortenPath(path)}
        </Text>
      </View>
    </Pressable>
  );
}

export function ProjectFolderPickerModal({
  visible,
  serverId,
  title = "Add folder",
  onClose,
  onSelectPath,
}: ProjectFolderPickerModalProps) {
  const { theme } = useUnistyles();
  const client = useHostRuntimeClient(serverId);
  const isConnected = useHostRuntimeIsConnected(serverId);
  const recommendedPaths = useRecommendedProjectPaths(serverId);
  const inputRef = useRef<TextInput>(null);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const directorySuggestionsQuery = useQuery({
    queryKey: ["project-folder-picker-directory-suggestions", serverId, query],
    queryFn: async () => {
      if (!client) return [];
      const result = await client.getDirectorySuggestions({
        query,
        includeDirectories: true,
        includeFiles: false,
        limit: 30,
      });
      return (
        result.entries?.flatMap((entry) => (entry.kind === "directory" ? [entry.path] : [])) ?? []
      );
    },
    enabled: Boolean(client) && isConnected && visible,
    staleTime: 15_000,
    retry: false,
  });

  const options = useMemo(() => {
    const suggestedPaths = buildWorkingDirectorySuggestions({
      recommendedPaths,
      serverPaths: directorySuggestionsQuery.data ?? [],
      query,
    });
    const trimmedQuery = query.trim();
    if (!trimmedQuery || suggestedPaths.includes(trimmedQuery)) {
      return suggestedPaths;
    }
    return [trimmedQuery, ...suggestedPaths];
  }, [directorySuggestionsQuery.data, query, recommendedPaths]);

  const handleSelectPath = useCallback(
    async (path: string) => {
      const trimmed = path.trim();
      if (!trimmed || isSubmitting) return;
      setIsSubmitting(true);
      setErrorMessage(null);
      try {
        await onSelectPath(trimmed);
        onClose();
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Failed to add folder");
      } finally {
        setIsSubmitting(false);
      }
    },
    [isSubmitting, onClose, onSelectPath],
  );

  const handleSubmitCustom = useCallback(() => {
    const trimmed = query.trim();
    if (!trimmed) return;
    void handleSelectPath(trimmed);
  }, [handleSelectPath, query]);

  const handleChangeQuery = useCallback((text: string) => {
    setQuery(text);
    setActiveIndex(0);
    setErrorMessage(null);
  }, []);

  useEffect(() => {
    if (!visible) return;
    setQuery("");
    setActiveIndex(0);
    setErrorMessage(null);
    const id = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(id);
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    if (activeIndex >= options.length) {
      setActiveIndex(options.length > 0 ? options.length - 1 : 0);
    }
  }, [activeIndex, options.length, visible]);

  useEffect(() => {
    if (!visible || isNative) return;

    function handler(event: KeyboardEvent) {
      const key = event.key;
      if (key !== "ArrowDown" && key !== "ArrowUp" && key !== "Enter" && key !== "Escape") return;
      if (key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (key === "Enter") {
        event.preventDefault();
        if (options.length > 0 && activeIndex < options.length) {
          void handleSelectPath(options[activeIndex]);
        } else {
          handleSubmitCustom();
        }
        return;
      }
      if (options.length === 0) return;
      event.preventDefault();
      setActiveIndex((current) => {
        const delta = key === "ArrowDown" ? 1 : -1;
        const next = current + delta;
        if (next < 0) return options.length - 1;
        if (next >= options.length) return 0;
        return next;
      });
    }

    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [activeIndex, handleSelectPath, handleSubmitCustom, onClose, options, visible]);

  const panelStyle = useMemo(
    () => [
      styles.panel,
      {
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface0,
      },
    ],
    [theme.colors.border, theme.colors.surface0],
  );
  const headerStyle = useMemo(
    () => [styles.header, { borderBottomColor: theme.colors.border }],
    [theme.colors.border],
  );
  const inputStyle = useMemo(
    () => [styles.input, { color: theme.colors.foreground }],
    [theme.colors.foreground],
  );
  const titleStyle = useMemo(
    () => [styles.title, { color: theme.colors.foreground }],
    [theme.colors.foreground],
  );
  const emptyTextStyle = useMemo(
    () => [styles.emptyText, { color: theme.colors.foregroundMuted }],
    [theme.colors.foregroundMuted],
  );
  const errorTextStyle = useMemo(
    () => [styles.emptyText, { color: theme.colors.destructive }],
    [theme.colors.destructive],
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={panelStyle}>
          <View style={headerStyle}>
            <Text style={titleStyle}>{title}</Text>
            <TextInput
              ref={inputRef}
              value={query}
              onChangeText={handleChangeQuery}
              placeholder="Type a remote directory path..."
              placeholderTextColor={theme.colors.foregroundMuted}
              style={inputStyle}
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus
              editable={!isSubmitting}
              returnKeyType="go"
              onSubmitEditing={handleSubmitCustom}
            />
          </View>

          <ScrollView
            style={styles.results}
            contentContainerStyle={styles.resultsContent}
            keyboardShouldPersistTaps="always"
            showsVerticalScrollIndicator={false}
          >
            {errorMessage ? <Text style={errorTextStyle}>{errorMessage}</Text> : null}
            {!errorMessage && isSubmitting ? (
              <Text style={emptyTextStyle}>Adding folder...</Text>
            ) : null}
            {!errorMessage && !isSubmitting && options.length === 0 && !query.trim() ? (
              <Text style={emptyTextStyle}>Start typing a remote path</Text>
            ) : null}
            {!isSubmitting && !(options.length === 0 && !query.trim()) ? (
              <>
                {options.map((path, index) => (
                  <PathRow
                    key={path}
                    path={path}
                    active={index === activeIndex}
                    onSelect={handleSelectPath}
                  />
                ))}
              </>
            ) : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create((theme) => ({
  overlay: {
    flex: 1,
    justifyContent: "flex-start",
    alignItems: "center",
    paddingTop: theme.spacing[12],
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  panel: {
    width: 640,
    maxWidth: "92%",
    maxHeight: "80%",
    borderWidth: 1,
    borderRadius: theme.borderRadius.lg,
    overflow: "hidden",
    ...theme.shadow.lg,
  },
  header: {
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[3],
    borderBottomWidth: 1,
    gap: theme.spacing[2],
  },
  title: {
    fontSize: theme.fontSize.base,
    fontWeight: "500",
  },
  input: {
    fontSize: theme.fontSize.lg,
    paddingVertical: theme.spacing[1],
    outlineStyle: "none",
  } as object,
  results: {
    flexGrow: 0,
  },
  resultsContent: {
    paddingVertical: theme.spacing[2],
  },
  row: {
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[2],
  },
  rowContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[3],
  },
  iconSlot: {
    width: 16,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  rowText: {
    fontSize: theme.fontSize.base,
    fontWeight: "400",
    lineHeight: 20,
    flexShrink: 1,
  },
  emptyText: {
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[4],
    fontSize: theme.fontSize.base,
  },
}));
