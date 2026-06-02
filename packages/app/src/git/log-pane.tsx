import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, ScrollView, Text, View } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import Svg, { Circle, Path } from "react-native-svg";
import { ChevronLeft } from "lucide-react-native";
import type { GitLogEntry } from "@getpaseo/protocol/messages";
import { DiffFileBody, DiffFileHeader } from "@/git/diff-pane";
import { computeGitGraph, type GraphRow } from "@/git/git-graph";
import { useCommitDiffQuery, useGitLogQuery } from "@/git/use-git-log-query";
import { formatTimeAgo } from "@/utils/time";

const ThemedChevronLeft = withUnistyles(ChevronLeft, (theme) => ({
  color: theme.colors.foreground,
}));

const ROW_HEIGHT = 52;
const LANE_WIDTH = 14;
const NODE_RADIUS = 4;
const MAX_GRAPH_LANES = 8;

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

  const layout = useMemo(
    () => computeGitGraph(commits.map((c) => ({ sha: c.sha, parents: c.parents }))),
    [commits],
  );
  const graphWidth = (Math.min(layout.laneCount, MAX_GRAPH_LANES) || 1) * LANE_WIDTH;

  const renderItem = useCallback(
    ({ item, index }: { item: GitLogEntry; index: number }) => (
      <CommitRow
        commit={item}
        graphRow={layout.rows[index]}
        graphWidth={graphWidth}
        onSelect={handleSelect}
      />
    ),
    [handleSelect, layout, graphWidth],
  );

  const keyExtractor = useCallback((item: GitLogEntry) => item.sha, []);
  const getItemLayout = useCallback(
    (_: unknown, index: number) => ({
      length: ROW_HEIGHT,
      offset: ROW_HEIGHT * index,
      index,
    }),
    [],
  );

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
      getItemLayout={getItemLayout}
      ListFooterComponent={footer}
      testID="git-log-list"
    />
  );
}

function CommitRow({
  commit,
  graphRow,
  graphWidth,
  onSelect,
}: {
  commit: GitLogEntry;
  graphRow: GraphRow | undefined;
  graphWidth: number;
  onSelect: (sha: string) => void;
}) {
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
      <CommitGraph row={graphRow} width={graphWidth} />
      <View style={styles.rowText}>
        <View style={styles.subjectLine}>
          {commit.refs.map((ref) => (
            <View key={ref} style={styles.refBadge}>
              <Text style={styles.refBadgeText} numberOfLines={1}>
                {ref}
              </Text>
            </View>
          ))}
          <Text style={styles.subject} numberOfLines={1}>
            {commit.subject}
          </Text>
        </View>
        <Text style={styles.meta} numberOfLines={1}>
          {commit.author} · {relativeDate} · {commit.shortSha}
        </Text>
      </View>
    </Pressable>
  );
}

function laneX(col: number): number {
  return col * LANE_WIDTH + LANE_WIDTH / 2;
}

function segmentPath(x1: number, y1: number, x2: number, y2: number): string {
  if (x1 === x2) {
    return `M ${x1} ${y1} L ${x2} ${y2}`;
  }
  // Smooth S-curve between lanes: control points at the vertical midpoint.
  const my = (y1 + y2) / 2;
  return `M ${x1} ${y1} C ${x1} ${my} ${x2} ${my} ${x2} ${y2}`;
}

function CommitGraph({ row, width }: { row: GraphRow | undefined; width: number }) {
  return (
    <Svg width={width} height={ROW_HEIGHT}>
      {(row?.segments ?? []).map((seg) => (
        <Path
          key={`${seg.x1}-${seg.y1}-${seg.x2}-${seg.y2}-${seg.color}`}
          d={segmentPath(laneX(seg.x1), seg.y1 * ROW_HEIGHT, laneX(seg.x2), seg.y2 * ROW_HEIGHT)}
          stroke={seg.color}
          strokeWidth={2}
          fill="none"
        />
      ))}
      {row ? (
        <Circle cx={laneX(row.nodeCol)} cy={ROW_HEIGHT / 2} r={NODE_RADIUS} fill={row.nodeColor} />
      ) : null}
    </Svg>
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
    height: ROW_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: theme.spacing[1],
    paddingRight: theme.spacing[3],
  },
  rowPressed: {
    backgroundColor: theme.colors.surfaceSidebarHover,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
    gap: theme.spacing[1],
    paddingLeft: theme.spacing[1],
  },
  subjectLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
  },
  subject: {
    flexShrink: 1,
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.ui,
  },
  meta: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.ui,
  },
  refBadge: {
    backgroundColor: theme.colors.surface2,
    borderRadius: theme.borderRadius.base,
    paddingHorizontal: theme.spacing[1],
    paddingVertical: 1,
    maxWidth: 140,
  },
  refBadgeText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.mono,
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
