import { describe, it, expect, beforeEach } from 'vitest';
import { queueSimEvents } from '../renderer/eventAnimator.js';
import { AnimationEngine } from '../renderer/AnimationEngine.js';
import { useLogStore } from '../stores/logStore.js';
import type { SimEvent, UnitData } from '../types/game.js';

function makeUnit(id: number, owner: number, q: number, r: number): UnitData {
  return {
    id,
    owner,
    unitClass: 'infantry',
    hp: 10,
    maxHp: 10,
    attack: 5,
    defense: 3,
    moveRange: 3,
    attackRange: 1,
    coord: { q, r },
  };
}

describe('eventAnimator', () => {
  let engine: AnimationEngine;
  let units: Map<number, UnitData>;

  beforeEach(() => {
    engine = new AnimationEngine(32);
    units = new Map();
    units.set(1, makeUnit(1, 0, 0, 0));
    units.set(2, makeUnit(2, 1, 1, 0));
    useLogStore.setState({ entries: [], nextId: 1 });
  });

  it('queues move animation and logs it', () => {
    const events: SimEvent[] = [
      { kind: 'move', unitId: 1, from: { q: 0, r: 0 }, to: { q: 1, r: 1 } },
    ];

    const duration = queueSimEvents(engine, events, units, 1);
    expect(duration).toBeGreaterThan(0);
    expect(engine.isAnimating()).toBe(true);

    const logs = useLogStore.getState().entries;
    expect(logs).toHaveLength(1);
    expect(logs[0].kind).toBe('move');
    expect(logs[0].text).toContain('infantry #1');
    expect(logs[0].text).toContain('(1, 1)');
  });

  it('queues attack animation with damage number and logs it', () => {
    const events: SimEvent[] = [
      { kind: 'attack', unitId: 1, targetUnitId: 2, damage: 5 },
    ];

    queueSimEvents(engine, events, units, 2);
    expect(engine.isAnimating()).toBe(true);

    const logs = useLogStore.getState().entries;
    expect(logs).toHaveLength(1);
    expect(logs[0].kind).toBe('attack');
    expect(logs[0].text).toContain('attacked');
    expect(logs[0].text).toContain('5 damage');
  });

  it('queues death animation and logs it', () => {
    const events: SimEvent[] = [
      { kind: 'death', unitId: 2 },
    ];

    queueSimEvents(engine, events, units, 3);

    const logs = useLogStore.getState().entries;
    expect(logs).toHaveLength(1);
    expect(logs[0].kind).toBe('death');
    expect(logs[0].text).toContain('destroyed');
  });

  it('queues heal animation and logs it', () => {
    const events: SimEvent[] = [
      { kind: 'heal', unitId: 1, targetUnitId: 2, healAmount: 3 },
    ];

    queueSimEvents(engine, events, units, 4);

    const logs = useLogStore.getState().entries;
    expect(logs).toHaveLength(1);
    expect(logs[0].kind).toBe('heal');
    expect(logs[0].text).toContain('healed');
    expect(logs[0].text).toContain('3 HP');
  });

  it('handles multiple events sequentially', () => {
    const events: SimEvent[] = [
      { kind: 'move', unitId: 1, from: { q: 0, r: 0 }, to: { q: 1, r: 0 } },
      { kind: 'attack', unitId: 1, targetUnitId: 2, damage: 4 },
      { kind: 'death', unitId: 2 },
    ];

    const duration = queueSimEvents(engine, events, units, 5);
    expect(duration).toBeGreaterThan(0);

    const logs = useLogStore.getState().entries;
    expect(logs).toHaveLength(3);
    expect(logs[0].kind).toBe('move');
    expect(logs[1].kind).toBe('attack');
    expect(logs[2].kind).toBe('death');
  });

  it('handles terrain_change with log entry', () => {
    const events: SimEvent[] = [
      { kind: 'terrain_change', unitId: 0, to: { q: 2, r: 3 } },
    ];

    queueSimEvents(engine, events, units, 6);

    const logs = useLogStore.getState().entries;
    expect(logs).toHaveLength(1);
    expect(logs[0].kind).toBe('system');
    expect(logs[0].text).toContain('(2, 3)');
  });

  it('handles counter_attack events', () => {
    const events: SimEvent[] = [
      { kind: 'counter_attack', unitId: 2, targetUnitId: 1, damage: 2 },
    ];

    queueSimEvents(engine, events, units, 7);

    const logs = useLogStore.getState().entries;
    expect(logs).toHaveLength(1);
    expect(logs[0].kind).toBe('attack');
    expect(logs[0].text).toContain('counter-attacked');
  });

  it('handles ability events', () => {
    const events: SimEvent[] = [
      { kind: 'ability', unitId: 1 },
    ];

    queueSimEvents(engine, events, units, 8);

    const logs = useLogStore.getState().entries;
    expect(logs).toHaveLength(1);
    expect(logs[0].kind).toBe('ability');
    expect(logs[0].text).toContain('used ability');
  });
});
