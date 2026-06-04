import { useCallback, useMemo, useState } from "react";
import { Image, Text, View } from "react-native";
import { Globe } from "lucide-react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { AdaptiveRenameModal } from "@/components/rename-modal";
import { SortableInlineList } from "@/components/sortable-inline-list";
import type { DraggableRenderItemInfo } from "@/components/draggable-list.types";
import type { Theme } from "@/styles/theme";
import {
  buildWorkspaceBookmarksKey,
  useWorkspaceBookmarks,
  useWorkspaceBookmarksStore,
  type WorkspaceBookmark,
} from "@/stores/workspace-pins";

const CONTEXT_MENU_WIDTH = 180;

const ThemedGlobe = withUnistyles(Globe);
const mutedColorMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });

function hostnameForUrl(url: string): string {
  try {
    return new URL(url).hostname || url;
  } catch {
    return url;
  }
}

function faviconImageSource(uri: string) {
  return { uri };
}

// Prefer the favicon snapshotted when the page was bookmarked; fall back to the
// site's well-known /favicon.ico so rows show the real icon even if the snapshot
// was empty at save time.
function deriveFaviconUri(bookmark: WorkspaceBookmark): string | null {
  if (bookmark.faviconUrl) {
    return bookmark.faviconUrl;
  }
  try {
    return `${new URL(bookmark.url).origin}/favicon.ico`;
  } catch {
    return null;
  }
}

