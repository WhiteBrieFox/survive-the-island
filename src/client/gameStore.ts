import { create } from "zustand";
import type { PublicRoomState, Role } from "../shared/types";

interface GameStore {
  clientId: string | null;
  role: Role | null;
  room: PublicRoomState | null;
  selectedExplorerId: string | null;
  notice: string | null;
  setSession: (clientId: string, role: Role, room: PublicRoomState) => void;
  setRoom: (room: PublicRoomState) => void;
  selectExplorer: (id: string | null) => void;
  showNotice: (message: string | null) => void;
  reset: () => void;
}

export const useGameStore = create<GameStore>((set) => ({
  clientId: null,
  role: null,
  room: null,
  selectedExplorerId: null,
  notice: null,
  setSession: (clientId, role, room) => set({ clientId, role, room, selectedExplorerId: null }),
  setRoom: (room) =>
    set((state) => ({
      room,
      selectedExplorerId:
        state.selectedExplorerId && room.explorers.some((explorer) => explorer.id === state.selectedExplorerId)
          ? state.selectedExplorerId
          : null
    })),
  selectExplorer: (selectedExplorerId) => set({ selectedExplorerId }),
  showNotice: (notice) => set({ notice }),
  reset: () => set({ clientId: null, role: null, room: null, selectedExplorerId: null, notice: null })
}));
