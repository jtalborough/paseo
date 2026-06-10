import type { TerminalState } from "@getpaseo/protocol/messages";

export interface WorkspaceTerminalSnapshots {
  get: (input: { terminalId: string }) => TerminalState | null;
  set: (input: { terminalId: string; state: TerminalState }) => void;
  clear: (input: { terminalId: string }) => void;
  prune: (input: { terminalIds: string[] }) => void;
}

export interface WorkspaceTerminalControls {
  requestClear: (input: { terminalId: string }) => void;
  subscribeClear: (input: { terminalId: string; listener: () => void }) => () => void;
}

export interface WorkspaceTerminalSession {
  scopeKey: string;
  snapshots: WorkspaceTerminalSnapshots;
  controls: WorkspaceTerminalControls;
}

interface WorkspaceTerminalSessionRecord {
  snapshotByTerminalId: Map<string, TerminalState>;
  clearListenersByTerminalId: Map<string, Set<() => void>>;
  session: WorkspaceTerminalSession;
}

const sessionsByScopeKey = new Map<string, WorkspaceTerminalSessionRecord>();
const refCountByScopeKey = new Map<string, number>();

function createSnapshots(input: {
  snapshotByTerminalId: Map<string, TerminalState>;
}): WorkspaceTerminalSnapshots {
  return {
    get: ({ terminalId }) => input.snapshotByTerminalId.get(terminalId) ?? null,
    set: ({ terminalId, state }) => {
      input.snapshotByTerminalId.set(terminalId, state);
    },
    clear: ({ terminalId }) => {
      input.snapshotByTerminalId.delete(terminalId);
    },
    prune: ({ terminalIds }) => {
      const terminalIdSet = new Set(terminalIds);
      for (const terminalId of Array.from(input.snapshotByTerminalId.keys())) {
        if (!terminalIdSet.has(terminalId)) {
          input.snapshotByTerminalId.delete(terminalId);
        }
      }
    },
  };
}

function createControls(input: {
  clearListenersByTerminalId: Map<string, Set<() => void>>;
}): WorkspaceTerminalControls {
  return {
    requestClear: ({ terminalId }) => {
      const listeners = input.clearListenersByTerminalId.get(terminalId);
      if (!listeners) {
        return;
      }
      for (const listener of Array.from(listeners)) {
        listener();
      }
    },
    subscribeClear: ({ terminalId, listener }) => {
      const listeners = input.clearListenersByTerminalId.get(terminalId) ?? new Set<() => void>();
      listeners.add(listener);
      input.clearListenersByTerminalId.set(terminalId, listeners);
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
          input.clearListenersByTerminalId.delete(terminalId);
        }
      };
    },
  };
}

export function getWorkspaceTerminalSession(input: { scopeKey: string }): WorkspaceTerminalSession {
  const existing = sessionsByScopeKey.get(input.scopeKey);
  if (existing) {
    return existing.session;
  }

  const snapshotByTerminalId = new Map<string, TerminalState>();
  const clearListenersByTerminalId = new Map<string, Set<() => void>>();
  const session: WorkspaceTerminalSession = {
    scopeKey: input.scopeKey,
    snapshots: createSnapshots({
      snapshotByTerminalId,
    }),
    controls: createControls({
      clearListenersByTerminalId,
    }),
  };

  sessionsByScopeKey.set(input.scopeKey, {
    snapshotByTerminalId,
    clearListenersByTerminalId,
    session,
  });
  return session;
}

export function retainWorkspaceTerminalSession(input: { scopeKey: string }): void {
  const current = refCountByScopeKey.get(input.scopeKey) ?? 0;
  refCountByScopeKey.set(input.scopeKey, current + 1);
}

export function releaseWorkspaceTerminalSession(input: { scopeKey: string }): void {
  const current = refCountByScopeKey.get(input.scopeKey) ?? 0;
  if (current > 1) {
    refCountByScopeKey.set(input.scopeKey, current - 1);
    return;
  }
  refCountByScopeKey.delete(input.scopeKey);
  sessionsByScopeKey.delete(input.scopeKey);
}
