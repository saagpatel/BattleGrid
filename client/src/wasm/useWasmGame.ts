/**
 * Hook that manages a WasmGame instance on the client side.
 * Provides reachable hexes, attack range, combat preview, fog of war,
 * and order validation via WASM when available.
 *
 * Falls back gracefully when WASM is not loaded.
 */

import { useRef, useCallback } from 'react';
import { getWasm } from './loader.js';
import type { ReachableHex, CombatPreview } from './types.js';
import type { HexCoord } from '../types/game.js';

/**
 * Opaque handle to the WasmGame instance.
 * We store the raw JS object returned by `new WasmGame(stateBytes)`.
 */
interface WasmGameHandle {
  reachable_hexes(unit_id: number): ReachableHex[];
  visible_hexes_for_player(player_id: number): HexCoord[];
  preview_combat(attacker_id: number, defender_id: number): CombatPreview;
  validate_order(order_bytes: Uint8Array, player_id: number): boolean;
  find_path(unit_id: number, target_q: number, target_r: number): { path: HexCoord[]; cost: number };
  update_state(state_bytes: Uint8Array): void;
}

export interface WasmGameApi {
  /** Initialize or update the game state from server-provided bytes. */
  updateState: (stateBytes: Uint8Array) => boolean;
  /** Get reachable hexes for a unit. Returns empty array if WASM unavailable. */
  getReachableHexes: (unitId: number) => HexCoord[];
  /** Get attack range hexes for a unit based on its stats. */
  getAttackRangeHexes: (unitId: number, unitCoord: HexCoord, attackRange: number) => HexCoord[];
  /** Get visible hexes for a player. Returns empty if WASM unavailable. */
  getVisibleHexes: (playerId: number) => HexCoord[];
  /** Preview combat between attacker and defender. Returns null if unavailable. */
  previewCombat: (attackerId: number, defenderId: number) => CombatPreview | null;
  /** Whether the WASM game is loaded and ready. */
  isReady: () => boolean;
}

/**
 * Generates all hexes within `range` steps of `center` using axial coordinates.
 * This is a pure-TS fallback for attack range visualization that doesn't need
 * the WASM game state.
 */
function hexesInRange(center: HexCoord, range: number): HexCoord[] {
  const results: HexCoord[] = [];
  for (let dq = -range; dq <= range; dq++) {
    for (let dr = Math.max(-range, -dq - range); dr <= Math.min(range, -dq + range); dr++) {
      if (dq === 0 && dr === 0) continue;
      results.push({ q: center.q + dq, r: center.r + dr });
    }
  }
  return results;
}

export function useWasmGame(): WasmGameApi {
  const gameRef = useRef<WasmGameHandle | null>(null);

  const updateState = useCallback((stateBytes: Uint8Array): boolean => {
    const wasm = getWasm() as Record<string, unknown> | null;
    if (!wasm) return false;

    try {
      if (gameRef.current) {
        gameRef.current.update_state(stateBytes);
      } else {
        // WasmGame constructor — must be accessed from the module
        const WasmGame = wasm['WasmGame'] as { new(bytes: Uint8Array): WasmGameHandle } | undefined;
        if (!WasmGame) return false;
        gameRef.current = new WasmGame(stateBytes);
      }
      return true;
    } catch (err) {
      console.warn('Failed to update WASM game state:', err);
      return false;
    }
  }, []);

  const getReachableHexes = useCallback((unitId: number): HexCoord[] => {
    if (!gameRef.current) return [];
    try {
      const result = gameRef.current.reachable_hexes(unitId);
      return result.map((rh) => rh.hex);
    } catch {
      return [];
    }
  }, []);

  const getAttackRangeHexes = useCallback(
    (_unitId: number, unitCoord: HexCoord, attackRange: number): HexCoord[] => {
      return hexesInRange(unitCoord, attackRange);
    },
    [],
  );

  const getVisibleHexes = useCallback((playerId: number): HexCoord[] => {
    if (!gameRef.current) return [];
    try {
      return gameRef.current.visible_hexes_for_player(playerId);
    } catch {
      return [];
    }
  }, []);

  const previewCombat = useCallback(
    (attackerId: number, defenderId: number): CombatPreview | null => {
      if (!gameRef.current) return null;
      try {
        return gameRef.current.preview_combat(attackerId, defenderId);
      } catch {
        return null;
      }
    },
    [],
  );

  const isReady = useCallback((): boolean => {
    return gameRef.current !== null;
  }, []);

  return {
    updateState,
    getReachableHexes,
    getAttackRangeHexes,
    getVisibleHexes,
    previewCombat,
    isReady,
  };
}
