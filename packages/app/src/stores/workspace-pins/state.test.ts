import { describe, expect, it } from "vitest";
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
  type WorkspaceBookmarksIndexState,
} from "./state";

const KEY = "server-1:workspace-1";

function withBookmarks(
  bookmarks: Array<{ id: string; url?: string; name?: string; faviconUrl?: string | null }>,
) {
  return {
    bookmarksByWorkspace: {
      [KEY]: bookmarks.map((bookmark, index) => ({
        id: bookmark.id,
        url: bookmark.url ?? `https://example.com/${index}`,
        name: bookmark.name ?? "",
        faviconUrl: bookmark.faviconUrl ?? null,
        createdAt: 0,
      })),
    },
  } satisfies WorkspaceBookmarksIndexState;
}

describe("buildWorkspaceBookmarksKey", () => {
  it("joins server and workspace ids", () => {
    expect(buildWorkspaceBookmarksKey({ serverId: "s", workspaceId: "w" })).toBe("s:w");
  });

  it("returns null when either id is blank", () => {
    expect(buildWorkspaceBookmarksKey({ serverId: "  ", workspaceId: "w" })).toBeNull();
  });
});

describe("applyAddBookmark", () => {
  it("appends a bookmark with trimmed fields", () => {
    const next = applyAddBookmark({ bookmarksByWorkspace: {} }, KEY, {
      id: "b1",
      url: "https://docs.test",
      name: "  Docs  ",
      faviconUrl: "https://docs.test/favicon.ico",
      now: 5,
    });
    expect(selectWorkspaceBookmarks(next, KEY)).toEqual([
      {
        id: "b1",
        url: "https://docs.test",
        name: "Docs",
        faviconUrl: "https://docs.test/favicon.ico",
        createdAt: 5,
      },
    ]);
  });

  it("deduplicates by url", () => {
    const initial = withBookmarks([{ id: "b1", url: "https://docs.test" }]);
    expect(applyAddBookmark(initial, KEY, { id: "b2", url: "https://docs.test", now: 9 })).toBe(
      initial,
    );
  });

  it("ignores blank id or url", () => {
    const initial = withBookmarks([{ id: "b1" }]);
    expect(applyAddBookmark(initial, KEY, { id: "  ", url: "https://x.test", now: 1 })).toBe(
      initial,
    );
    expect(applyAddBookmark(initial, KEY, { id: "b2", url: "   ", now: 1 })).toBe(initial);
  });
});

describe("applyRenameBookmark", () => {
  it("updates the name", () => {
    const initial = withBookmarks([{ id: "b1", name: "Old" }]);
    const next = applyRenameBookmark(initial, KEY, "b1", "  New  ");
    expect(selectWorkspaceBookmarks(next, KEY)[0]?.name).toBe("New");
  });

  it("returns same state when unchanged", () => {
    const initial = withBookmarks([{ id: "b1", name: "Same" }]);
    expect(applyRenameBookmark(initial, KEY, "b1", "Same")).toBe(initial);
  });
});

describe("applyRemoveBookmark", () => {
  it("removes by id", () => {
    const initial = withBookmarks([{ id: "b1" }, { id: "b2" }]);
    const next = applyRemoveBookmark(initial, KEY, "b1");
    expect(selectWorkspaceBookmarks(next, KEY).map((b) => b.id)).toEqual(["b2"]);
  });

  it("drops the workspace key when last is removed", () => {
    const initial = withBookmarks([{ id: "b1" }]);
    const next = applyRemoveBookmark(initial, KEY, "b1");
    expect(KEY in next.bookmarksByWorkspace).toBe(false);
  });
});

describe("applyRemoveBookmarkByUrl", () => {
  it("removes by url", () => {
    const initial = withBookmarks([
      { id: "b1", url: "https://a.test" },
      { id: "b2", url: "https://b.test" },
    ]);
    const next = applyRemoveBookmarkByUrl(initial, KEY, "https://a.test");
    expect(selectWorkspaceBookmarks(next, KEY).map((b) => b.id)).toEqual(["b2"]);
  });
});

