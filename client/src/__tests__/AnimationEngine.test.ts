import { describe, it, expect, beforeEach } from 'vitest';
import { AnimationEngine } from '../renderer/AnimationEngine.js';
import type { MoveAnimation } from '../renderer/AnimationEngine.js';

describe('AnimationEngine', () => {
  let engine: AnimationEngine;

  beforeEach(() => {
    engine = new AnimationEngine(32);
  });

  it('starts with no animations', () => {
    expect(engine.isAnimating()).toBe(false);
  });

  it('reports animating after enqueue', () => {
    const anim: MoveAnimation = {
      type: 'move',
      unitId: 1,
      path: [
        { q: 0, r: 0 },
        { q: 1, r: 0 },
      ],
      startTime: 0,
      duration: 500,
    };
    engine.enqueue(anim);
    expect(engine.isAnimating()).toBe(true);
  });

  it('clears all animations', () => {
    engine.enqueue({
      type: 'move',
      unitId: 1,
      path: [{ q: 0, r: 0 }, { q: 1, r: 0 }],
      startTime: 0,
      duration: 500,
    });
    engine.clear();
    expect(engine.isAnimating()).toBe(false);
  });

  describe('getUnitPosition', () => {
    it('returns null when no move animation for unit', () => {
      expect(engine.getUnitPosition(1, 100)).toBeNull();
    });

    it('returns interpolated position during animation', () => {
      engine.enqueue({
        type: 'move',
        unitId: 1,
        path: [
          { q: 0, r: 0 },
          { q: 1, r: 0 },
        ],
        startTime: 0,
        duration: 1000,
      });

      const pos = engine.getUnitPosition(1, 500); // halfway through
      expect(pos).not.toBeNull();
      // At t=0.5, should be halfway between hex (0,0) and hex (1,0)
      expect(pos!.x).toBeGreaterThan(0);
    });

    it('returns null when animation not yet started', () => {
      engine.enqueue({
        type: 'move',
        unitId: 1,
        path: [{ q: 0, r: 0 }, { q: 1, r: 0 }],
        startTime: 1000,
        duration: 500,
      });
      expect(engine.getUnitPosition(1, 500)).toBeNull();
    });

    it('returns null when animation is expired', () => {
      engine.enqueue({
        type: 'move',
        unitId: 1,
        path: [{ q: 0, r: 0 }, { q: 1, r: 0 }],
        startTime: 0,
        duration: 500,
      });
      expect(engine.getUnitPosition(1, 1000)).toBeNull();
    });
  });
});
