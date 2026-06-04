// Per-workspace URL bookmarks (classic browser bookmarks). A bookmark stores a
// url + display name + a snapshot favicon; it is NOT tied to a live browser
// session. Bookmarking the current page adds one (deduped by url); clicking a
// bookmark navigates the focused browser tab to its url.

export interface WorkspaceBookmark {
  id: string;
  url: string;
  name: string;
  faviconUrl: string | null;
  createdAt: number;
}

export interface WorkspaceBookmarksIndexState {
  bookmarksByWorkspace: Record<string, WorkspaceBookmark[]>;
}

export function trimNonEmpty(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function buildWorkspaceBookmarksKey(input: {
  serverId: string;
  workspaceId: string;
}): string | null {
  const serverId = trimNonEmpty(input.serverId);
  const workspaceId = trimNonEmpty(input.workspaceId);
  if (!serverId || !workspaceId) {
    return null;
  }
  return `${serverId}:${workspaceId}`;
}

function normalizeName(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeUrl(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

export interface AddBookmarkInput {
  id: string;
  url: string;
  name?: string | null;
  faviconUrl?: string | null;
  now: number;
}

export function applyAddBookmark<S extends WorkspaceBookmarksIndexState>(
  state: S,
  key: string,
  input: AddBookmarkInput,
): S {
  const normalizedKey = trimNonEmpty(key);
  const id = trimNonEmpty(input.id);
  const url = normalizeUrl(input.url);
  if (!normalizedKey || !id || !url) {
    return state;
  }
  const current = state.bookmarksByWorkspace[normalizedKey] ?? [];
  // Deduplicate by url so the star toggle is idempotent.
  if (current.some((bookmark) => bookmark.url === url)) {
    return state;
  }
  const next = [
    ...current,
    {
      id,
      url,
      name: normalizeName(input.name),
      faviconUrl: trimNonEmpty(input.faviconUrl) ?? null,
      createdAt: input.now,
    },
  ];
  return {
    ...state,
    bookmarksByWorkspace: { ...state.bookmarksByWorkspace, [normalizedKey]: next },
  };
}

export function applyRenameBookmark<S extends WorkspaceBookmarksIndexState>(
  state: S,
  key: string,
  id: string,
  name: string,
): S {
  const normalizedKey = trimNonEmpty(key);
  const normalizedId = trimNonEmpty(id);
  if (!normalizedKey || !normalizedId) {
    return state;
  }
  const current = state.bookmarksByWorkspace[normalizedKey];
  if (!current) {
    return state;
  }
  const nextName = normalizeName(name);
  let changed = false;
  const next = current.map((bookmark) => {
    if (bookmark.id !== normalizedId || bookmark.name === nextName) {
      return bookmark;
    }
    changed = true;
    return Object.assign({}, bookmark, { name: nextName });
  });
  if (!changed) {
    return state;
  }
  return {
    ...state,
    bookmarksByWorkspace: { ...state.bookmarksByWorkspace, [normalizedKey]: next },
  };
}

function removeBookmarkWhere<S extends WorkspaceBookmarksIndexState>(
  state: S,
  key: string,
  predicate: (bookmark: WorkspaceBookmark) => boolean,
): S {
  const normalizedKey = trimNonEmpty(key);
  if (!normalizedKey) {
    return state;
  }
  const current = state.bookmarksByWorkspace[normalizedKey];
  if (!current) {
    return state;
  }
  const next = current.filter((bookmark) => !predicate(bookmark));
  if (next.length === current.length) {
    return state;
  }
  if (next.length === 0) {
    const { [normalizedKey]: _removed, ...rest } = state.bookmarksByWorkspace;
    return { ...state, bookmarksByWorkspace: rest };
  }
  return {
    ...state,
    bookmarksByWorkspace: { ...state.bookmarksByWorkspace, [normalizedKey]: next },
  };
}

export function applyRemoveBookmark<S extends WorkspaceBookmarksIndexState>(
  state: S,
  key: string,
  id: string,
): S {
  const normalizedId = trimNonEmpty(id);
  if (!normalizedId) {
    return state;
  }
  return removeBookmarkWhere(state, key, (bookmark) => bookmark.id === normalizedId);
}

export function applyRemoveBookmarkByUrl<S extends WorkspaceBookmarksIndexState>(
  state: S,
  key: string,
  url: string,
): S {
  const normalizedUrl = normalizeUrl(url);
  if (!normalizedUrl) {
    return state;
  }
  return removeBookmarkWhere(state, key, (bookmark) => bookmark.url === normalizedUrl);
}

export function applyReorderBookmarks<S extends WorkspaceBookmarksIndexState>(
  state: S,
  key: string,
  ids: string[],
): S {
  const normalizedKey = trimNonEmpty(key);
  if (!normalizedKey) {
    return state;
  }
  const current = state.bookmarksByWorkspace[normalizedKey];
  if (!current || current.length < 2) {
    return state;
  }
  const byId = new Map(current.map((bookmark) => [bookmark.id, bookmark]));
  const next: WorkspaceBookmark[] = [];
  const used = new Set<string>();
  for (const rawId of ids) {
    const id = trimNonEmpty(rawId);
    if (!id || used.has(id)) {
      continue;
    }
    const bookmark = byId.get(id);
    if (bookmark) {
      next.push(bookmark);
      used.add(id);
    }
  }
  for (const bookmark of current) {
    if (!used.has(bookmark.id)) {
      next.push(bookmark);
    }
  }
  const unchanged = next.every((bookmark, index) => bookmark === current[index]);
  if (unchanged) {
    return state;
  }
  return {
    ...state,
    bookmarksByWorkspace: { ...state.bookmarksByWorkspace, [normalizedKey]: next },
  };
}

export function applyPurgeWorkspaceBookmarks<S extends WorkspaceBookmarksIndexState>(
  state: S,
  key: string,
): S {
  const normalizedKey = trimNonEmpty(key);
  if (!normalizedKey || !(normalizedKey in state.bookmarksByWorkspace)) {
    return state;
  }
  const { [normalizedKey]: _removed, ...rest } = state.bookmarksByWorkspace;
  return { ...state, bookmarksByWorkspace: rest };
}

export function selectWorkspaceBookmarks(
  state: WorkspaceBookmarksIndexState,
  key: string | null,
): WorkspaceBookmark[] {
  const normalizedKey = trimNonEmpty(key ?? null);
  if (!normalizedKey) {
    return [];
  }
  return state.bookmarksByWorkspace[normalizedKey] ?? [];
}

export function selectIsUrlBookmarked(
  state: WorkspaceBookmarksIndexState,
  key: string | null,
  url: string,
): boolean {
  const normalizedUrl = normalizeUrl(url);
  if (!normalizedUrl) {
    return false;
  }
  return selectWorkspaceBookmarks(state, key).some((bookmark) => bookmark.url === normalizedUrl);
}

export function sanitizeWorkspaceBookmarksForPersist(
  state: WorkspaceBookmarksIndexState,
): WorkspaceBookmarksIndexState {
  const bookmarksByWorkspace: Record<string, WorkspaceBookmark[]> = {};
  for (const key in state.bookmarksByWorkspace) {
    const bookmarks = (state.bookmarksByWorkspace[key] ?? [])
      .map((bookmark) => {
        const id = trimNonEmpty(bookmark.id);
        const url = normalizeUrl(bookmark.url);
        if (!id || !url) {
          return null;
        }
        return {
          id,
          url,
          name: normalizeName(bookmark.name),
          faviconUrl: trimNonEmpty(bookmark.faviconUrl) ?? null,
          createdAt: typeof bookmark.createdAt === "number" ? bookmark.createdAt : 0,
        } satisfies WorkspaceBookmark;
      })
      .filter((bookmark): bookmark is WorkspaceBookmark => bookmark !== null);
    if (bookmarks.length > 0) {
      bookmarksByWorkspace[key] = bookmarks;
    }
  }
  return { bookmarksByWorkspace };
}

// Convert the legacy session-backed pin shape ({ browserId, url, name }) to the
// URL-based bookmark shape so previously saved bookmarks survive the change.
export function migrateLegacyPins(persisted: unknown): WorkspaceBookmarksIndexState {
  const empty: WorkspaceBookmarksIndexState = { bookmarksByWorkspace: {} };
  if (!persisted || typeof persisted !== "object") {
    return empty;
  }
  const record = persisted as {
    bookmarksByWorkspace?: unknown;
    pinsByWorkspace?: unknown;
  };
  const directBookmarks = record.bookmarksByWorkspace;
  if (directBookmarks && typeof directBookmarks === "object") {
    return sanitizeWorkspaceBookmarksForPersist({
      bookmarksByWorkspace: directBookmarks as Record<string, WorkspaceBookmark[]>,
    });
  }
  const legacyPins = record.pinsByWorkspace;
  if (!legacyPins || typeof legacyPins !== "object") {
    return empty;
  }
  const bookmarksByWorkspace: Record<string, WorkspaceBookmark[]> = {};
  for (const key in legacyPins as Record<string, unknown>) {
    const list = (legacyPins as Record<string, unknown>)[key];
    if (!Array.isArray(list)) {
      continue;
    }
    const bookmarks: WorkspaceBookmark[] = [];
    const seenUrls = new Set<string>();
    for (const raw of list) {
      if (!raw || typeof raw !== "object") {
        continue;
      }
      const pin = raw as {
        browserId?: unknown;
        url?: unknown;
        name?: unknown;
        createdAt?: unknown;
      };
      const url = normalizeUrl(typeof pin.url === "string" ? pin.url : "");
      const id = trimNonEmpty(typeof pin.browserId === "string" ? pin.browserId : null);
      if (!url || !id || seenUrls.has(url)) {
        continue;
      }
      seenUrls.add(url);
      bookmarks.push({
        id,
        url,
        name: normalizeName(typeof pin.name === "string" ? pin.name : ""),
        faviconUrl: null,
        createdAt: typeof pin.createdAt === "number" ? pin.createdAt : 0,
      });
    }
    if (bookmarks.length > 0) {
      bookmarksByWorkspace[key] = bookmarks;
    }
  }
  return { bookmarksByWorkspace };
}
