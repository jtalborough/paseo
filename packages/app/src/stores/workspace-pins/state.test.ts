import { describe, expect, it } from "vitest";
import {
  applyAddPin,
  applyPurgeWorkspacePins,
  applyRemovePin,
  applyRenamePin,
  applyReorderPins,
  buildWorkspacePinsKey,
  selectIsBrowserPinned,
  selectWorkspacePins,
  sanitizeWorkspacePinsForPersist,
  type WorkspacePinsIndexState,
} from "./state";

const KEY = "server-1:workspace-1";

function withPins(
  pins: Array<{ browserId: string; url?: string; name?: string; createdAt?: number }>,
) {
  return {
    pinsByWorkspace: {
      [KEY]: pins.map((pin) => ({
        browserId: pin.browserId,
        url: pin.url ?? "https://example.com",
        name: pin.name ?? "",
        createdAt: pin.createdAt ?? 0,
      })),
    },
  } satisfies WorkspacePinsIndexState;
}

describe("buildWorkspacePinsKey", () => {
  it("joins server and workspace ids", () => {
    expect(buildWorkspacePinsKey({ serverId: "s", workspaceId: "w" })).toBe("s:w");
  });

  it("returns null when either id is blank", () => {
    expect(buildWorkspacePinsKey({ serverId: "  ", workspaceId: "w" })).toBeNull();
    expect(buildWorkspacePinsKey({ serverId: "s", workspaceId: "" })).toBeNull();
  });
});

describe("applyAddPin", () => {
  it("appends a pin with a trimmed name", () => {
    const next = applyAddPin({ pinsByWorkspace: {} }, KEY, {
      browserId: "b1",
      url: "https://docs.test",
      name: "  Docs  ",
      now: 5,
    });
    expect(selectWorkspacePins(next, KEY)).toEqual([
      { browserId: "b1", url: "https://docs.test", name: "Docs", createdAt: 5 },
    ]);
  });

  it("is idempotent for an already-pinned browser", () => {
    const initial = withPins([{ browserId: "b1", name: "Docs" }]);
    expect(
      applyAddPin(initial, KEY, { browserId: "b1", url: "https://x.test", name: "Other", now: 9 }),
    ).toBe(initial);
  });

  it("ignores blank ids", () => {
    const initial = withPins([{ browserId: "b1" }]);
    expect(applyAddPin(initial, KEY, { browserId: "   ", url: "https://x.test", now: 1 })).toBe(
      initial,
    );
    expect(applyAddPin(initial, "  ", { browserId: "b2", url: "https://x.test", now: 1 })).toBe(
      initial,
    );
  });
});

describe("applyRenamePin", () => {
  it("updates the name", () => {
    const initial = withPins([{ browserId: "b1", name: "Old" }]);
    const next = applyRenamePin(initial, KEY, "b1", "  New  ");
    expect(selectWorkspacePins(next, KEY)[0]?.name).toBe("New");
  });

  it("returns same state when name is unchanged", () => {
    const initial = withPins([{ browserId: "b1", name: "Same" }]);
    expect(applyRenamePin(initial, KEY, "b1", "Same")).toBe(initial);
  });

  it("returns same state for unknown browser", () => {
    const initial = withPins([{ browserId: "b1", name: "x" }]);
    expect(applyRenamePin(initial, KEY, "missing", "y")).toBe(initial);
  });
});

describe("applyRemovePin", () => {
  it("removes the pin", () => {
    const initial = withPins([{ browserId: "b1" }, { browserId: "b2" }]);
    const next = applyRemovePin(initial, KEY, "b1");
    expect(selectWorkspacePins(next, KEY).map((p) => p.browserId)).toEqual(["b2"]);
  });

  it("drops the workspace key when last pin is removed", () => {
    const initial = withPins([{ browserId: "b1" }]);
    const next = applyRemovePin(initial, KEY, "b1");
    expect(KEY in next.pinsByWorkspace).toBe(false);
  });

  it("returns same state for unknown browser", () => {
    const initial = withPins([{ browserId: "b1" }]);
    expect(applyRemovePin(initial, KEY, "missing")).toBe(initial);
  });
});

describe("applyReorderPins", () => {
  it("reorders by the provided id order", () => {
    const initial = withPins([{ browserId: "a" }, { browserId: "b" }, { browserId: "c" }]);
    const next = applyReorderPins(initial, KEY, ["c", "a", "b"]);
    expect(selectWorkspacePins(next, KEY).map((p) => p.browserId)).toEqual(["c", "a", "b"]);
  });

  it("appends omitted pins preserving their order", () => {
    const initial = withPins([{ browserId: "a" }, { browserId: "b" }, { browserId: "c" }]);
    const next = applyReorderPins(initial, KEY, ["c"]);
    expect(selectWorkspacePins(next, KEY).map((p) => p.browserId)).toEqual(["c", "a", "b"]);
  });

  it("returns same state when order is unchanged", () => {
    const initial = withPins([{ browserId: "a" }, { browserId: "b" }]);
    expect(applyReorderPins(initial, KEY, ["a", "b"])).toBe(initial);
  });
});

describe("applyPurgeWorkspacePins", () => {
  it("removes all pins for the workspace", () => {
    const initial = withPins([{ browserId: "a" }]);
    const next = applyPurgeWorkspacePins(initial, KEY);
    expect(next.pinsByWorkspace).toEqual({});
  });

  it("returns same state for an unknown workspace", () => {
    const initial = withPins([{ browserId: "a" }]);
    expect(applyPurgeWorkspacePins(initial, "other:ws")).toBe(initial);
  });
});

describe("selectIsBrowserPinned", () => {
  it("reports membership", () => {
    const initial = withPins([{ browserId: "a" }]);
    expect(selectIsBrowserPinned(initial, KEY, "a")).toBe(true);
    expect(selectIsBrowserPinned(initial, KEY, "b")).toBe(false);
    expect(selectIsBrowserPinned(initial, null, "a")).toBe(false);
  });
});

describe("sanitizeWorkspacePinsForPersist", () => {
  it("drops blank ids and normalizes fields", () => {
    const state: WorkspacePinsIndexState = {
      pinsByWorkspace: {
        [KEY]: [
          { browserId: "a", url: "https://a.test", name: "  A  ", createdAt: 3 },
          { browserId: "   ", url: "https://bad.test", name: "bad", createdAt: 1 },
        ],
      },
    };
    const next = sanitizeWorkspacePinsForPersist(state);
    expect(next.pinsByWorkspace[KEY]).toEqual([
      { browserId: "a", url: "https://a.test", name: "A", createdAt: 3 },
    ]);
  });
});
