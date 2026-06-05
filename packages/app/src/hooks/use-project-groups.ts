import { useCallback, useEffect } from "react";
import { getHostRuntimeStore } from "@/runtime/host-runtime";
import { useSessionStore } from "@/stores/session-store";
import { type ProjectGroup, useProjectGroupsStore } from "@/stores/project-groups-store";

// COMPAT(projectGroups): fetches user-authored project groups for a server and
// exposes mutation helpers. Groups change only via this client's RPCs, so each
// mutation refreshes the cache rather than relying on a server push. Gated on the
// daemon advertising `features.projectGroups`; when absent the hook is inert and
// returns no groups (the sidebar falls back to its flat list).

export interface UseProjectGroupsResult {
  groups: ProjectGroup[];
  supported: boolean;
  refresh: () => Promise<void>;
  createGroup: (input: { displayName: string; color?: string | null }) => Promise<void>;
  updateGroup: (input: {
    groupId: string;
    displayName?: string;
    color?: string | null;
    order?: number | null;
  }) => Promise<void>;
  deleteGroup: (groupId: string) => Promise<void>;
  setFolderGroup: (projectId: string, groupId: string | null) => Promise<void>;
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
    async (input: { displayName: string; color?: string | null }) => {
      if (!normalizedServerId) {
        return;
      }
      const client = runtime.getClient(normalizedServerId);
      if (!client) {
        return;
      }
      await client.createProjectGroup(input);
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
    }) => {
      if (!normalizedServerId) {
        return;
      }
      const client = runtime.getClient(normalizedServerId);
      if (!client) {
        return;
      }
      await client.updateProjectGroup(input);
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
      await client.deleteProjectGroup(groupId);
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

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { groups, supported, refresh, createGroup, updateGroup, deleteGroup, setFolderGroup };
}
