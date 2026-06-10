import { create } from "zustand";

// The currently-selected Project (group), per server. Selecting a Project makes it
// the active context — it drives the Project home surface and the default launch
// target for Project-level agents (committee guidance: keyed by the stable grp_ id,
// pure client state, never overloading folder projectKey selection).
interface ProjectSelectionState {
  selectedGroupIdByServerId: Record<string, string | null>;
  getSelectedGroupId: (serverId: string | null | undefined) => string | null;
  selectGroup: (serverId: string, groupId: string | null) => void;
}

export const useProjectSelectionStore = create<ProjectSelectionState>()((set, get) => ({
  selectedGroupIdByServerId: {},
  getSelectedGroupId: (serverId) => {
    if (!serverId) {
      return null;
    }
    return get().selectedGroupIdByServerId[serverId] ?? null;
  },
  selectGroup: (serverId, groupId) => {
    set((state) => {
      if (state.selectedGroupIdByServerId[serverId] === groupId) {
        return state;
      }
      return {
        selectedGroupIdByServerId: { ...state.selectedGroupIdByServerId, [serverId]: groupId },
      };
    });
  },
}));
