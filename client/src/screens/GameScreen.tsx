import { useCallback, useMemo, useEffect, useRef, useState } from 'react';
import { useGameStore } from '../stores/gameStore.js';
import { useUIStore } from '../stores/uiStore.js';
import { useConnectionStore } from '../stores/connectionStore.js';
import { GameCanvas } from '../renderer/GameCanvas.js';
import { AnimationEngine } from '../renderer/AnimationEngine.js';
import { queueSimEvents } from '../renderer/eventAnimator.js';
import { useWasmGame } from '../wasm/useWasmGame.js';
import { TurnBar } from '../components/hud/TurnBar.js';
import { UnitPicker } from '../components/hud/UnitPicker.js';
import { UnitPanel } from '../components/hud/UnitPanel.js';
import { ScoreBoard } from '../components/hud/ScoreBoard.js';
import { OrderList } from '../components/hud/OrderList.js';
import { GameLog } from '../components/hud/GameLog.js';
import { MiniMap } from '../components/hud/MiniMap.js';
import { CombatPreviewTooltip } from '../components/hud/combatPreview.js';
import { buildCombatPreview } from '../components/hud/combatPreviewData.js';
import { HelpOverlay } from '../components/HelpOverlay.js';
import { HelpCircle } from 'lucide-react';
import type { CombatPreviewData } from '../components/hud/combatPreview.js';
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
  const stateBytes = useGameStore((s) => s.stateBytes);
  const addOrder = useGameStore((s) => s.addOrder);
  const clearOrders = useGameStore((s) => s.clearOrders);

  const [showHelp, setShowHelp] = useState(false);

  const selectedUnitId = useUIStore((s) => s.selectedUnitId);
  const selectUnit = useUIStore((s) => s.selectUnit);
  const hoveredHex = useUIStore((s) => s.hoveredHex);
  const showFog = useUIStore((s) => s.showFog);
  const showGrid = useUIStore((s) => s.showGrid);

  const send = useConnectionStore((s) => s.send);
  const prevEventsRef = useRef(events);

  // WASM game bridge for pathfinding, LOS, combat preview
  const wasmGame = useWasmGame();

  // Animation state
  const animEngineRef = useRef(new AnimationEngine(32));
  const [isAnimating, setIsAnimating] = useState(false);

  // Log and animate resolution events when they arrive
  useEffect(() => {
    if (events !== prevEventsRef.current && events.length > 0) {
      const totalDuration = queueSimEvents(animEngineRef.current, events, units, turn);
      queueMicrotask(() => setIsAnimating(true));

      // Clear animating flag after all animations complete
      const timer = setTimeout(() => {
        setIsAnimating(false);
      }, Math.max(totalDuration, 100));

      prevEventsRef.current = events;
      return () => clearTimeout(timer);
    }
  }, [events, units, turn]);

  useEffect(() => {
    if (stateBytes) {
      wasmGame.updateState(stateBytes);
    }
  }, [stateBytes, wasmGame]);

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

  // Compute move range hexes for selected unit via WASM (fallback: empty)
  const moveRangeHexes: HexCoord[] = useMemo(() => {
    if (selectedUnitId === null || phase !== 'planning') return [];
    const selectedUnit = units.get(selectedUnitId);
    if (!selectedUnit || selectedUnit.owner !== playerId) return [];
    return wasmGame.getReachableHexes(selectedUnitId);
  }, [selectedUnitId, phase, units, playerId, wasmGame]);

  // Compute attack range hexes for selected unit
  const attackRangeHexes: HexCoord[] = useMemo(() => {
    if (selectedUnitId === null || phase !== 'planning') return [];
    const selectedUnit = units.get(selectedUnitId);
    if (!selectedUnit || selectedUnit.owner !== playerId) return [];
    return wasmGame.getAttackRangeHexes(
      selectedUnitId,
      selectedUnit.coord,
      selectedUnit.attackRange,
    );
  }, [selectedUnitId, phase, units, playerId, wasmGame]);

  // Compute visible hexes via WASM (fallback: show everything)
  const visibleHexes = useMemo(() => {
    if (playerId === null) return cells.map((c) => ({ q: c.q, r: c.r }));
    const wasmVisible = wasmGame.getVisibleHexes(playerId);
    if (wasmVisible.length > 0) return wasmVisible;
    // Fallback: show all hexes when WASM is not available
    return cells.map((c) => ({ q: c.q, r: c.r }));
  }, [cells, playerId, wasmGame]);

  const combatPreview = useMemo<{
    data: CombatPreviewData;
    screenX: number;
    screenY: number;
  } | null>(() => {
    if (selectedUnitId === null || hoveredHex === null || phase !== 'planning') {
      return null;
    }

    const attacker = units.get(selectedUnitId);
    if (!attacker || attacker.owner !== playerId) {
      return null;
    }

    let defender: typeof attacker | undefined;
    units.forEach((u) => {
      if (
        u.coord.q === hoveredHex.q &&
        u.coord.r === hoveredHex.r &&
        u.owner !== playerId &&
        u.hp > 0
      ) {
        defender = u;
      }
    });

    if (!defender) {
      return null;
    }

    const wasmPreview = wasmGame.previewCombat(attacker.id, defender.id);
    const [damage, counter] = wasmPreview
      ? [wasmPreview.damage_dealt, wasmPreview.counter_damage]
      : [Math.max(0, attacker.attack - defender.defense), Math.max(0, defender.attack - attacker.defense)];

    return {
      data: buildCombatPreview(attacker, defender, damage, counter),
      screenX: 0,
      screenY: 0,
    };
  }, [selectedUnitId, hoveredHex, phase, units, playerId, wasmGame]);

  const smokeMoveCandidate = useMemo(() => {
    if (phase !== 'planning' || playerId === null) return null;

    const occupied = new Set(
      [...units.values()].map((unit) => `${unit.coord.q},${unit.coord.r}`),
    );

    return [...units.values()]
      .filter((unit) => unit.owner === playerId && unit.hp > 0)
      .sort((a, b) => a.id - b.id)
      .map((unit) => {
        const target = wasmGame
          .getReachableHexes(unit.id)
          .find(
            (hex) =>
              !(hex.q === unit.coord.q && hex.r === unit.coord.r) &&
              !occupied.has(`${hex.q},${hex.r}`),
          );

        if (!target) return null;

        return {
          unitId: unit.id,
          from: unit.coord,
          to: target,
        };
      })
      .find(Boolean);
  }, [phase, playerId, units, wasmGame]);

  const gameSnapshot = useMemo(
    () =>
      JSON.stringify({
        phase,
        turn,
        playerId,
        selectedUnitId,
        moveRangeHexes,
        attackRangeHexes,
        smokeMoveCandidate,
        orders,
        units: [...units.values()]
          .map((unit) => ({
            id: unit.id,
            owner: unit.owner,
            hp: unit.hp,
            coord: unit.coord,
          }))
          .sort((a, b) => a.id - b.id),
      }),
    [
      phase,
      turn,
      playerId,
      selectedUnitId,
      moveRangeHexes,
      attackRangeHexes,
      smokeMoveCandidate,
      orders,
      units,
    ],
  );

  // Input is disabled during resolving phase and while animations play
  const inputDisabled = phase === 'resolving' || phase === 'finished' || isAnimating;

  // Handle left click on hex
  const handleHexClick = useCallback(
    (hex: HexCoord) => {
      if (inputDisabled) return;

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
    [inputDisabled, phase, unitRenderData, playerId, selectedUnitId, selectUnit, addOrder],
  );

  // Handle right click -- attack order or deselect
  const handleHexRightClick = useCallback(
    (hex: HexCoord) => {
      if (inputDisabled || phase !== 'planning') {
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
    [inputDisabled, phase, selectedUnitId, unitRenderData, playerId, addOrder, selectUnit],
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

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // ?: Show help
      if (e.key === '?' || e.key === 'F1') {
        e.preventDefault();
        setShowHelp(true);
      }
      // ESC: Deselect unit or close help
      if (e.key === 'Escape') {
        if (showHelp) {
          setShowHelp(false);
        } else {
          selectUnit(null);
        }
      }
      // Enter: Submit orders (if in planning phase and have orders)
      if (e.key === 'Enter' && phase === 'planning' && orders.length > 0 && !isAnimating) {
        handleSubmitOrders();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [phase, orders, isAnimating, showHelp, selectUnit, handleSubmitOrders]);

  return (
    <div data-testid="game-screen" className="flex h-screen flex-col bg-slate-900 text-white">
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
            moveRangeHexes={moveRangeHexes}
            attackRangeHexes={attackRangeHexes}
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

        {/* Resolving overlay */}
        {isAnimating && (
          <div className="pointer-events-none absolute inset-0 flex items-start justify-center pt-16">
            <div className="rounded-lg bg-slate-900/80 px-4 py-2">
              <span className="animate-pulse text-sm font-medium text-yellow-400">
                Resolving turn...
              </span>
            </div>
          </div>
        )}

        {/* HUD overlays */}
        <UnitPicker />
        <UnitPanel />
        <ScoreBoard />
        <OrderList />
        <GameLog />
        <MiniMap />

        {/* Combat preview tooltip */}
        {combatPreview && (
          <CombatPreviewTooltip
            preview={combatPreview.data}
            screenX={combatPreview.screenX}
            screenY={combatPreview.screenY}
          />
        )}

        {/* Help button */}
        <button
          onClick={() => setShowHelp(true)}
          className="absolute bottom-4 left-4 rounded-full bg-slate-800 p-3 text-slate-400 shadow-lg border border-slate-700 hover:bg-slate-700 hover:text-white transition-colors"
          aria-label="Show help"
          title="Keyboard shortcuts (? or F1)"
        >
          <HelpCircle className="h-5 w-5" />
        </button>
      </div>

      {/* Help overlay */}
      {showHelp && <HelpOverlay onClose={() => setShowHelp(false)} />}

      <pre data-testid="game-state" className="hidden">
        {gameSnapshot}
      </pre>
    </div>
  );
}
