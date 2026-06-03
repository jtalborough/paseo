import { useCallback, useMemo, useState } from "react";
import { Image, Pressable, Text, View } from "react-native";
import { Globe } from "lucide-react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { AdaptiveRenameModal } from "@/components/rename-modal";
import { SortableInlineList } from "@/components/sortable-inline-list";
import type { DraggableRenderItemInfo } from "@/components/draggable-list.types";
import type { Theme } from "@/styles/theme";
import { useBrowserStore } from "@/stores/browser-store";
import { useWorkspaceLayoutStore } from "@/stores/workspace-layout-store";
import {
  buildWorkspaceTabPersistenceKey,
  useWorkspaceTabsStore,
} from "@/stores/workspace-tabs-store";
import {
  buildWorkspacePinsKey,
  useWorkspacePins,
  useWorkspacePinsStore,
  type WorkspacePin,
} from "@/stores/workspace-pins";

const CONTEXT_MENU_WIDTH = 180;

const ThemedGlobe = withUnistyles(Globe);
const mutedColorMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });

function hostnameForUrl(url: string | undefined): string {
  if (!url) {
    return "";
  }
  try {
    return new URL(url).hostname || url;
  } catch {
    return url;
  }
}

function faviconImageSource(uri: string) {
  return { uri };
}

