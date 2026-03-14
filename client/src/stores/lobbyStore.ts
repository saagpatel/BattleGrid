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

function getLocalStorage():
  | {
      getItem: (key: string) => string | null;
      setItem: (key: string, value: string) => void;
    }
  | null {
  const candidate =
    (typeof window !== 'undefined' ? window.localStorage : null) ??
    (typeof globalThis !== 'undefined'
      ? (globalThis as { localStorage?: unknown }).localStorage
      : null);

  if (
    candidate &&
    typeof candidate === 'object' &&
    typeof (candidate as { getItem?: unknown }).getItem === 'function' &&
    typeof (candidate as { setItem?: unknown }).setItem === 'function'
  ) {
    return candidate as {
      getItem: (key: string) => string | null;
      setItem: (key: string, value: string) => void;
    };
  }

  return null;
}

function loadPlayerName(): string {
  const storage = getLocalStorage();
  return storage?.getItem('battleGrid:playerName') ?? '';
}

export const useLobbyStore = create<LobbyState>()((set) => ({
  rooms: [],
  currentRoom: null,
  playerName: loadPlayerName(),

  setRooms: (rooms) => set({ rooms }),
  setCurrentRoom: (room) => set({ currentRoom: room }),
  setPlayerName: (name) => {
    const storage = getLocalStorage();
    storage?.setItem('battleGrid:playerName', name);
    set({ playerName: name });
  },
}));
