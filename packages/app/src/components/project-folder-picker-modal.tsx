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
import { ArrowUp, Check, ChevronRight, Folder, HardDrive, Home } from "lucide-react-native";
import { useQuery } from "@tanstack/react-query";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { useHostRuntimeClient, useHostRuntimeIsConnected } from "@/runtime/host-runtime";
import { useSessionStore } from "@/stores/session-store";
import { useRecommendedProjectPaths } from "@/stores/session-store-hooks";
import {
  buildRemoteFolderBrowseRoots,
  buildRemoteFolderBrowserRows,
  type RemoteFolderBrowserRow,
  type RemoteFolderBrowseRoot,
} from "@/components/project-folder-browser-core";
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
  onBrowse: (path: string) => void;
  onSelect: (path: string) => void;
}

function PathRow({ path, active, onBrowse, onSelect }: PathRowProps) {
  const { theme } = useUnistyles();
  const handlePress = useCallback(() => onSelect(path), [onSelect, path]);
  const handleBrowse = useCallback(() => onBrowse(path), [onBrowse, path]);
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
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Browse ${path}`}
          hitSlop={8}
          onPress={handleBrowse}
          style={styles.browseButton}
        >
          <ChevronRight size={16} strokeWidth={2.2} color={theme.colors.foregroundMuted} />
        </Pressable>
      </View>
    </Pressable>
  );
}

interface BrowseRootButtonProps {
  root: RemoteFolderBrowseRoot;
  active: boolean;
  onPress: (root: RemoteFolderBrowseRoot) => void;
}

function BrowseRootButton({ root, active, onPress }: BrowseRootButtonProps) {
  const { theme } = useUnistyles();
  const handlePress = useCallback(() => onPress(root), [onPress, root]);
  const isFilesystem = root.id === "filesystem";
  const accessibilityState = useMemo(() => ({ selected: active }), [active]);
  const buttonStyle = useMemo(
    () => [
      styles.rootButton,
      {
        borderColor: active ? theme.colors.primary : theme.colors.border,
        backgroundColor: active ? theme.colors.surface1 : theme.colors.surface0,
      },
    ],
    [
      active,
      theme.colors.border,
      theme.colors.primary,
      theme.colors.surface0,
      theme.colors.surface1,
    ],
  );
  const textStyle = useMemo(
    () => [styles.rootButtonText, { color: theme.colors.foreground }],
    [theme.colors.foreground],
  );
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={accessibilityState}
      onPress={handlePress}
      style={buttonStyle}
    >
      {isFilesystem ? (
        <HardDrive size={14} strokeWidth={2.2} color={theme.colors.foregroundMuted} />
      ) : (
        <Home size={14} strokeWidth={2.2} color={theme.colors.foregroundMuted} />
      )}
      <Text style={textStyle} numberOfLines={1}>
        {root.label}
      </Text>
    </Pressable>
  );
}

interface BrowseRowProps {
  row: RemoteFolderBrowserRow;
  onBrowse: (path: string) => void;
  onSelect: (path: string) => void;
}

function BrowseRow({ row, onBrowse, onSelect }: BrowseRowProps) {
  const { theme } = useUnistyles();
  const isSelectable = row.kind === "current";
  const handlePress = useCallback(() => {
    if (isSelectable) {
      onSelect(row.path);
      return;
    }
    onBrowse(row.path);
  }, [isSelectable, onBrowse, onSelect, row.path]);
  const iconColor = isSelectable ? theme.colors.primary : theme.colors.foregroundMuted;
  const rowTextStyle = useMemo(
    () => [styles.rowText, { color: theme.colors.foreground }],
    [theme.colors.foreground],
  );
  const rowSecondaryTextStyle = useMemo(
    () => [styles.rowSecondaryText, { color: theme.colors.foregroundMuted }],
    [theme.colors.foregroundMuted],
  );
  const shouldShowDisclosure = row.kind === "child" || row.kind === "parent";

  return (
    <Pressable style={styles.row} onPress={handlePress}>
      <View style={styles.rowContent}>
        <View style={styles.iconSlot}>
          <BrowseRowIcon kind={row.kind} color={iconColor} />
        </View>
        <View style={styles.rowTextColumn}>
          <Text style={rowTextStyle} numberOfLines={1}>
            {row.label}
          </Text>
          {row.kind !== "current" ? (
            <Text style={rowSecondaryTextStyle} numberOfLines={1}>
              {shortenPath(row.path)}
            </Text>
          ) : null}
        </View>
        {shouldShowDisclosure ? (
          <ChevronRight size={16} strokeWidth={2.2} color={theme.colors.foregroundMuted} />
        ) : null}
      </View>
    </Pressable>
  );
}

function BrowseRowIcon({ kind, color }: { kind: RemoteFolderBrowserRow["kind"]; color: string }) {
  if (kind === "current") {
    return <Check size={16} strokeWidth={2.2} color={color} />;
  }
  if (kind === "parent") {
    return <ArrowUp size={16} strokeWidth={2.2} color={color} />;
  }
  return <Folder size={16} strokeWidth={2.2} color={color} />;
}

type HostRuntimeClient = NonNullable<ReturnType<typeof useHostRuntimeClient>>;

interface RemoteFolderBrowserState {
  browseRoots: RemoteFolderBrowseRoot[];
  selectedBrowseRoot: RemoteFolderBrowseRoot | null;
  browseRows: RemoteFolderBrowserRow[];
  browseErrorMessage: string | null;
  isFetching: boolean;
  handleSelectBrowseRoot: (root: RemoteFolderBrowseRoot) => void;
  handleBrowseDirectory: (path: string) => void;
}

function useRemoteFolderBrowser(input: {
  client: HostRuntimeClient | null | undefined;
  isConnected: boolean;
  visible: boolean;
  serverId: string;
  supported: boolean;
  recommendedPaths: readonly string[];
}): RemoteFolderBrowserState {
  const browseRoots = useMemo(
    () => buildRemoteFolderBrowseRoots({ recommendedPaths: input.recommendedPaths }),
    [input.recommendedPaths],
  );
  const [selectedBrowseRootId, setSelectedBrowseRootId] = useState("home");
  const [browsePath, setBrowsePath] = useState(".");
  const selectedBrowseRoot = useMemo(
    () => browseRoots.find((root) => root.id === selectedBrowseRootId) ?? browseRoots[0] ?? null,
    [browseRoots, selectedBrowseRootId],
  );

  const directoryBrowseQuery = useQuery({
    queryKey: [
      "project-folder-picker-directory-browse",
      input.serverId,
      selectedBrowseRoot?.root,
      browsePath,
    ],
    queryFn: async () => {
      if (!input.client || !selectedBrowseRoot) {
        return null;
      }
      const result = await input.client.browseDirectory({
        root: selectedBrowseRoot.root,
        path: browsePath,
      });
      if (result.error) {
        throw new Error(result.error);
      }
      return result;
    },
    enabled:
      Boolean(input.client) &&
      input.isConnected &&
      input.visible &&
      input.supported &&
      Boolean(selectedBrowseRoot),
    staleTime: 10_000,
    retry: false,
  });

  const handleSelectBrowseRoot = useCallback((root: RemoteFolderBrowseRoot) => {
    setSelectedBrowseRootId(root.id);
    setBrowsePath(".");
  }, []);

  const handleBrowseDirectory = useCallback((path: string) => {
    setBrowsePath(path);
  }, []);

  useEffect(() => {
    if (!input.visible) {
      return;
    }
    setSelectedBrowseRootId("home");
    setBrowsePath(".");
  }, [input.visible]);

  useEffect(() => {
    if (browseRoots.some((root) => root.id === selectedBrowseRootId)) {
      return;
    }
    setSelectedBrowseRootId(browseRoots[0]?.id ?? "home");
    setBrowsePath(".");
  }, [browseRoots, selectedBrowseRootId]);

  const browseRows = useMemo(
    () =>
      buildRemoteFolderBrowserRows({
        currentPath: directoryBrowseQuery.data?.path ?? null,
        parentPath: directoryBrowseQuery.data?.parentPath ?? null,
        entries: directoryBrowseQuery.data?.entries ?? [],
      }),
    [
      directoryBrowseQuery.data?.entries,
      directoryBrowseQuery.data?.parentPath,
      directoryBrowseQuery.data?.path,
    ],
  );

  return {
    browseRoots,
    selectedBrowseRoot,
    browseRows,
    browseErrorMessage: getBrowseErrorMessage(
      directoryBrowseQuery.error,
      directoryBrowseQuery.isError,
    ),
    isFetching: directoryBrowseQuery.isFetching,
    handleSelectBrowseRoot,
    handleBrowseDirectory,
  };
}

function getBrowseErrorMessage(error: unknown, isError: boolean): string | null {
  if (error instanceof Error) {
    return error.message;
  }
  if (isError) {
    return "Unable to browse remote directory";
  }
  return null;
}

interface RemoteFolderBrowseSectionProps extends RemoteFolderBrowserState {
  supported: boolean;
  isConnected: boolean;
  errorTextStyle: object;
  emptyTextStyle: object;
  onSelectPath: (path: string) => void;
}

function RemoteFolderBrowseSection({
  supported,
  isConnected,
  browseRoots,
  selectedBrowseRoot,
  browseRows,
  browseErrorMessage,
  isFetching,
  errorTextStyle,
  emptyTextStyle,
  handleSelectBrowseRoot,
  handleBrowseDirectory,
  onSelectPath,
}: RemoteFolderBrowseSectionProps) {
  if (!supported) {
    if (!isConnected) {
      return null;
    }
    return <Text style={emptyTextStyle}>Update the host to browse remote directories.</Text>;
  }

  const isEmptyDirectory = !isFetching && !browseErrorMessage && browseRows.length === 1;

  return (
    <View style={styles.browseSection}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="always"
        contentContainerStyle={styles.rootButtonRow}
      >
        {browseRoots.map((root) => (
          <BrowseRootButton
            key={root.id}
            root={root}
            active={root.id === selectedBrowseRoot?.id}
            onPress={handleSelectBrowseRoot}
          />
        ))}
      </ScrollView>
      {browseErrorMessage ? <Text style={errorTextStyle}>{browseErrorMessage}</Text> : null}
      {isFetching && browseRows.length === 0 ? (
        <Text style={emptyTextStyle}>Loading remote directories...</Text>
      ) : null}
      {isEmptyDirectory ? <Text style={emptyTextStyle}>No child directories</Text> : null}
      {browseRows.map((row) => (
        <BrowseRow
          key={`${row.kind}:${row.path}`}
          row={row}
          onBrowse={handleBrowseDirectory}
          onSelect={onSelectPath}
        />
      ))}
    </View>
  );
}

function resolveEmptyMessage(input: {
  errorMessage: string | null;
  isSubmitting: boolean;
  optionsLength: number;
  query: string;
  isFetching: boolean;
  isConnected: boolean;
}): string | null {
  if (input.errorMessage) {
    return null;
  }
  if (input.isSubmitting) {
    return "Adding folder...";
  }
  if (input.optionsLength > 0) {
    return null;
  }
  if (!input.query.trim()) {
    if (input.isFetching) {
      return "Loading remote directories...";
    }
    return input.isConnected
      ? "No remote directories found. Type a path to add one manually."
      : "Host is offline";
  }
  if (!input.isFetching) {
    return "No matching remote directories";
  }
  return null;
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
  const supportsRemoteDirectoryBrowse =
    useSessionStore(
      (state) => state.sessions[serverId]?.serverInfo?.features?.remoteDirectoryBrowse,
    ) === true;
  const inputRef = useRef<TextInput>(null);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const remoteFolderBrowser = useRemoteFolderBrowser({
    client,
    isConnected,
    visible,
    serverId,
    supported: supportsRemoteDirectoryBrowse,
    recommendedPaths,
  });
  const directorySuggestionsQueryText = query.trim() || "~";

  const directorySuggestionsQuery = useQuery({
    queryKey: [
      "project-folder-picker-directory-suggestions",
      serverId,
      directorySuggestionsQueryText,
    ],
    queryFn: async () => {
      if (!client) return [];
      const result = await client.getDirectorySuggestions({
        query: directorySuggestionsQueryText,
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
      query: query.trim() ? query : directorySuggestionsQueryText,
    });
    const trimmedQuery = query.trim();
    if (!trimmedQuery || suggestedPaths.includes(trimmedQuery)) {
      return suggestedPaths;
    }
    return [trimmedQuery, ...suggestedPaths];
  }, [directorySuggestionsQuery.data, directorySuggestionsQueryText, query, recommendedPaths]);

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

  const handleBrowsePath = useCallback((path: string) => {
    setQuery(path.endsWith("/") ? path : `${path}/`);
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
  const emptyMessage = resolveEmptyMessage({
    errorMessage,
    isSubmitting,
    optionsLength: options.length,
    query,
    isFetching: directorySuggestionsQuery.isFetching,
    isConnected,
  });
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
              placeholder="Search or browse remote directories..."
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
            <RemoteFolderBrowseSection
              {...remoteFolderBrowser}
              supported={supportsRemoteDirectoryBrowse}
              isConnected={isConnected}
              errorTextStyle={errorTextStyle}
              emptyTextStyle={emptyTextStyle}
              onSelectPath={handleSelectPath}
            />
            {emptyMessage ? <Text style={emptyTextStyle}>{emptyMessage}</Text> : null}
            {!isSubmitting && !(options.length === 0 && !query.trim()) ? (
              <>
                {options.map((path, index) => (
                  <PathRow
                    key={path}
                    path={path}
                    active={index === activeIndex}
                    onBrowse={handleBrowsePath}
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
    flex: 1,
    fontSize: theme.fontSize.base,
    fontWeight: "400",
    lineHeight: 20,
    minWidth: 0,
  },
  rowTextColumn: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  rowSecondaryText: {
    fontSize: theme.fontSize.sm,
    lineHeight: 16,
  },
  browseButton: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.borderRadius.md,
  },
  emptyText: {
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[4],
    fontSize: theme.fontSize.base,
  },
  browseSection: {
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    paddingBottom: theme.spacing[2],
    marginBottom: theme.spacing[1],
  },
  rootButtonRow: {
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[2],
    gap: theme.spacing[2],
  },
  rootButton: {
    maxWidth: 180,
    minHeight: 30,
    paddingHorizontal: theme.spacing[3],
    borderWidth: 1,
    borderRadius: theme.borderRadius.md,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  rootButtonText: {
    minWidth: 0,
    fontSize: theme.fontSize.sm,
    lineHeight: 18,
  },
}));
