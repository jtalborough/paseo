import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
  applyAddPin,
  applyPurgeWorkspacePins,
  applyRemovePin,
  applyRenamePin,
  applyReorderPins,
  buildWorkspacePinsKey,
  sanitizeWorkspacePinsForPersist,
  selectIsBrowserPinned,
  selectWorkspacePins,
  type WorkspacePin,
  type WorkspacePinsIndexState,
} from "./state";

export type { WorkspacePin } from "./state";
export { buildWorkspacePinsKey } from "./state";

interface WorkspacePinsStoreState extends WorkspacePinsIndexState {
  addPin: (key: string, input: { browserId: string; url: string; name?: string | null }) => void;
  renamePin: (key: string, browserId: string, name: string) => void;
  removePin: (key: string, browserId: string) => void;
  reorderPins: (key: string, browserIds: string[]) => void;
  purgeWorkspacePins: (key: string) => void;
}

export const useWorkspacePinsStore = create<WorkspacePinsStoreState>()(
  persist(
    (set) => ({
      pinsByWorkspace: {},
      addPin: (key, input) => {
        set((state) =>
          applyAddPin(state, key, {
            browserId: input.browserId,
            url: input.url,
            name: input.name,
            now: Date.now(),
          }),
        );
      },
      renamePin: (key, browserId, name) => {
        set((state) => applyRenamePin(state, key, browserId, name));
      },
      removePin: (key, browserId) => {
        set((state) => applyRemovePin(state, key, browserId));
      },
      reorderPins: (key, browserIds) => {
        set((state) => applyReorderPins(state, key, browserIds));
      },
      purgeWorkspacePins: (key) => {
        set((state) => applyPurgeWorkspacePins(state, key));
      },
    }),
    {
      name: "workspace-pins-store",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => sanitizeWorkspacePinsForPersist(state),
    },
  ),
);

const EMPTY_PINS: WorkspacePin[] = [];

export function useWorkspacePins(key: string | null): WorkspacePin[] {
  return useWorkspacePinsStore((state) =>
    key ? (state.pinsByWorkspace[key] ?? EMPTY_PINS) : EMPTY_PINS,
  );
}

export function useIsBrowserPinned(key: string | null, browserId: string): boolean {
  return useWorkspacePinsStore((state) => selectIsBrowserPinned(state, key, browserId));
}

export function isBrowserPinned(
  input: { serverId: string; workspaceId: string },
  browserId: string,
): boolean {
  const key = buildWorkspacePinsKey(input);
  return selectIsBrowserPinned(useWorkspacePinsStore.getState(), key, browserId);
}

export { selectWorkspacePins, selectIsBrowserPinned };