describe("applyReorderBookmarks", () => {
  it("reorders by the provided id order", () => {
    const initial = withBookmarks([{ id: "a" }, { id: "b" }, { id: "c" }]);
    const next = applyReorderBookmarks(initial, KEY, ["c", "a", "b"]);
    expect(selectWorkspaceBookmarks(next, KEY).map((b) => b.id)).toEqual(["c", "a", "b"]);
  });

  it("appends omitted ids preserving order", () => {
    const initial = withBookmarks([{ id: "a" }, { id: "b" }, { id: "c" }]);
    const next = applyReorderBookmarks(initial, KEY, ["c"]);
    expect(selectWorkspaceBookmarks(next, KEY).map((b) => b.id)).toEqual(["c", "a", "b"]);
  });
});

describe("selectIsUrlBookmarked", () => {
  it("reports membership by url", () => {
    const initial = withBookmarks([{ id: "b1", url: "https://a.test" }]);
    expect(selectIsUrlBookmarked(initial, KEY, "https://a.test")).toBe(true);
    expect(selectIsUrlBookmarked(initial, KEY, "https://b.test")).toBe(false);
    expect(selectIsUrlBookmarked(initial, null, "https://a.test")).toBe(false);
  });
});

describe("applyPurgeWorkspaceBookmarks", () => {
  it("removes all bookmarks for the workspace", () => {
    const initial = withBookmarks([{ id: "a" }]);
    expect(applyPurgeWorkspaceBookmarks(initial, KEY).bookmarksByWorkspace).toEqual({});
  });
});

describe("sanitizeWorkspaceBookmarksForPersist", () => {
  it("drops entries missing id or url", () => {
    const state: WorkspaceBookmarksIndexState = {
      bookmarksByWorkspace: {
        [KEY]: [
          { id: "a", url: "https://a.test", name: "  A  ", faviconUrl: "  ", createdAt: 3 },
          { id: "   ", url: "https://bad.test", name: "bad", faviconUrl: null, createdAt: 1 },
        ],
      },
    };
    const next = sanitizeWorkspaceBookmarksForPersist(state);
    expect(next.bookmarksByWorkspace[KEY]).toEqual([
      { id: "a", url: "https://a.test", name: "A", faviconUrl: null, createdAt: 3 },
    ]);
  });
});

describe("migrateLegacyPins", () => {
  it("converts legacy browserId pins to url bookmarks", () => {
    const legacy = {
      pinsByWorkspace: {
        [KEY]: [
          { browserId: "br1", url: "https://a.test", name: "A", createdAt: 2 },
          { browserId: "br2", url: "https://a.test", name: "dup", createdAt: 3 },
          { browserId: "br3", url: "https://b.test", name: "B", createdAt: 4 },
        ],
      },
    };
    const next = migrateLegacyPins(legacy);
    expect(next.bookmarksByWorkspace[KEY]).toEqual([
      { id: "br1", url: "https://a.test", name: "A", faviconUrl: null, createdAt: 2 },
      { id: "br3", url: "https://b.test", name: "B", faviconUrl: null, createdAt: 4 },
    ]);
  });

  it("passes through already-migrated bookmark shape", () => {
    const next = migrateLegacyPins({
      bookmarksByWorkspace: {
        [KEY]: [{ id: "b1", url: "https://a.test", name: "A", faviconUrl: null, createdAt: 1 }],
      },
    });
    expect(next.bookmarksByWorkspace[KEY]?.[0]?.id).toBe("b1");
  });

  it("returns empty for unknown shapes", () => {
    expect(migrateLegacyPins(null).bookmarksByWorkspace).toEqual({});
    expect(migrateLegacyPins({ foo: 1 }).bookmarksByWorkspace).toEqual({});
  });
});
