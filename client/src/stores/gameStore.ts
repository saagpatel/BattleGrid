import { create } from 'zustand';
import type {
  GamePhase,
  HexCoord,
  UnitData,
  UnitOrder,
  SimEvent,
  GridData,
  UnitClass,
} from '../types/game.js';

export interface GameState {
  phase: GamePhase;
  turn: number;
  playerId: number | null;
  units: Map<number, UnitData>;
  grid: GridData | null;
  orders: UnitOrder[];
  spawnZone: HexCoord[];
  availableUnits: UnitClass[];
  turnTimerMs: number;
  winner: number | null;
  events: SimEvent[];
  replayBytes: Uint8Array | null;

  setPhase: (phase: GamePhase) => void;
  setTurn: (turn: number) => void;
  setPlayerId: (id: number) => void;
  setGrid: (grid: GridData) => void;
  setUnits: (units: UnitData[]) => void;
  setSpawnZone: (zone: HexCoord[]) => void;
  setAvailableUnits: (units: UnitClass[]) => void;
  setTurnTimer: (ms: number) => void;
  setWinner: (winner: number) => void;
  setEvents: (events: SimEvent[]) => void;
  setReplayBytes: (bytes: Uint8Array) => void;
  addOrder: (order: UnitOrder) => void;
  removeOrder: (unitId: number) => void;
  clearOrders: () => void;
  reset: () => void;
}

const initialState = {
  phase: 'idle' as GamePhase,
  turn: 0,
  playerId: null as number | null,
  units: new Map<number, UnitData>(),
  grid: null as GridData | null,
  orders: [] as UnitOrder[],
  spawnZone: [] as HexCoord[],
  availableUnits: [] as UnitClass[],
  turnTimerMs: 30000,
  winner: null as number | null,
  events: [] as SimEvent[],
  replayBytes: null as Uint8Array | null,
};

export const useGameStore = create<GameState>()((set) => ({
  ...initialState,

  setPhase: (phase) => set({ phase }),
  setTurn: (turn) => set({ turn }),
  setPlayerId: (id) => set({ playerId: id }),
  setGrid: (grid) => set({ grid }),

  setUnits: (units) =>
    set({ units: new Map(units.map((u) => [u.id, u])) }),

  setSpawnZone: (zone) => set({ spawnZone: zone }),
  setAvailableUnits: (units) => set({ availableUnits: units }),
  setTurnTimer: (ms) => set({ turnTimerMs: ms }),
  setWinner: (winner) => set({ winner }),
  setEvents: (events) => set({ events }),
  setReplayBytes: (bytes) => set({ replayBytes: bytes }),

  addOrder: (order) =>
    set((state) => ({
      orders: [
        ...state.orders.filter((o) => o.unitId !== order.unitId),
        order,
      ],
    })),

  removeOrder: (unitId) =>
    set((state) => ({
      orders: state.orders.filter((o) => o.unitId !== unitId),
    })),

  clearOrders: () => set({ orders: [] }),

  reset: () => set({ ...initialState, units: new Map() }),
}));
