import { router, type Href } from "expo-router";
import { navigateToWorkspace } from "@/stores/navigation-active-workspace-store";
import { useWorkspaceLayoutStore } from "@/stores/workspace-layout-store";
import {
  prepareWorkspaceTab as prepareWorkspaceTabPure,
  navigateToPreparedWorkspaceTab as navigateToPreparedWorkspaceTabPure,
  navigateToPreparedProjectTab as navigateToPreparedProjectTabPure,
  type PrepareWorkspaceTabInput,
  type NavigateToPreparedWorkspaceTabInput,
  type NavigateToPreparedProjectTabInput,
} from "./prepare-workspace-tab";
import { buildHostProjectRoute } from "@/utils/host-routes";

export type {
  PrepareWorkspaceTabInput,
  NavigateToPreparedWorkspaceTabInput,
  NavigateToPreparedProjectTabInput,
} from "./prepare-workspace-tab";

function layoutStoreDeps() {
  const store = useWorkspaceLayoutStore.getState();
  return {
    openTabFocused: store.openTabFocused,
    pinAgent: store.pinAgent,
  };
}

export function prepareWorkspaceTab(input: PrepareWorkspaceTabInput): string {
  return prepareWorkspaceTabPure(input, layoutStoreDeps());
}

export function navigateToPreparedWorkspaceTab(input: NavigateToPreparedWorkspaceTabInput): string {
  return navigateToPreparedWorkspaceTabPure(input, {
    ...layoutStoreDeps(),
    navigateToWorkspace,
  });
}

export function navigateToPreparedProjectTab(input: NavigateToPreparedProjectTabInput): string {
  return navigateToPreparedProjectTabPure(input, {
    ...layoutStoreDeps(),
    navigateToProject: (serverId, groupId) => {
      router.dismissTo(buildHostProjectRoute(serverId, groupId) as Href);
    },
  });
}
