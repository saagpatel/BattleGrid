import { useCallback, useMemo, useEffect, useRef } from 'react';
import { useGameStore } from '../stores/gameStore.js';
import { useUIStore } from '../stores/uiStore.js';
import { useConnectionStore } from '../stores/connectionStore.js';
import { GameCanvas } from '../renderer/GameCanvas.js';
import { AnimationEngine } from '../renderer/AnimationEngine.js';
import { queueSimEvents } from '../renderer/eventAnimator.js';
import { TurnBar } from '../components/hud/TurnBar.js';
import { UnitPanel } from '../components/hud/UnitPanel.js';
import { ScoreBoard } from '../components/hud/ScoreBoard.js';
import { OrderList } from '../components/hud/OrderList.js';
import { GameLog } from '../components/hud/GameLog.js';
import { MiniMap } from '../components/hud/MiniMap.js';
import type { HexCoord } from '../renderer/hexMath.js';
import type { HexCell } from '../renderer/HexRenderer.js';
import type { UnitRenderData } from '../renderer/UnitRenderer.js';

export function GameScreen() {
  const phase = useGameStore((s) => s.phase);
  const turn = useGameStore((s) => s.turn);
  const grid = useGameStore((s) => s.grid);
  const units = useGameStore((s) => s.units);
  const orders = useGameStore((s) => s.orders);
  const playerId = useGameStore((s) => s.playerId);
  const spawnZone = useGameStore((s) => s.spawnZone);
  const events = useGameStore((s) => s.events);
  const addOrder = useGameStore((s) => s.addOrder);
  const clearOrders = useGameStore((s) => s.clearOrders);

  const selectedUnitId = useUIStore((s) => s.selectedUnitId);
  const selectUnit = useUIStore((s) => s.selectUnit);
  const showFog = useUIStore((s) => s.showFog);
  const showGrid = useUIStore((s) => s.showGrid);

  const send = useConnectionStore((s) => s.send);
  const prevEventsRef = useRef(events);

  // Temporary animation engine for event logging
  // In a full implementation, GameCanvas would expose its engine via ref
  const animEngineRef = useRef(new AnimationEngine(32));

  // Log resolution events when they arrive
  useEffect(() => {
    if (events !== prevEventsRef.current && events.length > 0) {
      queueSimEvents(animEngineRef.current, events, units, turn);
      prevEventsRef.current = events;
    }
  }, [events, units, turn]);

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

  // Visible hexes — show everything for now
  const visibleHexes = useMemo(() => cells.map((c) => ({ q: c.q, r: c.r })), [cells]);

  // Handle left click on hex
  const handleHexClick = useCallback(
    (hex: HexCoord) => {
      if (phase === 'finished' || phase === 'resolving') return;

      const unitAtHex = unitRenderData.find(
        (u) => u.q === hex.q && u.r === hex.r && u.owner === playerId && u.hp > 0,
      );

      if (unitAtHex) {
        selectUnit(unitAtHex.id);
      } else if (selectedUnitId !== null && phase === 'planning') {
        addOrder({ unitId: selectedUnitId, orderType: 'move', target: hex });
      } else {
        selectUnit(null);
      }
    },
    [phase, unitRenderData, playerId, selectedUnitId, selectUnit, addOrder],
  );

  // Handle right click — attack order or deselect
  const handleHexRightClick = useCallback(
    (hex: HexCoord) => {
      if (phase !== 'planning') {
        selectUnit(null);
        return;
      }

      if (selectedUnitId === null) {
        selectUnit(null);
        return;
      }

      const enemyAtHex = unitRenderData.find(
        (u) => u.q === hex.q && u.r === hex.r && u.owner !== playerId && u.hp > 0,
      );

      if (enemyAtHex) {
        addOrder({ unitId: selectedUnitId, orderType: 'attack', target: hex });
      } else {
        selectUnit(null);
      }
    },
    [phase, selectedUnitId, unitRenderData, playerId, addOrder, selectUnit],
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
      {/* Top bar */}
      <TurnBar onSubmitOrders={handleSubmitOrders} onAutoSubmit={handleAutoSubmit} />

      {/* Main game area */}
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

        {/* HUD overlays */}
        <UnitPanel />
        <ScoreBoard />
        <OrderList />
        <GameLog />
        <MiniMap />
      </div>
    </div>
  );
}
