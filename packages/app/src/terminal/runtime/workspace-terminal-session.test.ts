import { describe, expect, it } from "vitest";

import {
  getWorkspaceTerminalSession,
  releaseWorkspaceTerminalSession,
  retainWorkspaceTerminalSession,
} from "./workspace-terminal-session";

describe("workspace-terminal-session", () => {
  it("returns the same workspace session instance for the same scope", () => {
    const first = getWorkspaceTerminalSession({
      scopeKey: "workspace-a",
    });
    const second = getWorkspaceTerminalSession({
      scopeKey: "workspace-a",
    });

    expect(second).toBe(first);
  });

  it("preserves snapshots across repeated lookups", () => {
    const first = getWorkspaceTerminalSession({
      scopeKey: "workspace-snapshots",
    });
    first.snapshots.set({
      terminalId: "term-1",
      state: {
        rows: 1,
        cols: 1,
        grid: [[{ char: "A" }]],
        scrollback: [],
        cursor: { row: 0, col: 0 },
      },
    });

    const second = getWorkspaceTerminalSession({
      scopeKey: "workspace-snapshots",
    });

    expect(second.snapshots.get({ terminalId: "term-1" })).toEqual({
      rows: 1,
      cols: 1,
      grid: [[{ char: "A" }]],
      scrollback: [],
      cursor: { row: 0, col: 0 },
    });
  });

  it("evicts workspace terminal session state when the retain count returns to zero", () => {
    const scopeKey = "workspace-release";
    const first = getWorkspaceTerminalSession({
      scopeKey,
    });
    first.snapshots.set({
      terminalId: "term-1",
      state: {
        rows: 1,
        cols: 1,
        grid: [[{ char: "A" }]],
        scrollback: [],
        cursor: { row: 0, col: 0 },
      },
    });

    retainWorkspaceTerminalSession({ scopeKey });
    releaseWorkspaceTerminalSession({ scopeKey });

    const second = getWorkspaceTerminalSession({
      scopeKey,
    });

    expect(second).not.toBe(first);
    expect(second.snapshots.get({ terminalId: "term-1" })).toBeNull();
  });

  it("notifies clear subscribers for the matching terminal only", () => {
    const session = getWorkspaceTerminalSession({
      scopeKey: "workspace-clear-controls",
    });
    const termOneClearEvents: string[] = [];
    const termTwoClearEvents: string[] = [];

    const unsubscribeTermOne = session.controls.subscribeClear({
      terminalId: "term-1",
      listener: () => {
        termOneClearEvents.push("clear");
      },
    });
    session.controls.subscribeClear({
      terminalId: "term-2",
      listener: () => {
        termTwoClearEvents.push("clear");
      },
    });

    session.controls.requestClear({ terminalId: "term-1" });
    unsubscribeTermOne();
    session.controls.requestClear({ terminalId: "term-1" });
    session.controls.requestClear({ terminalId: "term-2" });

    expect(termOneClearEvents).toEqual(["clear"]);
    expect(termTwoClearEvents).toEqual(["clear"]);
  });
});
