import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
  applyAddBookmark,
  applyPurgeWorkspaceBookmarks,
  applyRemoveBookmark,
  applyRemoveBookmarkByUrl,
  applyRenameBookmark,
  applyReorderBookmarks,
  buildWorkspaceBookmarksKey,
  migrateLegacyPins,
  sanitizeWorkspaceBookmarksForPersist,
  selectIsUrlBookmarked,
  selectWorkspaceBookmarks,
  type WorkspaceBookmark,
  type WorkspaceBookmarksIndexState,
} from "./state";

export type { WorkspaceBookmark } from "./state";
export {
  buildWorkspaceBookmarksKey,
  selectWorkspaceBookmarks,
  selectIsUrlBookmarked,
} from "./state";

interface WorkspaceBookmarksStoreState extends WorkspaceBookmarksIndexState {
  addBookmark: (
    key: string,
    input: { url: string; name?: string | null; faviconUrl?: string | null },
  ) => void;
  renameBookmark: (key: string, id: string, name: string) => void;
  removeBookmark: (key: string, id: string) => void;
  removeBookmarkByUrl: (key: string, url: string) => void;
  reorderBookmarks: (key: string, ids: string[]) => void;
  purgeWorkspaceBookmarks: (key: string) => void;
}

function createBookmarkId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export const useWorkspaceBookmarksStore = create<WorkspaceBookmarksStoreState>()(
  persist(
    (set) => ({
      bookmarksByWorkspace: {},
      addBookmark: (key, input) => {
        set((state) =>
          applyAddBookmark(state, key, {
            id: createBookmarkId(),
            url: input.url,
            name: input.name,
            faviconUrl: input.faviconUrl,
            now: Date.now(),
          }),
        );
      },
      renameBookmark: (key, id, name) => {
        set((state) => applyRenameBookmark(state, key, id, name));
      },
      removeBookmark: (key, id) => {
        set((state) => applyRemoveBookmark(state, key, id));
      },
      removeBookmarkByUrl: (key, url) => {
        set((state) => applyRemoveBookmarkByUrl(state, key, url));
      },
      reorderBookmarks: (key, ids) => {
        set((state) => applyReorderBookmarks(state, key, ids));
      },
      purgeWorkspaceBookmarks: (key) => {
        set((state) => applyPurgeWorkspaceBookmarks(state, key));
      },
    }),
    {
      // Keep the original persist key so existing local data is migrated in place.
      name: "workspace-pins-store",
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
      migrate: (persisted) => migrateLegacyPins(persisted),
      partialize: (state) => sanitizeWorkspaceBookmarksForPersist(state),
    },
  ),
);

const EMPTY_BOOKMARKS: WorkspaceBookmark[] = [];

export function useWorkspaceBookmarks(key: string | null): WorkspaceBookmark[] {
  return useWorkspaceBookmarksStore((state) =>
    key ? (state.bookmarksByWorkspace[key] ?? EMPTY_BOOKMARKS) : EMPTY_BOOKMARKS,
  );
}

export function useIsUrlBookmarked(key: string | null, url: string): boolean {
  return useWorkspaceBookmarksStore((state) => selectIsUrlBookmarked(state, key, url));
}
