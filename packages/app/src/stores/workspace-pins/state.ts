// Per-workspace pinned browser sessions (Arc-style). A pin references a live
// BrowserRecord by id; the pin owns that session and survives tab close. The
// `name` is a user-set label, independent of the page <title>; an empty name
// falls back to the page title / hostname at render time.

export interface WorkspacePin {
  browserId: string;
  // The saved "home" URL — clicking a bookmark's favicon returns the live
  // session here regardless of where it surfed. Distinct from the session's
  // current location (which lives on the BrowserRecord).
  url: string;
  name: string;
  createdAt: number;
}

export interface WorkspacePinsIndexState {
  pinsByWorkspace: Record<string, WorkspacePin[]>;
}

export function trimNonEmpty(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function buildWorkspacePinsKey(input: {
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

function normalizePinName(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

export interface AddPinInput {
  browserId: string;
  url: string;
  name?: string | null;
  now: number;
}

export function applyAddPin<S extends WorkspacePinsIndexState>(
  state: S,
  key: string,
  input: AddPinInput,
): S {
  const normalizedKey = trimNonEmpty(key);
  const browserId = trimNonEmpty(input.browserId);
  if (!normalizedKey || !browserId) {
    return state;
  }
  const current = state.pinsByWorkspace[normalizedKey] ?? [];
  if (current.some((pin) => pin.browserId === browserId)) {
    return state;
  }
  const next = [
    ...current,
    {
      browserId,
      url: typeof input.url === "string" ? input.url : "",
      name: normalizePinName(input.name),
      createdAt: input.now,
    },
  ];
  return {
    ...state,
    pinsByWorkspace: { ...state.pinsByWorkspace, [normalizedKey]: next },
  };
}

export function applyRenamePin<S extends WorkspacePinsIndexState>(
  state: S,
  key: string,
  browserId: string,
  name: string,
): S {
  const normalizedKey = trimNonEmpty(key);
  const normalizedBrowserId = trimNonEmpty(browserId);
  if (!normalizedKey || !normalizedBrowserId) {
    return state;
  }
  const current = state.pinsByWorkspace[normalizedKey];
  if (!current) {
    return state;
  }
  const nextName = normalizePinName(name);
  let changed = false;
  const next = current.map((pin) => {
    if (pin.browserId !== normalizedBrowserId || pin.name === nextName) {
      return pin;
    }
    changed = true;
    return Object.assign({}, pin, { name: nextName });
  });
  if (!changed) {
    return state;
  }
  return {
    ...state,
    pinsByWorkspace: { ...state.pinsByWorkspace, [normalizedKey]: next },
  };
}

export function applyRemovePin<S extends WorkspacePinsIndexState>(
  state: S,
  key: string,
  browserId: string,
): S {
  const normalizedKey = trimNonEmpty(key);
  const normalizedBrowserId = trimNonEmpty(browserId);
  if (!normalizedKey || !normalizedBrowserId) {
    return state;
  }
  const current = state.pinsByWorkspace[normalizedKey];
  if (!current) {
    return state;
  }
  const next = current.filter((pin) => pin.browserId !== normalizedBrowserId);
  if (next.length === current.length) {
    return state;
  }
  if (next.length === 0) {
    const { [normalizedKey]: _removed, ...rest } = state.pinsByWorkspace;
    return { ...state, pinsByWorkspace: rest };
  }
  return {
    ...state,
    pinsByWorkspace: { ...state.pinsByWorkspace, [normalizedKey]: next },
  };
}

export function applyReorderPins<S extends WorkspacePinsIndexState>(
  state: S,
  key: string,
  browserIds: string[],
): S {
  const normalizedKey = trimNonEmpty(key);
  if (!normalizedKey) {
    return state;
  }
  const current = state.pinsByWorkspace[normalizedKey];
  if (!current || current.length < 2) {
    return state;
  }
  const byId = new Map(current.map((pin) => [pin.browserId, pin]));
  const next: WorkspacePin[] = [];
  const used = new Set<string>();
  for (const rawId of browserIds) {
    const browserId = trimNonEmpty(rawId);
    if (!browserId || used.has(browserId)) {
      continue;
    }
    const pin = byId.get(browserId);
    if (pin) {
      next.push(pin);
      used.add(browserId);
    }
  }
  // Preserve any pins the caller omitted, keeping their relative order.
  for (const pin of current) {
    if (!used.has(pin.browserId)) {
      next.push(pin);
    }
  }
  const unchanged = next.every((pin, index) => pin === current[index]);
  if (unchanged) {
    return state;
  }
  return {
    ...state,
    pinsByWorkspace: { ...state.pinsByWorkspace, [normalizedKey]: next },
  };
}

export function applyPurgeWorkspacePins<S extends WorkspacePinsIndexState>(
  state: S,
  key: string,
): S {
  const normalizedKey = trimNonEmpty(key);
  if (!normalizedKey || !(normalizedKey in state.pinsByWorkspace)) {
    return state;
  }
  const { [normalizedKey]: _removed, ...rest } = state.pinsByWorkspace;
  return { ...state, pinsByWorkspace: rest };
}

export function selectWorkspacePins(
  state: WorkspacePinsIndexState,
  key: string | null,
): WorkspacePin[] {
  const normalizedKey = trimNonEmpty(key ?? null);
  if (!normalizedKey) {
    return [];
  }
  return state.pinsByWorkspace[normalizedKey] ?? [];
}

export function selectIsBrowserPinned(
  state: WorkspacePinsIndexState,
  key: string | null,
  browserId: string,
): boolean {
  const normalizedBrowserId = trimNonEmpty(browserId);
  if (!normalizedBrowserId) {
    return false;
  }
  return selectWorkspacePins(state, key).some((pin) => pin.browserId === normalizedBrowserId);
}

export function sanitizeWorkspacePinsForPersist(
  state: WorkspacePinsIndexState,
): WorkspacePinsIndexState {
  const pinsByWorkspace: Record<string, WorkspacePin[]> = {};
  for (const key in state.pinsByWorkspace) {
    const pins = (state.pinsByWorkspace[key] ?? [])
      .map((pin) => {
        const browserId = trimNonEmpty(pin.browserId);
        if (!browserId) {
          return null;
        }
        return {
          browserId,
          url: typeof pin.url === "string" ? pin.url : "",
          name: normalizePinName(pin.name),
          createdAt: typeof pin.createdAt === "number" ? pin.createdAt : 0,
        } satisfies WorkspacePin;
      })
      .filter((pin): pin is WorkspacePin => pin !== null);
    if (pins.length > 0) {
      pinsByWorkspace[key] = pins;
    }
  }
  return { pinsByWorkspace };
}
