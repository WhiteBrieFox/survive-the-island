import { create } from "zustand";
import type { AbilityType, PublicRoomState, Role } from "../shared/types";

interface GameStore {
  clientId: string | null;
  role: Role | null;
  room: PublicRoomState | null;
  selectedExplorerId: string | null;
  selectedRaftId: string | null;
  selectedCreatureId: string | null;
  activeAbility: AbilityType | null;
  markerHotkeyPressed: boolean;
  notice: string | null;
  setSession: (clientId: string, role: Role, room: PublicRoomState) => void;
  setRoom: (room: PublicRoomState) => void;
  selectExplorer: (id: string | null) => void;
  selectRaft: (id: string | null) => void;
  selectCreature: (id: string | null) => void;
  setActiveAbility: (ability: AbilityType | null) => void;
  setMarkerHotkeyPressed: (pressed: boolean) => void;
  showNotice: (message: string | null) => void;
  reset: () => void;
}

export const useGameStore = create<GameStore>((set) => ({
  clientId: null,
  role: null,
  room: null,
  selectedExplorerId: null,
  selectedRaftId: null,
  selectedCreatureId: null,
  activeAbility: null,
  markerHotkeyPressed: false,
  notice: null,
  setSession: (clientId, role, room) => set({ clientId, role, room, selectedExplorerId: null, selectedRaftId: null, selectedCreatureId: null, activeAbility: null, markerHotkeyPressed: false }),
  setRoom: (room) =>
    set((state) => ({
      room,
      selectedExplorerId:
        state.selectedExplorerId && room.explorers.some((explorer) => explorer.id === state.selectedExplorerId)
          ? state.selectedExplorerId
          : null,
      selectedRaftId: state.selectedRaftId && room.rafts.some((raft) => raft.id === state.selectedRaftId) ? state.selectedRaftId : null,
      selectedCreatureId: state.selectedCreatureId && room.creatures.some((creature) => creature.id === state.selectedCreatureId) ? state.selectedCreatureId : null
    })),
  selectExplorer: (selectedExplorerId) => set({ selectedExplorerId, selectedRaftId: null, selectedCreatureId: null }),
  selectRaft: (selectedRaftId) => set({ selectedRaftId, selectedExplorerId: null, selectedCreatureId: null }),
  selectCreature: (selectedCreatureId) => set({ selectedCreatureId, selectedExplorerId: null, selectedRaftId: null }),
  setActiveAbility: (activeAbility) => set({ activeAbility }),
  setMarkerHotkeyPressed: (markerHotkeyPressed) => set({ markerHotkeyPressed }),
  showNotice: (notice) => set({ notice }),
  reset: () => set({ clientId: null, role: null, room: null, selectedExplorerId: null, selectedRaftId: null, selectedCreatureId: null, activeAbility: null, markerHotkeyPressed: false, notice: null })
}));
