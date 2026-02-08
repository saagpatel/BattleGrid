import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from '../stores/gameStore.js';
import type { UnitData, UnitOrder, SimEvent, HexCoord, GridData } from '../types/game.js';

function makeUnit(overrides: Partial<UnitData> = {}): UnitData {
  return {
    id: 1,
    owner: 0,
    unitClass: 'infantry',
    hp: 10,
    maxHp: 10,
    attack: 3,
    defense: 2,
    moveRange: 2,
    attackRange: 1,
    coord: { q: 0, r: 0 },
    ...overrides,
  };
}

describe('gameStore', () => {
  beforeEach(() => {
    useGameStore.getState().reset();
  });

  it('starts in idle phase', () => {
    expect(useGameStore.getState().phase).toBe('idle');
  });

  it('sets phase', () => {
    useGameStore.getState().setPhase('planning');
    expect(useGameStore.getState().phase).toBe('planning');
  });

  it('sets turn number', () => {
    useGameStore.getState().setTurn(5);
    expect(useGameStore.getState().turn).toBe(5);
  });

  it('sets player ID', () => {
    useGameStore.getState().setPlayerId(42);
    expect(useGameStore.getState().playerId).toBe(42);
  });

  it('sets grid data', () => {
    const grid: GridData = { width: 10, height: 10, cells: [] };
    useGameStore.getState().setGrid(grid);
    expect(useGameStore.getState().grid).toEqual(grid);
  });

  it('sets units as a Map keyed by ID', () => {
    const units = [makeUnit({ id: 1 }), makeUnit({ id: 2, unitClass: 'archer' })];
    useGameStore.getState().setUnits(units);
    const map = useGameStore.getState().units;
    expect(map.size).toBe(2);
    expect(map.get(1)?.unitClass).toBe('infantry');
    expect(map.get(2)?.unitClass).toBe('archer');
  });

  it('sets spawn zone', () => {
    const zone: HexCoord[] = [{ q: 0, r: 0 }, { q: 1, r: 0 }];
    useGameStore.getState().setSpawnZone(zone);
    expect(useGameStore.getState().spawnZone).toEqual(zone);
  });

  it('sets turn timer', () => {
    useGameStore.getState().setTurnTimer(15000);
    expect(useGameStore.getState().turnTimerMs).toBe(15000);
  });

  it('sets winner', () => {
    useGameStore.getState().setWinner(1);
    expect(useGameStore.getState().winner).toBe(1);
  });

  it('sets events', () => {
    const events: SimEvent[] = [{ kind: 'move', unitId: 1, from: { q: 0, r: 0 }, to: { q: 1, r: 0 } }];
    useGameStore.getState().setEvents(events);
    expect(useGameStore.getState().events).toEqual(events);
  });

  describe('orders', () => {
    it('adds an order', () => {
      const order: UnitOrder = { unitId: 1, orderType: 'move', target: { q: 1, r: 0 } };
      useGameStore.getState().addOrder(order);
      expect(useGameStore.getState().orders).toEqual([order]);
    });

    it('replaces an existing order for the same unit', () => {
      const order1: UnitOrder = { unitId: 1, orderType: 'move', target: { q: 1, r: 0 } };
      const order2: UnitOrder = { unitId: 1, orderType: 'attack', target: { q: 2, r: 0 } };
      useGameStore.getState().addOrder(order1);
      useGameStore.getState().addOrder(order2);
      expect(useGameStore.getState().orders).toEqual([order2]);
    });

    it('removes an order by unit ID', () => {
      const order: UnitOrder = { unitId: 1, orderType: 'move', target: { q: 1, r: 0 } };
      useGameStore.getState().addOrder(order);
      useGameStore.getState().removeOrder(1);
      expect(useGameStore.getState().orders).toEqual([]);
    });

    it('clears all orders', () => {
      useGameStore.getState().addOrder({ unitId: 1, orderType: 'move', target: { q: 1, r: 0 } });
      useGameStore.getState().addOrder({ unitId: 2, orderType: 'hold', target: { q: 0, r: 0 } });
      useGameStore.getState().clearOrders();
      expect(useGameStore.getState().orders).toEqual([]);
    });
  });

  it('resets to initial state', () => {
    useGameStore.getState().setPhase('resolving');
    useGameStore.getState().setTurn(10);
    useGameStore.getState().setWinner(1);
    useGameStore.getState().addOrder({ unitId: 1, orderType: 'move', target: { q: 1, r: 0 } });

    useGameStore.getState().reset();

    const state = useGameStore.getState();
    expect(state.phase).toBe('idle');
    expect(state.turn).toBe(0);
    expect(state.winner).toBeNull();
    expect(state.orders).toEqual([]);
    expect(state.units.size).toBe(0);
  });
});