function BookmarkRow({
  bookmark,
  isActive,
  onOpen,
  onRename,
  onRemove,
}: {
  bookmark: WorkspaceBookmark;
  isActive: boolean;
  onOpen: (bookmark: WorkspaceBookmark) => void;
  onRename: (bookmark: WorkspaceBookmark) => void;
  onRemove: (id: string) => void;
}) {
  const label = bookmark.name.trim() || hostnameForUrl(bookmark.url) || "Bookmark";
  const [faviconBroken, setFaviconBroken] = useState(false);
  const faviconUri = faviconBroken ? null : deriveFaviconUri(bookmark);
  const handleFaviconError = useCallback(() => setFaviconBroken(true), []);

  const handleOpen = useCallback(() => onOpen(bookmark), [onOpen, bookmark]);
  const handleRename = useCallback(() => onRename(bookmark), [onRename, bookmark]);
  const handleRemove = useCallback(() => onRemove(bookmark.id), [onRemove, bookmark.id]);

  const rowStyle = useCallback(
    ({ hovered, pressed }: { hovered?: boolean; pressed?: boolean }) => [
      styles.row,
      isActive && styles.rowActive,
      (hovered || pressed) && !isActive && styles.rowHovered,
    ],
    [isActive],
  );

  return (
    <ContextMenu>
      <ContextMenuTrigger
        enabledOnMobile={false}
        accessibilityRole="button"
        accessibilityLabel={`Open ${label}`}
        onPress={handleOpen}
        style={rowStyle}
        testID={`bookmark-${bookmark.id}`}
      >
        <View style={styles.favicon}>
          {faviconUri ? (
            <Image
              accessibilityIgnoresInvertColors
              source={faviconImageSource(faviconUri)}
              style={styles.faviconImage}
              onError={handleFaviconError}
            />
          ) : (
            <ThemedGlobe size={15} uniProps={mutedColorMapping} />
          )}
        </View>
        <Text numberOfLines={1} style={isActive ? styles.nameTextActive : styles.nameText}>
          {label}
        </Text>
      </ContextMenuTrigger>
      <ContextMenuContent align="start" width={CONTEXT_MENU_WIDTH}>
        <ContextMenuItem testID={`bookmark-rename-${bookmark.id}`} onSelect={handleRename}>
          Rename
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          testID={`bookmark-remove-${bookmark.id}`}
          destructive
          onSelect={handleRemove}
        >
          Remove
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

export function BrowserBookmarksPane({
  serverId,
  workspaceId,
  activeUrl,
  onSwitchBookmark,
}: {
  serverId: string;
  workspaceId: string;
  activeUrl: string | null;
  onSwitchBookmark?: (input: { url: string }) => void;
}) {
  const bookmarksKey = useMemo(
    () => buildWorkspaceBookmarksKey({ serverId, workspaceId }),
    [serverId, workspaceId],
  );
  const bookmarks = useWorkspaceBookmarks(bookmarksKey);
  const renameBookmark = useWorkspaceBookmarksStore((state) => state.renameBookmark);
  const removeBookmark = useWorkspaceBookmarksStore((state) => state.removeBookmark);
  const reorderBookmarks = useWorkspaceBookmarksStore((state) => state.reorderBookmarks);
  const [renaming, setRenaming] = useState<WorkspaceBookmark | null>(null);

  const handleOpen = useCallback(
    (bookmark: WorkspaceBookmark) => onSwitchBookmark?.({ url: bookmark.url }),
    [onSwitchBookmark],
  );

  const handleRemove = useCallback(
    (id: string) => {
      if (bookmarksKey) {
        removeBookmark(bookmarksKey, id);
      }
    },
    [bookmarksKey, removeBookmark],
  );

  const handleRenameSubmit = useCallback(
    (value: string) => {
      if (bookmarksKey && renaming) {
        renameBookmark(bookmarksKey, renaming.id, value);
      }
    },
    [bookmarksKey, renameBookmark, renaming],
  );

  const handleRenameClose = useCallback(() => setRenaming(null), []);

  const handleDragEnd = useCallback(
    (next: WorkspaceBookmark[]) => {
      if (bookmarksKey) {
        reorderBookmarks(
          bookmarksKey,
          next.map((bookmark) => bookmark.id),
        );
      }
    },
    [bookmarksKey, reorderBookmarks],
  );

  const renderRow = useCallback(
    ({ item }: DraggableRenderItemInfo<WorkspaceBookmark>) => (
      <BookmarkRow
        bookmark={item}
        isActive={activeUrl !== null && item.url === activeUrl}
        onOpen={handleOpen}
        onRename={setRenaming}
        onRemove={handleRemove}
      />
    ),
    [activeUrl, handleOpen, handleRemove],
  );

  return (
    <View style={styles.container} testID="browser-bookmarks-pane">
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Bookmarks</Text>
      </View>
      {bookmarks.length === 0 ? (
        <View style={styles.emptyState} testID="browser-bookmarks-empty">
          <Text style={styles.emptyTitle}>No bookmarks yet</Text>
          <Text style={styles.emptySubtitle}>
            Tap the bookmark icon in the browser toolbar to save the current page.
          </Text>
        </View>
      ) : (
        <View style={styles.list}>
          <SortableInlineList
            data={bookmarks}
            keyExtractor={bookmarkKeyExtractor}
            useDragHandle={false}
            disabled={bookmarks.length < 2}
            onDragEnd={handleDragEnd}
            renderItem={renderRow}
          />
        </View>
      )}
      <AdaptiveRenameModal
        visible={renaming !== null}
        title="Rename bookmark"
        initialValue={renaming?.name.trim() || (renaming ? hostnameForUrl(renaming.url) : "")}
        submitLabel="Rename"
        maxLength={120}
        onClose={handleRenameClose}
        onSubmit={handleRenameSubmit}
        testID="bookmark-rename-modal"
      />
    </View>
  );
}

function bookmarkKeyExtractor(bookmark: WorkspaceBookmark) {
  return bookmark.id;
}

const styles = StyleSheet.create((theme) => ({
  container: {
    flex: 1,
    minHeight: 0,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
  },
  headerTitle: {
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.foregroundMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  list: {
    flex: 1,
    minHeight: 0,
    paddingHorizontal: theme.spacing[2],
    paddingBottom: theme.spacing[2],
    gap: theme.spacing[1],
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    borderRadius: theme.borderRadius.md,
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[2],
  },
  rowHovered: {
    backgroundColor: theme.colors.surfaceSidebarHover,
  },
  rowActive: {
    backgroundColor: theme.colors.surfaceSidebarHover,
  },
  favicon: {
    width: 18,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  faviconImage: {
    width: 16,
    height: 16,
    borderRadius: 3,
  },
  nameText: {
    flex: 1,
    minWidth: 0,
    fontSize: theme.fontSize.sm,
    color: theme.colors.foregroundMuted,
  },
  nameTextActive: {
    flex: 1,
    minWidth: 0,
    fontSize: theme.fontSize.sm,
    color: theme.colors.foreground,
    fontWeight: theme.fontWeight.medium,
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing[2],
    paddingHorizontal: theme.spacing[6],
  },
  emptyTitle: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.foreground,
  },
  emptySubtitle: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.foregroundMuted,
    textAlign: "center",
  },
}));