function BookmarkRow({
  pin,
  isActive,
  onResume,
  onReturnHome,
  onRename,
  onRemove,
}: {
  pin: WorkspacePin;
  isActive: boolean;
  onResume: (browserId: string) => void;
  onReturnHome: (pin: WorkspacePin) => void;
  onRename: (pin: WorkspacePin) => void;
  onRemove: (browserId: string) => void;
}) {
  const browser = useBrowserStore((state) => state.browsersById[pin.browserId] ?? null);
  const label = pin.name.trim() || browser?.title?.trim() || hostnameForUrl(pin.url) || "Bookmark";
  const faviconUrl = browser?.faviconUrl ?? null;

  const handleResume = useCallback(() => onResume(pin.browserId), [onResume, pin.browserId]);
  const handleReturnHome = useCallback(() => onReturnHome(pin), [onReturnHome, pin]);
  const handleRename = useCallback(() => onRename(pin), [onRename, pin]);
  const handleRemove = useCallback(() => onRemove(pin.browserId), [onRemove, pin.browserId]);

  const rowStyle = useCallback(
    ({ hovered, pressed }: { hovered?: boolean; pressed?: boolean }) => [
      styles.row,
      isActive && styles.rowActive,
      (hovered || pressed) && !isActive && styles.rowHovered,
    ],
    [isActive],
  );

  const faviconButtonStyle = useCallback(
    ({ hovered, pressed }: { hovered?: boolean; pressed?: boolean }) => [
      styles.faviconButton,
      (hovered || pressed) && styles.faviconButtonHovered,
    ],
    [],
  );

  return (
    <ContextMenu>
      <ContextMenuTrigger
        enabledOnMobile={false}
        style={rowStyle}
        testID={`bookmark-${pin.browserId}`}
      >
        {/* Favicon press → return to the saved page */}
        <Tooltip delayDuration={500} enabledOnDesktop enabledOnMobile={false}>
          <TooltipTrigger asChild triggerRefProp="triggerRef">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Return to saved page: ${label}`}
              onPress={handleReturnHome}
              style={faviconButtonStyle}
              testID={`bookmark-home-${pin.browserId}`}
            >
              {faviconUrl ? (
                <Image
                  accessibilityIgnoresInvertColors
                  source={faviconImageSource(faviconUrl)}
                  style={styles.favicon}
                />
              ) : (
                <ThemedGlobe size={15} uniProps={mutedColorMapping} />
              )}
            </Pressable>
          </TooltipTrigger>
          <TooltipContent side="left" align="center" offset={6}>
            Return to saved page
          </TooltipContent>
        </Tooltip>
        {/* Name press → resume the live session */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Open ${label}`}
          onPress={handleResume}
          style={styles.nameButton}
          testID={`bookmark-open-${pin.browserId}`}
        >
          <Text numberOfLines={1} style={isActive ? styles.nameTextActive : styles.nameText}>
            {label}
          </Text>
        </Pressable>
      </ContextMenuTrigger>
      <ContextMenuContent align="start" width={CONTEXT_MENU_WIDTH}>
        <ContextMenuItem testID={`bookmark-rename-${pin.browserId}`} onSelect={handleRename}>
          Rename
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          testID={`bookmark-remove-${pin.browserId}`}
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
}: {
  serverId: string;
  workspaceId: string;
}) {
  const pinsKey = useMemo(
    () => buildWorkspacePinsKey({ serverId, workspaceId }),
    [serverId, workspaceId],
  );
  const workspaceKey = useMemo(
    () => buildWorkspaceTabPersistenceKey({ serverId, workspaceId }),
    [serverId, workspaceId],
  );
  const pins = useWorkspacePins(pinsKey);
  const renamePin = useWorkspacePinsStore((state) => state.renamePin);
  const removePin = useWorkspacePinsStore((state) => state.removePin);
  const reorderPins = useWorkspacePinsStore((state) => state.reorderPins);
  const openTabFocused = useWorkspaceLayoutStore((state) => state.openTabFocused);
  const focusedTabId = useWorkspaceTabsStore((state) =>
    workspaceKey ? (state.focusedTabIdByWorkspace[workspaceKey] ?? null) : null,
  );
  const [renamingPin, setRenamingPin] = useState<WorkspacePin | null>(null);

  const handleResume = useCallback(
    (browserId: string) => {
      if (workspaceKey) {
        openTabFocused(workspaceKey, { kind: "browser", browserId });
      }
    },
    [openTabFocused, workspaceKey],
  );

  const handleReturnHome = useCallback(
    (pin: WorkspacePin) => {
      if (!workspaceKey) {
        return;
      }
      openTabFocused(workspaceKey, { kind: "browser", browserId: pin.browserId });
      // Point the session home: set both the persisted location (covers a fresh
      // mount) and the one-shot pendingUrl (covers an already-open pane).
      useBrowserStore
        .getState()
        .updateBrowser(pin.browserId, { url: pin.url, pendingUrl: pin.url });
    },
    [openTabFocused, workspaceKey],
  );

  const handleRemove = useCallback(
    (browserId: string) => {
      if (pinsKey) {
        removePin(pinsKey, browserId);
      }
    },
    [pinsKey, removePin],
  );

  const handleRenameSubmit = useCallback(
    (value: string) => {
      if (pinsKey && renamingPin) {
        renamePin(pinsKey, renamingPin.browserId, value);
      }
    },
    [pinsKey, renamePin, renamingPin],
  );

  const handleRenameClose = useCallback(() => setRenamingPin(null), []);

  const handleDragEnd = useCallback(
    (next: WorkspacePin[]) => {
      if (pinsKey) {
        reorderPins(
          pinsKey,
          next.map((pin) => pin.browserId),
        );
      }
    },
    [pinsKey, reorderPins],
  );

  const renderRow = useCallback(
    ({ item }: DraggableRenderItemInfo<WorkspacePin>) => (
      <BookmarkRow
        pin={item}
        isActive={focusedTabId === `browser_${item.browserId}`}
        onResume={handleResume}
        onReturnHome={handleReturnHome}
        onRename={setRenamingPin}
        onRemove={handleRemove}
      />
    ),
    [focusedTabId, handleRemove, handleResume, handleReturnHome],
  );

  if (pins.length === 0) {
    return (
      <View style={styles.emptyState} testID="browser-bookmarks-empty">
        <Text style={styles.emptyTitle}>No bookmarks yet</Text>
        <Text style={styles.emptySubtitle}>
          Open a browser tab and tap the bookmark icon to pin a page here.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.list} testID="browser-bookmarks-pane">
      <SortableInlineList
        data={pins}
        keyExtractor={bookmarkKeyExtractor}
        useDragHandle={false}
        disabled={pins.length < 2}
        onDragEnd={handleDragEnd}
        renderItem={renderRow}
      />
      <AdaptiveRenameModal
        visible={renamingPin !== null}
        title="Rename bookmark"
        initialValue={renamingPin?.name.trim() || ""}
        submitLabel="Rename"
        maxLength={120}
        onClose={handleRenameClose}
        onSubmit={handleRenameSubmit}
        testID="bookmark-rename-modal"
      />
    </View>
  );
}

function bookmarkKeyExtractor(pin: WorkspacePin) {
  return pin.browserId;
}

const styles = StyleSheet.create((theme) => ({
  list: {
    flex: 1,
    minHeight: 0,
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[2],
    gap: theme.spacing[1],
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    borderRadius: theme.borderRadius.md,
    paddingRight: theme.spacing[2],
  },
  rowHovered: {
    backgroundColor: theme.colors.surfaceSidebarHover,
  },
  rowActive: {
    backgroundColor: theme.colors.surfaceSidebarHover,
  },
  faviconButton: {
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.borderRadius.md,
  },
  faviconButtonHovered: {
    backgroundColor: theme.colors.surface2,
  },
  favicon: {
    width: 16,
    height: 16,
    borderRadius: 3,
  },
  nameButton: {
    flex: 1,
    minWidth: 0,
    paddingVertical: theme.spacing[2],
  },
  nameText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.foregroundMuted,
  },
  nameTextActive: {
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
