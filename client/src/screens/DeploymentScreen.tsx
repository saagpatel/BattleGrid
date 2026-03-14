import { useState, useCallback, useMemo } from 'react';
import { Button } from '../components/Button.js';
import { Timer } from '../components/Timer.js';
import { useGameStore } from '../stores/gameStore.js';
import { useConnectionStore } from '../stores/connectionStore.js';
import { GameCanvas } from '../renderer/GameCanvas.js';
import type { HexCell } from '../renderer/HexRenderer.js';
import type { UnitRenderData } from '../renderer/UnitRenderer.js';
import type { DeployOrder, UnitClass, HexCoord } from '../types/game.js';

/** Formats a unit class name for display */
function formatUnitClass(uc: UnitClass): string {
  return uc.charAt(0).toUpperCase() + uc.slice(1);
}

/** Simple hex coordinate equality check */
function hexEq(a: HexCoord, b: HexCoord): boolean {
  return a.q === b.q && a.r === b.r;
}

export function DeploymentScreen() {
  const spawnZone = useGameStore((s) => s.spawnZone);
  const availableUnits = useGameStore((s) => s.availableUnits);
  const turnTimerMs = useGameStore((s) => s.turnTimerMs);
  const send = useConnectionStore((s) => s.send);

  const [deployments, setDeployments] = useState<DeployOrder[]>([]);
  const [selectedClass, setSelectedClass] = useState<UnitClass | null>(null);

  // Track which unit classes have been placed
  const placedClasses = deployments.map((d) => d.unitClass);
  const remainingUnits = availableUnits.filter((uc, i) => {
    // Count how many of this class are in available vs placed
    const availCount = availableUnits.filter((u) => u === uc).length;
    const placedCount = placedClasses.filter((u) => u === uc).length;
    // Only filter out if this specific index has been "consumed"
    const priorAvail = availableUnits.slice(0, i).filter((u) => u === uc).length;
    return priorAvail < availCount - placedCount;
  });

  const allPlaced = deployments.length >= availableUnits.length;
  const deploymentSnapshot = useMemo(
    () =>
      JSON.stringify({
        spawnZone,
        availableUnits,
        deployments,
        allPlaced,
      }),
    [spawnZone, availableUnits, deployments, allPlaced],
  );

  // Create cells for the spawn zone hexes
  const cells = useMemo<HexCell[]>(() => {
    return spawnZone.map((hex) => ({
      q: hex.q,
      r: hex.r,
      terrain: 'Plains' as const,
    }));
  }, [spawnZone]);

  // Create unit render data from deployments
  const units = useMemo<UnitRenderData[]>(() => {
    return deployments.map((deploy, i) => ({
      id: i,
      unitType: deploy.unitClass,
      owner: 0,
      q: deploy.coord.q,
      r: deploy.coord.r,
      hp: 100,
      maxHp: 100,
    }));
  }, [deployments]);

  const handleHexClick = useCallback(
    (hex: HexCoord) => {
      if (!selectedClass) return;

      // Don't place on an already-occupied hex
      if (deployments.some((d) => hexEq(d.coord, hex))) return;

      setDeployments((prev) => [...prev, { unitClass: selectedClass, coord: hex }]);
      setSelectedClass(null);
    },
    [selectedClass, deployments],
  );

  const handleUndoLast = useCallback(() => {
    setDeployments((prev) => prev.slice(0, -1));
  }, []);

  const handleSubmit = useCallback(() => {
    send({ type: 'Deploy', orders: deployments });
  }, [send, deployments]);

  const handleAutoSubmit = useCallback(() => {
    // Auto-submit whatever is placed when timer expires
    if (deployments.length > 0) {
      send({ type: 'Deploy', orders: deployments });
    }
  }, [send, deployments]);

  return (
    <div data-testid="deployment-screen" className="flex min-h-screen flex-col items-center bg-slate-900 p-6 text-white">
      <div className="mb-4 flex items-center gap-4">
        <h1 className="text-2xl font-bold">Deploy Your Units</h1>
        <Timer key={turnTimerMs} durationMs={turnTimerMs} onExpire={handleAutoSubmit} />
      </div>

      <p className="mb-6 text-sm text-slate-400">
        Select a unit type, then click a spawn hex to place it.
      </p>

      <div className="flex gap-8">
        {/* Unit palette */}
        <div className="w-48">
          <h2 className="mb-2 text-sm font-semibold text-slate-400">Units</h2>
          <div className="space-y-1">
            {availableUnits.map((uc, i) => {
              const isPlaced = i < deployments.length && deployments[i]?.unitClass === uc;
              const idx = `${uc}-${i}`;
              return (
                <button
                  key={idx}
                  data-testid={`deploy-unit-${i}`}
                  onClick={() => setSelectedClass(uc)}
                  disabled={isPlaced}
                  className={`w-full rounded px-3 py-2 text-left text-sm transition-colors ${
                    selectedClass === uc
                      ? 'bg-indigo-600 text-white'
                      : isPlaced
                        ? 'bg-slate-800 text-slate-500 line-through'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  {formatUnitClass(uc)}
                </button>
              );
            })}
          </div>

          {remainingUnits.length === 0 && deployments.length > 0 && (
            <p className="mt-2 text-xs text-green-400">All units placed!</p>
          )}
        </div>

        {/* Spawn zone hex canvas */}
        <div className="relative" style={{ width: '600px', height: '500px' }}>
          <h2 className="mb-2 text-sm font-semibold text-slate-400">Spawn Zone</h2>
          <GameCanvas
            testId="deployment-canvas"
            autoFit={true}
            cells={cells}
            units={units}
            visibleHexes={spawnZone}
            lastSeenHexes={[]}
            moveRangeHexes={[]}
            attackRangeHexes={[]}
            pathPreview={[]}
            spawnZone={spawnZone}
            showFog={false}
            showGrid={true}
            onHexClick={handleHexClick}
            onHexRightClick={() => {}}
          />
        </div>
      </div>

      {/* Actions */}
      <div className="mt-6 flex gap-3">
        <Button data-testid="undo-deployment" variant="ghost" onClick={handleUndoLast} disabled={deployments.length === 0}>
          Undo
        </Button>
        <Button data-testid="submit-deployment" onClick={handleSubmit} disabled={!allPlaced}>
          {allPlaced ? 'Deploy!' : `Place ${availableUnits.length - deployments.length} more`}
        </Button>
      </div>

      <pre data-testid="deployment-state" className="hidden">
        {deploymentSnapshot}
      </pre>
    </div>
  );
}
