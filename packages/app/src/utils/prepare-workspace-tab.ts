import { generateDraftId } from "@/stores/draft-keys";
import {
  buildWorkspaceTabPersistenceKey,
  buildWorkspaceTabsSurfacePersistenceKey,
  type WorkspaceTabTarget,
} from "@/stores/workspace-tabs-store";
import { buildHostProjectRoute, buildHostWorkspaceRoute } from "@/utils/host-routes";

export interface PrepareWorkspaceTabInput {
  serverId: string;
  workspaceId: string;
  target: WorkspaceTabTarget;
  pin?: boolean;
}

export interface NavigateToPreparedWorkspaceTabInput extends PrepareWorkspaceTabInput {
  currentPathname?: string | null;
}

export interface PrepareProjectTabInput {
  serverId: string;
  groupId: string;
  target: WorkspaceTabTarget;
  pin?: boolean;
}

export interface NavigateToPreparedProjectTabInput extends PrepareProjectTabInput {
  currentPathname?: string | null;
}

export interface PrepareWorkspaceTabDeps {
  openTabFocused: (workspaceKey: string, target: WorkspaceTabTarget) => string | null;
  pinAgent: (workspaceKey: string, agentId: string) => void;
}

export interface NavigateToPreparedWorkspaceTabDeps extends PrepareWorkspaceTabDeps {
  navigateToWorkspace: (
    serverId: string,
    workspaceId: string,
    options: { currentPathname?: string | null },
  ) => void;
}

export interface NavigateToPreparedProjectTabDeps extends PrepareWorkspaceTabDeps {
  navigateToProject: (
    serverId: string,
    groupId: string,
    options: { currentPathname?: string | null },
  ) => void;
}

function getPreparedTarget(target: WorkspaceTabTarget): WorkspaceTabTarget {
  if (target.kind !== "draft" || target.draftId.trim() !== "new") {
    return target;
  }
  return { kind: "draft", draftId: generateDraftId() };
}

export function prepareWorkspaceTab(
  input: PrepareWorkspaceTabInput,
  deps: PrepareWorkspaceTabDeps,
): string {
  const target = getPreparedTarget(input.target);
  const key =
    buildWorkspaceTabPersistenceKey({
      serverId: input.serverId,
      workspaceId: input.workspaceId,
    }) ?? "";

  deps.openTabFocused(key, target);

  if (input.pin && target.kind === "agent") {
    deps.pinAgent(key, target.agentId);
  }

  return buildHostWorkspaceRoute(input.serverId, input.workspaceId);
}

export function navigateToPreparedWorkspaceTab(
  input: NavigateToPreparedWorkspaceTabInput,
  deps: NavigateToPreparedWorkspaceTabDeps,
): string {
  const route = prepareWorkspaceTab(input, deps);
  deps.navigateToWorkspace(input.serverId, input.workspaceId, {
    currentPathname: input.currentPathname,
  });
  return route;
}

export function prepareProjectTab(
  input: PrepareProjectTabInput,
  deps: PrepareWorkspaceTabDeps,
): string {
  const target = getPreparedTarget(input.target);
  const key =
    buildWorkspaceTabsSurfacePersistenceKey({
      serverId: input.serverId,
      scope: { kind: "project", groupId: input.groupId },
    }) ?? "";

  deps.openTabFocused(key, target);

  if (input.pin && target.kind === "agent") {
    deps.pinAgent(key, target.agentId);
  }

  return buildHostProjectRoute(input.serverId, input.groupId);
}

export function navigateToPreparedProjectTab(
  input: NavigateToPreparedProjectTabInput,
  deps: NavigateToPreparedProjectTabDeps,
): string {
  const route = prepareProjectTab(input, deps);
  deps.navigateToProject(input.serverId, input.groupId, {
    currentPathname: input.currentPathname,
  });
  return route;
}
