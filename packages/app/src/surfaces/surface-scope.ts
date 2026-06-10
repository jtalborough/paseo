export type SurfaceScope =
  | { kind: "workspace"; workspaceId: string }
  | { kind: "project"; groupId: string };

function trimNonEmpty(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function workspaceSurfaceScope(workspaceId: string | null | undefined): SurfaceScope | null {
  const normalizedWorkspaceId = trimNonEmpty(workspaceId);
  return normalizedWorkspaceId ? { kind: "workspace", workspaceId: normalizedWorkspaceId } : null;
}

export function projectSurfaceScope(groupId: string | null | undefined): SurfaceScope | null {
  const normalizedGroupId = trimNonEmpty(groupId);
  return normalizedGroupId ? { kind: "project", groupId: normalizedGroupId } : null;
}

export function normalizeSurfaceScope(scope: SurfaceScope | null | undefined): SurfaceScope | null {
  if (!scope) {
    return null;
  }
  if (scope.kind === "workspace") {
    return workspaceSurfaceScope(scope.workspaceId);
  }
  if (scope.kind === "project") {
    return projectSurfaceScope(scope.groupId);
  }
  return null;
}

export function buildSurfacePersistenceKey(input: {
  serverId: string;
  scope: SurfaceScope | null | undefined;
}): string | null {
  const serverId = trimNonEmpty(input.serverId);
  const scope = normalizeSurfaceScope(input.scope);
  if (!serverId || !scope) {
    return null;
  }
  if (scope.kind === "workspace") {
    return `${serverId}:${scope.workspaceId}`;
  }
  return `${serverId}:project:${scope.groupId}`;
}
