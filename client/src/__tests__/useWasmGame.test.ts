import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useWasmGame } from '../wasm/useWasmGame.js';

describe('useWasmGame', () => {
  it('returns a stable API object', () => {
    const { result } = renderHook(() => useWasmGame());
    expect(result.current.updateState).toBeTypeOf('function');
    expect(result.current.getReachableHexes).toBeTypeOf('function');
    expect(result.current.getAttackRangeHexes).toBeTypeOf('function');
    expect(result.current.getVisibleHexes).toBeTypeOf('function');
    expect(result.current.previewCombat).toBeTypeOf('function');
    expect(result.current.isReady).toBeTypeOf('function');
  });

  it('isReady returns false when WASM not loaded', () => {
    const { result } = renderHook(() => useWasmGame());
    expect(result.current.isReady()).toBe(false);
  });

  it('getReachableHexes returns empty when WASM not loaded', () => {
    const { result } = renderHook(() => useWasmGame());
    expect(result.current.getReachableHexes(1)).toEqual([]);
  });

  it('getVisibleHexes returns empty when WASM not loaded', () => {
    const { result } = renderHook(() => useWasmGame());
    expect(result.current.getVisibleHexes(0)).toEqual([]);
  });

  it('previewCombat returns null when WASM not loaded', () => {
    const { result } = renderHook(() => useWasmGame());
    expect(result.current.previewCombat(1, 2)).toBeNull();
  });

  it('getAttackRangeHexes generates correct hexes in range', () => {
    const { result } = renderHook(() => useWasmGame());
    const hexes = result.current.getAttackRangeHexes(1, { q: 0, r: 0 }, 1);
    // Range 1 from origin should return 6 neighbors
    expect(hexes).toHaveLength(6);
    // All should be distance 1 from origin
    for (const h of hexes) {
      const dist = (Math.abs(h.q) + Math.abs(h.r) + Math.abs(-h.q - h.r)) / 2;
      expect(dist).toBe(1);
    }
  });

  it('getAttackRangeHexes range 2 generates correct count', () => {
    const { result } = renderHook(() => useWasmGame());
    const hexes = result.current.getAttackRangeHexes(1, { q: 0, r: 0 }, 2);
    // Range 2 from origin: 6 at distance 1 + 12 at distance 2 = 18
    expect(hexes).toHaveLength(18);
  });

  it('updateState returns false when WASM not loaded', () => {
    const { result } = renderHook(() => useWasmGame());
    const success = result.current.updateState(new Uint8Array([1, 2, 3]));
    expect(success).toBe(false);
  });
});
