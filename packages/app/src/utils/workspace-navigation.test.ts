import { describe, expect, it } from "vitest";
import type { WorkspaceTabTarget } from "@/stores/workspace-tabs-store";
import {
  navigateToPreparedProjectTab,
  navigateToPreparedWorkspaceTab,
  prepareProjectTab,
  prepareWorkspaceTab,
} from "@/utils/prepare-workspace-tab";

const SERVER_ID = "server-1";
const WORKSPACE_ID = "/repo/worktree";
const AGENT_ID = "agent-1";

interface RecordedOpenedTab {
  key: string;
  target: WorkspaceTabTarget;
}

interface RecordedPin {
  key: string;
  agentId: string;
}

interface RecordedNavigation {
  serverId: string;
  workspaceId: string;
  currentPathname?: string | null;
}

interface RecordedProjectNavigation {
  serverId: string;
  groupId: string;
  currentPathname?: string | null;
}

function createFakeLayout() {
  const openedTabs: RecordedOpenedTab[] = [];
  const pinnedAgents: RecordedPin[] = [];
  return {
    openedTabs,
    pinnedAgents,
    openTabFocused: (key: string, target: WorkspaceTabTarget) => {
      openedTabs.push({ key, target });
      return target.kind === "agent" ? target.agentId : null;
    },
    pinAgent: (key: string, agentId: string) => {
      pinnedAgents.push({ key, agentId });
    },
  };
}

function createFakeNavigator() {
  const navigations: RecordedNavigation[] = [];
  const projectNavigations: RecordedProjectNavigation[] = [];
  return {
    navigations,
    projectNavigations,
    navigateToWorkspace: (
      serverId: string,
      workspaceId: string,
      options: { currentPathname?: string | null },
    ) => {
      navigations.push({ serverId, workspaceId, currentPathname: options.currentPathname });
    },
    navigateToProject: (
      serverId: string,
      groupId: string,
      options: { currentPathname?: string | null },
    ) => {
      projectNavigations.push({ serverId, groupId, currentPathname: options.currentPathname });
    },
  };
}

describe("prepareWorkspaceTab", () => {
  it("opens and focuses an agent tab", () => {
    const layout = createFakeLayout();

    const route = prepareWorkspaceTab(
      {
        serverId: SERVER_ID,
        workspaceId: WORKSPACE_ID,
        target: { kind: "agent", agentId: AGENT_ID },
      },
      layout,
    );

    expect(route).toBe("/h/server-1/workspace/b64_L3JlcG8vd29ya3RyZWU");
    expect(layout.openedTabs).toEqual([
      { key: "server-1:/repo/worktree", target: { kind: "agent", agentId: AGENT_ID } },
    ]);
    expect(layout.pinnedAgents).toEqual([]);
  });

  it("opens and focuses a Project agent tab in the Project surface namespace", () => {
    const layout = createFakeLayout();

    const route = prepareProjectTab(
      {
        serverId: SERVER_ID,
        groupId: "grp_product",
        target: { kind: "agent", agentId: AGENT_ID },
      },
      layout,
    );

    expect(route).toBe("/h/server-1/project/grp_product");
    expect(layout.openedTabs).toEqual([
      { key: "server-1:project:grp_product", target: { kind: "agent", agentId: AGENT_ID } },
    ]);
    expect(layout.pinnedAgents).toEqual([]);
  });

  it("prepares a tab and navigates through the workspace navigation helper", () => {
    const layout = createFakeLayout();
    const navigator = createFakeNavigator();

    const route = navigateToPreparedWorkspaceTab(
      {
        serverId: SERVER_ID,
        workspaceId: WORKSPACE_ID,
        target: { kind: "agent", agentId: AGENT_ID },
      },
      { ...layout, navigateToWorkspace: navigator.navigateToWorkspace },
    );

    expect(route).toBe("/h/server-1/workspace/b64_L3JlcG8vd29ya3RyZWU");
    expect(layout.openedTabs).toEqual([
      { key: "server-1:/repo/worktree", target: { kind: "agent", agentId: AGENT_ID } },
    ]);
    expect(navigator.navigations).toEqual([
      { serverId: SERVER_ID, workspaceId: WORKSPACE_ID, currentPathname: undefined },
    ]);
  });

  it("prepares a Project tab and navigates through the Project navigation helper", () => {
    const layout = createFakeLayout();
    const navigator = createFakeNavigator();

    const route = navigateToPreparedProjectTab(
      {
        serverId: SERVER_ID,
        groupId: "grp_product",
        target: { kind: "agent", agentId: AGENT_ID },
        currentPathname: "/h/server-1/agent/agent-1",
      },
      { ...layout, navigateToProject: navigator.navigateToProject },
    );

    expect(route).toBe("/h/server-1/project/grp_product");
    expect(layout.openedTabs).toEqual([
      { key: "server-1:project:grp_product", target: { kind: "agent", agentId: AGENT_ID } },
    ]);
    expect(navigator.projectNavigations).toEqual([
      {
        serverId: SERVER_ID,
        groupId: "grp_product",
        currentPathname: "/h/server-1/agent/agent-1",
      },
    ]);
  });
});
