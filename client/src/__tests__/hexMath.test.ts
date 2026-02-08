import { describe, it, expect } from 'vitest';
import {
  hexToPixel,
  pixelToHex,
  hexDistance,
  hexCorners,
  hexEq,
  hexKey,
} from '../renderer/hexMath.js';

describe('hexMath', () => {
  describe('hexToPixel', () => {
    it('origin maps to (0, 0)', () => {
      const p = hexToPixel(0, 0, 32);
      expect(Math.abs(p.x)).toBeLessThan(1e-10);
      expect(Math.abs(p.y)).toBeLessThan(1e-10);
    });

    it('positive q moves right', () => {
      const p = hexToPixel(1, 0, 32);
      expect(p.x).toBeGreaterThan(0);
    });

    it('positive r moves down', () => {
      const p = hexToPixel(0, 1, 32);
      expect(p.y).toBeGreaterThan(0);
    });
  });

  describe('pixelToHex', () => {
    it('origin pixel maps to (0, 0) hex', () => {
      const h = pixelToHex(0, 0, 32);
      expect(h.q).toBe(0);
      expect(h.r).toBe(0);
    });

    it('round-trips for all hexes in range 5', () => {
      const hexSize = 32;
      for (let q = -5; q <= 5; q++) {
        for (let r = Math.max(-5, -q - 5); r <= Math.min(5, -q + 5); r++) {
          const p = hexToPixel(q, r, hexSize);
          const back = pixelToHex(p.x, p.y, hexSize);
          expect(back.q).toBe(q);
          expect(back.r).toBe(r);
        }
      }
    });
  });

  describe('hexDistance', () => {
    it('distance to self is 0', () => {
      expect(hexDistance({ q: 0, r: 0 }, { q: 0, r: 0 })).toBe(0);
    });

    it('distance to neighbors is 1', () => {
      expect(hexDistance({ q: 0, r: 0 }, { q: 1, r: 0 })).toBe(1);
      expect(hexDistance({ q: 0, r: 0 }, { q: 0, r: 1 })).toBe(1);
      expect(hexDistance({ q: 0, r: 0 }, { q: 1, r: -1 })).toBe(1);
    });

    it('known distances', () => {
      expect(hexDistance({ q: 0, r: 0 }, { q: 3, r: -3 })).toBe(3);
      expect(hexDistance({ q: 1, r: 1 }, { q: -2, r: 3 })).toBe(3);
    });

    it('is symmetric', () => {
      const a = { q: 2, r: -3 };
      const b = { q: -1, r: 4 };
      expect(hexDistance(a, b)).toBe(hexDistance(b, a));
    });
  });

  describe('hexCorners', () => {
    it('returns 6 corners', () => {
      const corners = hexCorners(0, 0, 32);
      expect(corners).toHaveLength(6);
    });

    it('corners are at the correct distance from center', () => {
      const size = 32;
      const corners = hexCorners(100, 200, size);
      for (const [cx, cy] of corners) {
        const dist = Math.sqrt((cx - 100) ** 2 + (cy - 200) ** 2);
        expect(dist).toBeCloseTo(size, 5);
      }
    });
  });

  describe('hexEq', () => {
    it('equal hexes are equal', () => {
      expect(hexEq({ q: 1, r: 2 }, { q: 1, r: 2 })).toBe(true);
    });

    it('different hexes are not equal', () => {
      expect(hexEq({ q: 1, r: 2 }, { q: 2, r: 1 })).toBe(false);
    });
  });

  describe('hexKey', () => {
    it('produces a string key', () => {
      expect(hexKey(3, -2)).toBe('3,-2');
    });

    it('different coordinates produce different keys', () => {
      expect(hexKey(1, 2)).not.toBe(hexKey(2, 1));
    });
  });
});
