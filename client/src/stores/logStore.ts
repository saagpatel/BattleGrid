import { create } from 'zustand';

export interface LogEntry {
  id: number;
  turn: number;
  text: string;
  kind: 'move' | 'attack' | 'death' | 'heal' | 'ability' | 'system';
  timestamp: number;
}

export interface LogState {
  entries: LogEntry[];
  nextId: number;
  addEntry: (turn: number, text: string, kind: LogEntry['kind']) => void;
  clear: () => void;
}

const MAX_LOG_ENTRIES = 200;

export const useLogStore = create<LogState>()((set) => ({
  entries: [],
  nextId: 1,

  addEntry: (turn, text, kind) =>
    set((s) => {
      const entry: LogEntry = {
        id: s.nextId,
        turn,
        text,
        kind,
        timestamp: Date.now(),
      };
      const entries = [...s.entries, entry].slice(-MAX_LOG_ENTRIES);
      return { entries, nextId: s.nextId + 1 };
    }),

  clear: () => set({ entries: [], nextId: 1 }),
}));
