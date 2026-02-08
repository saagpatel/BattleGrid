import { create } from 'zustand';
import type { RoomInfo, RoomDetails } from '../types/network.js';

export interface LobbyState {
  rooms: RoomInfo[];
  currentRoom: RoomDetails | null;
  playerName: string;

  setRooms: (rooms: RoomInfo[]) => void;
  setCurrentRoom: (room: RoomDetails | null) => void;
  setPlayerName: (name: string) => void;
}

function loadPlayerName(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem('battleGrid:playerName') ?? '';
}

export const useLobbyStore = create<LobbyState>()((set) => ({
  rooms: [],
  currentRoom: null,
  playerName: loadPlayerName(),

  setRooms: (rooms) => set({ rooms }),
  setCurrentRoom: (room) => set({ currentRoom: room }),
  setPlayerName: (name) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('battleGrid:playerName', name);
    }
    set({ playerName: name });
  },
}));
