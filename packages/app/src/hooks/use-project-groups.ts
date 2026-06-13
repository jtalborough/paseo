import { useCallback, useEffect } from "react";
import { getHostRuntimeStore } from "@/runtime/host-runtime";
import { getDesktopHost } from "@/desktop/host";
import { pickDirectory } from "@/desktop/pick-directory";
import { normalizeWorkspaceDescriptor, useSessionStore } from "@/stores/session-store";
import { type ProjectGroup, useProjectGroupsStore } from "@/stores/project-groups-store";
import type { ProjectArchetype } from "@getpaseo/protocol/messages";

// COMPAT(projectGroups): fetches user-authored project groups for a server and
// exposes mutation helpers. Groups change only via this client's RPCs, so each
// mutation refreshes the cache rather than relying on a server push. Gated on the
// daemon advertising `features.projectGroups`; when absent the hook is inert and
// returns no groups (the sidebar falls back to its flat list).

export interface UseProjectGroupsResult {
  groups: ProjectGroup[];
  supported: boolean;
  refresh: () => Promise<void>;
  createGroup: (input: {
    displayName: string;
    color?: string | null;
    archetype?: ProjectArchetype | null;
  }) => Promise<void>;
  updateGroup: (input: {
    groupId: string;
    displayName?: string;
    color?: string | null;
    order?: number | null;
    archetype?: ProjectArchetype | null;
  }) => Promise<void>;
  reorderGroups: (groupIds: string[]) => Promise<void>;
  deleteGroup: (groupId: string) => Promise<void>;
  setFolderGroup: (projectId: string, groupId: string | null) => Promise<void>;
  // Phase 1a: pick any local directory (git or non-git), register it, and assign
  // it to `groupId` in one step. Only available where a desktop directory dialog
  // exists; `canAddFromDisk` gates the affordance.
  canAddFromDisk: boolean;
  addFolderFromDisk: (groupId: string | null) => Promise<void>;
  addFolderPath: (path: string, groupId: string | null) => Promise<void>;
}

export function useProjectGroups(serverId: string | null | undefined): UseProjectGroupsResult {
  const runtime = getHostRuntimeStore();
  const normalizedServerId =
    typeof serverId === "string" && serverId.trim().length > 0 ? serverId.trim() : null;

  const supported = useSessionStore((state) =>
    normalizedServerId
      ? state.sessions[normalizedServerId]?.serverInfo?.features?.projectGroups === true
      : false,
  );

  const groups = useProjectGroupsStore((state) => state.getGroups(normalizedServerId));

  const refresh = useCallback(async () => {
    if (!normalizedServerId || !supported) {
      return;
    }
    const client = runtime.getClient(normalizedServerId);
    if (!client) {
      return;
    }
    try {
      const payload = await client.listProjectGroups();
      useProjectGroupsStore.getState().setGroups(normalizedServerId, payload.groups);
    } catch (error) {
      console.error("[project-groups] failed to list groups", {
        serverId: normalizedServerId,
        error,
      });
    }
  }, [normalizedServerId, runtime, supported]);

  const createGroup = useCallback(
    async (input: {
      displayName: string;
      color?: string | null;
      archetype?: ProjectArchetype | null;
    }) => {
      if (!normalizedServerId) {
        return;
      }
      const client = runtime.getClient(normalizedServerId);
      if (!client) {
        return;
      }
      const payload = await client.createProjectGroup(input);
      if (!payload.accepted || payload.error) {
        throw new Error(payload.error ?? "Failed to create Project");
      }
      await refresh();
    },
    [normalizedServerId, runtime, refresh],
  );

  const updateGroup = useCallback(
    async (input: {
      groupId: string;
      displayName?: string;
      color?: string | null;
      order?: number | null;
      archetype?: ProjectArchetype | null;
    }) => {
      if (!normalizedServerId) {
        return;
      }
      const client = runtime.getClient(normalizedServerId);
      if (!client) {
        return;
      }
      const payload = await client.updateProjectGroup(input);
      if (!payload.accepted || payload.error) {
        throw new Error(payload.error ?? "Failed to update Project");
      }
      await refresh();
    },
    [normalizedServerId, runtime, refresh],
  );

  const reorderGroups = useCallback(
    async (groupIds: string[]) => {
      if (!normalizedServerId) {
        return;
      }
      const client = runtime.getClient(normalizedServerId);
      if (!client) {
        return;
      }
      await Promise.all(
        groupIds.map((groupId, index) => client.updateProjectGroup({ groupId, order: index })),
      );
      await refresh();
    },
    [normalizedServerId, runtime, refresh],
  );

  const deleteGroup = useCallback(
    async (groupId: string) => {
      if (!normalizedServerId) {
        return;
      }
      const client = runtime.getClient(normalizedServerId);
      if (!client) {
        return;
      }
      const payload = await client.deleteProjectGroup(groupId);
      if (!payload.accepted || payload.error) {
        throw new Error(payload.error ?? "Failed to remove Project");
      }
      await refresh();
    },
    [normalizedServerId, runtime, refresh],
  );

  const setFolderGroup = useCallback(
    async (projectId: string, groupId: string | null) => {
      if (!normalizedServerId) {
        return;
      }
      const client = runtime.getClient(normalizedServerId);
      if (!client) {
        return;
      }
      await client.setProjectFolderGroup(projectId, groupId);
      await refresh();
    },
    [normalizedServerId, runtime, refresh],
  );

  const canAddFromDisk = typeof getDesktopHost()?.dialog?.open === "function";

  const addFolderPath = useCallback(
    async (path: string, groupId: string | null) => {
      if (!normalizedServerId) {
        return;
      }
      const client = runtime.getClient(normalizedServerId);
      if (!client) {
        return;
      }
      const trimmedPath = path.trim();
      if (!trimmedPath) {
        return;
      }
      // Register the folder (server classifies git vs non-git) and surface it.
      const payload = await client.openProject(trimmedPath);
      if (payload.error || !payload.workspace) {
        console.error("[project-groups] openProject failed", {
          path: trimmedPath,
          error: payload.error,
        });
        throw new Error(payload.error ?? "Failed to add folder");
      }
      const workspace = normalizeWorkspaceDescriptor(payload.workspace);
      const store = useSessionStore.getState();
      store.mergeWorkspaces(normalizedServerId, [workspace]);
      store.setHasHydratedWorkspaces(normalizedServerId, true);
      // Assign into the target group (null = leave ungrouped). The server emits a
      // workspace update so the folder re-nests under the group automatically.
      if (groupId) {
        await client.setProjectFolderGroup(workspace.projectId, groupId);
      }
      await refresh();
    },
    [normalizedServerId, runtime, refresh],
  );

  const addFolderFromDisk = useCallback(
    async (groupId: string | null) => {
      let path: string | null;
      try {
        path = await pickDirectory();
      } catch (error) {
        console.error("[project-groups] directory picker unavailable", { error });
        return;
      }
      if (!path) {
        return;
      }
      await addFolderPath(path, groupId);
    },
    [addFolderPath],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    groups,
    supported,
    refresh,
    createGroup,
    updateGroup,
    reorderGroups,
    deleteGroup,
    setFolderGroup,
    canAddFromDisk,
    addFolderFromDisk,
    addFolderPath,
  };
}
