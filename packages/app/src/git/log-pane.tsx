import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, ScrollView, Text, View } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { ChevronLeft } from "lucide-react-native";
import type { GitLogEntry } from "@getpaseo/protocol/messages";
import { DiffFileBody, DiffFileHeader } from "@/git/diff-pane";
import { useCommitDiffQuery, useGitLogQuery } from "@/git/use-git-log-query";
import { formatTimeAgo } from "@/utils/time";

const ThemedChevronLeft = withUnistyles(ChevronLeft, (theme) => ({
  color: theme.colors.foreground,
}));

interface GitLogPaneProps {
  serverId: string;
  cwd: string;
  enabled?: boolean;
}

export function GitLogPane({ serverId, cwd, enabled = true }: GitLogPaneProps) {
  const [selectedSha, setSelectedSha] = useState<string | null>(null);
  const { commits, hasMore, isLoading, isFetching, isError, error, loadMore } = useGitLogQuery({
    serverId,
    cwd,
    enabled,
  });

  const handleSelect = useCallback((sha: string) => {
    setSelectedSha(sha);
  }, []);

  const handleBack = useCallback(() => {
    setSelectedSha(null);
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: GitLogEntry }) => <CommitRow commit={item} onSelect={handleSelect} />,
    [handleSelect],
  );

  const keyExtractor = useCallback((item: GitLogEntry) => item.sha, []);

  const footer = useMemo(() => {
    if (!hasMore) {
      return null;
    }
    return (
      <Pressable
        style={styles.loadMore}
        onPress={loadMore}
        disabled={isFetching}
        testID="git-log-load-more"
      >
        {isFetching ? (
          <ActivityIndicator size="small" style={styles.iconSpacing} />
        ) : (
          <Text style={styles.loadMoreText}>Load more</Text>
        )}
      </Pressable>
    );
  }, [hasMore, isFetching, loadMore]);

  if (selectedSha) {
    return <CommitDiffView serverId={serverId} cwd={cwd} sha={selectedSha} onBack={handleBack} />;
  }

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (isError) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>
          {error instanceof Error ? error.message : "Failed to load commit history"}
        </Text>
      </View>
    );
  }

  if (commits.length === 0) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyText}>No commits yet</Text>
      </View>
    );
  }

  return (
    <FlatList
      style={styles.container}
      data={commits}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      ListFooterComponent={footer}
      testID="git-log-list"
    />
  );
}

function CommitRow({ commit, onSelect }: { commit: GitLogEntry; onSelect: (sha: string) => void }) {
  const handlePress = useCallback(() => onSelect(commit.sha), [commit.sha, onSelect]);
  const relativeDate = useMemo(() => {
    const parsed = new Date(commit.authoredAt);
    return Number.isNaN(parsed.getTime()) ? commit.authoredAt : formatTimeAgo(parsed);
  }, [commit.authoredAt]);

  return (
    <Pressable
      style={rowPressableStyle}
      onPress={handlePress}
      testID={`git-log-commit-${commit.shortSha}`}
    >
      <Text style={styles.subject} numberOfLines={1}>
        {commit.subject}
      </Text>
      <Text style={styles.meta} numberOfLines={1}>
        {commit.author} · {relativeDate} · {commit.shortSha}
      </Text>
    </Pressable>
  );
}

function CommitDiffView({
  serverId,
  cwd,
  sha,
  onBack,
}: {
  serverId: string;
  cwd: string;
  sha: string;
  onBack: () => void;
}) {
  const { files, isLoading, isError, error } = useCommitDiffQuery({ serverId, cwd, sha });

  function renderBody() {
    if (isLoading) {
      return (
        <View style={styles.centered}>
          <ActivityIndicator size="large" />
        </View>
      );
    }
    if (isError) {
      return (
        <View style={styles.centered}>
          <Text style={styles.errorText}>
            {error instanceof Error ? error.message : "Failed to load commit diff"}
          </Text>
        </View>
      );
    }
    if (files.length === 0) {
      return (
        <View style={styles.centered}>
          <Text style={styles.emptyText}>No changes in this commit</Text>
        </View>
      );
    }
    return (
      <ScrollView style={styles.diffScroll}>
        {files.map((file) => (
          <View key={file.path}>
            <DiffFileHeader file={file} isExpanded onToggle={noop} />
            <DiffFileBody file={file} layout="unified" wrapLines={false} />
          </View>
        ))}
      </ScrollView>
    );
  }

  return (
    <View style={styles.container}>
      <Pressable style={styles.backRow} onPress={onBack} testID="git-log-back">
        <ThemedChevronLeft size={16} style={styles.iconSpacing} />
        <Text style={styles.backText} numberOfLines={1}>
          {sha.slice(0, 7)}
        </Text>
      </Pressable>
      {renderBody()}
    </View>
  );
}

function noop() {}

function rowPressableStyle({ pressed }: { pressed: boolean }) {
  return [styles.row, pressed && styles.rowPressed];
}

const styles = StyleSheet.create((theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.surfaceSidebar,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: theme.spacing[4],
  },
  row: {
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    gap: theme.spacing[1],
  },
  rowPressed: {
    backgroundColor: theme.colors.surfaceSidebarHover,
  },
  subject: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.ui,
  },
  meta: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.ui,
  },
  loadMore: {
    paddingVertical: theme.spacing[3],
    alignItems: "center",
    justifyContent: "center",
  },
  loadMoreText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.ui,
  },
  errorText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    textAlign: "center",
  },
  emptyText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  backRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  backText: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.mono,
  },
  iconSpacing: {
    marginRight: theme.spacing[1],
  },
  diffScroll: {
    flex: 1,
  },
}));
