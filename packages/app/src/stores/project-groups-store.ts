import { create } from "zustand";
import type { ProjectGroupPayload } from "@getpaseo/protocol/messages";

// COMPAT(projectGroups): client-side cache of user-authored project groups, keyed
// by serverId. This is server-owned data (not persisted locally). Groups change
// only via this client's own RPCs, so the UI refreshes after each mutation rather
// than subscribing to server pushes.

export type ProjectGroup = ProjectGroupPayload;

interface ProjectGroupsStoreState {
  groupsByServerId: Record<string, ProjectGroup[]>;
  getGroups: (serverId: string | null | undefined) => ProjectGroup[];
  setGroups: (serverId: string, groups: ProjectGroup[]) => void;
  clear: (serverId: string) => void;
}

const EMPTY_GROUPS: ProjectGroup[] = [];

function areGroupsEqual(left: ProjectGroup[], right: ProjectGroup[]): boolean {
  if (left === right) {
    return true;
  }
  if (left.length !== right.length) {
    return false;
  }
  return left.every((group, index) => {
    const candidate = right[index];
    return (
      candidate?.groupId === group.groupId &&
      candidate.displayName === group.displayName &&
      candidate.cwd === group.cwd &&
      candidate.color === group.color &&
      candidate.icon === group.icon &&
      candidate.order === group.order &&
      candidate.archetype === group.archetype &&
      candidate.archivedAt === group.archivedAt &&
      candidate.createdAt === group.createdAt &&
      candidate.updatedAt === group.updatedAt
    );
  });
}

export const useProjectGroupsStore = create<ProjectGroupsStoreState>()((set, get) => ({
  groupsByServerId: {},
  getGroups: (serverId) => {
    if (!serverId) {
      return EMPTY_GROUPS;
    }
    return get().groupsByServerId[serverId] ?? EMPTY_GROUPS;
  },
  setGroups: (serverId, groups) => {
    set((state) => {
      if (areGroupsEqual(state.groupsByServerId[serverId] ?? EMPTY_GROUPS, groups)) {
        return state;
      }
      return {
        groupsByServerId: { ...state.groupsByServerId, [serverId]: groups },
      };
    });
  },
  clear: (serverId) => {
    set((state) => {
      if (!(serverId in state.groupsByServerId)) {
        return state;
      }
      const next = { ...state.groupsByServerId };
      delete next[serverId];
      return { groupsByServerId: next };
    });
  },
}));
