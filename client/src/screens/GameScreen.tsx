import { useCallback, useMemo } from 'react';
import { useGameStore } from '../stores/gameStore.js';
import { useUIStore } from '../stores/uiStore.js';
import { useConnectionStore } from '../stores/connectionStore.js';
import { GameCanvas } from '../renderer/GameCanvas.js';
import { Timer } from '../components/Timer.js';
import { Button } from '../components/Button.js';
import type { HexCoord } from '../renderer/hexMath.js';
import type { HexCell } from '../renderer/HexRenderer.js';
import type { UnitRenderData } from '../renderer/UnitRenderer.js';

export function GameScreen() {
  const phase = useGameStore((s) => s.phase);
  const turn = useGameStore((s) => s.turn);
  const winner = useGameStore((s) => s.winner);
  const grid = useGameStore((s) => s.grid);
  const units = useGameStore((s) => s.units);
  const orders = useGameStore((s) => s.orders);
  const playerId = useGameStore((s) => s.playerId);
  const spawnZone = useGameStore((s) => s.spawnZone);
  const turnTimerMs = useGameStore((s) => s.turnTimerMs);
  const addOrder = useGameStore((s) => s.addOrder);
  const clearOrders = useGameStore((s) => s.clearOrders);

  const selectedUnitId = useUIStore((s) => s.selectedUnitId);
  const selectUnit = useUIStore((s) => s.selectUnit);
  const showFog = useUIStore((s) => s.showFog);
  const showGrid = useUIStore((s) => s.showGrid);

  const send = useConnectionStore((s) => s.send);

  // Convert grid cells to renderer format
  const cells: HexCell[] = useMemo(() => {
    if (!grid) return [];
    return grid.cells.map((c) => ({
      q: c.coord.q,
      r: c.coord.r,
      terrain: c.terrain,
    }));
  }, [grid]);

  // Convert units Map to renderer array
  const unitRenderData: UnitRenderData[] = useMemo(() => {
    const result: UnitRenderData[] = [];
    units.forEach((u) => {
      result.push({
        id: u.id,
        owner: u.owner,
        unitType: u.unitClass,
        hp: u.hp,
        maxHp: u.maxHp,
        q: u.coord.q,
        r: u.coord.r,
      });
    });
    return result;
  }, [units]);

  // Visible hexes — for now, show everything (WASM integration for LOS in Phase 7)
  const visibleHexes = useMemo(() => cells.map((c) => ({ q: c.q, r: c.r })), [cells]);

  // Handle left click on hex
  const handleHexClick = useCallback(
    (hex: HexCoord) => {
      if (phase === 'finished') return;

      // Check if there's a friendly unit at this hex
      const unitAtHex = unitRenderData.find(
        (u) => u.q === hex.q && u.r === hex.r && u.owner === playerId && u.hp > 0,
      );

      if (unitAtHex) {
        selectUnit(unitAtHex.id);
      } else if (selectedUnitId !== null && phase === 'planning') {
        // Issue a move order to the clicked hex
        addOrder({
          unitId: selectedUnitId,
          orderType: 'move',
          target: hex,
        });
      } else {
        selectUnit(null);
      }
    },
    [phase, unitRenderData, playerId, selectedUnitId, selectUnit, addOrder],
  );

  // Handle right click — attack order
  const handleHexRightClick = useCallback(
    (hex: HexCoord) => {
      if (phase !== 'planning' || selectedUnitId === null) return;

      // Check if there's an enemy unit at this hex
      const enemyAtHex = unitRenderData.find(
        (u) => u.q === hex.q && u.r === hex.r && u.owner !== playerId && u.hp > 0,
      );

      if (enemyAtHex) {
        addOrder({
          unitId: selectedUnitId,
          orderType: 'attack',
          target: hex,
        });
      }
    },
    [phase, selectedUnitId, unitRenderData, playerId, addOrder],
  );

  const handleSubmitOrders = useCallback(() => {
    send({ type: 'SubmitOrders', turn, orders });
    clearOrders();
  }, [send, turn, orders, clearOrders]);

  const handleAutoSubmit = useCallback(() => {
    if (orders.length > 0) {
      send({ type: 'SubmitOrders', turn, orders });
      clearOrders();
    }
  }, [send, turn, orders, clearOrders]);

  return (
    <div className="flex h-screen flex-col bg-slate-900 text-white">
      {/* Top bar: turn info, timer, phase */}
      <div className="flex items-center justify-between border-b border-slate-700 bg-slate-800 px-4 py-2">
        <div className="flex items-center gap-4">
          <span className="text-lg font-bold">Turn {turn}</span>
          <span className="rounded bg-slate-700 px-2 py-0.5 text-sm capitalize text-slate-300">
            {phase}
          </span>
        </div>

        {phase === 'planning' && (
          <div className="flex items-center gap-4">
            <Timer durationMs={turnTimerMs} onExpire={handleAutoSubmit} />
            <Button size="sm" onClick={handleSubmitOrders}>
              Submit Orders ({orders.length})
            </Button>
          </div>
        )}

        {phase === 'resolving' && (
          <span className="animate-pulse text-sm text-yellow-400">
            Resolving turn...
          </span>
        )}

        {winner !== null && (
          <span className="text-lg font-semibold text-yellow-400">
            Player {winner} wins!
          </span>
        )}
      </div>

      {/* Canvas area */}
      <div className="relative flex-1">
        {cells.length > 0 ? (
          <GameCanvas
            cells={cells}
            units={unitRenderData}
            visibleHexes={visibleHexes}
            lastSeenHexes={[]}
            moveRangeHexes={[]}
            attackRangeHexes={[]}
            pathPreview={[]}
            spawnZone={spawnZone}
            showFog={showFog}
            showGrid={showGrid}
            onHexClick={handleHexClick}
            onHexRightClick={handleHexRightClick}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-slate-500">
            Waiting for game data...
          </div>
        )}

        {/* Selected unit info (bottom-left overlay) */}
        {selectedUnitId !== null && (
          <div className="absolute bottom-4 left-4 rounded-lg border border-slate-700 bg-slate-800/90 p-3">
            {(() => {
              const u = units.get(selectedUnitId);
              if (!u) return null;
              return (
                <div className="text-sm">
                  <div className="mb-1 font-semibold capitalize">{u.unitClass}</div>
                  <div className="text-slate-400">
                    HP: {u.hp}/{u.maxHp} | ATK: {u.attack} | DEF: {u.defense}
                  </div>
                  <div className="text-slate-400">
                    Move: {u.moveRange} | Range: {u.attackRange}
                  </div>
                  {orders.find((o) => o.unitId === selectedUnitId) && (
                    <div className="mt-1 text-xs text-indigo-400">
                      Order: {orders.find((o) => o.unitId === selectedUnitId)?.orderType}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        )}
      </div>
    </div>
  );
}
