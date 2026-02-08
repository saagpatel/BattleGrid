/**
 * GameCanvas: React component that wraps an HTML5 Canvas with the full
 * rendering pipeline: hex grid, units, overlays, fog, and animations.
 *
 * Interaction chain:
 *   Mouse event → Camera.screenToWorld → pixelToHex → hex lookup → UI action
 */

import { useRef, useEffect, useCallback } from 'react';
import { Camera } from './Camera.js';
import { HexRenderer } from './HexRenderer.js';
import type { HexCell } from './HexRenderer.js';
import { UnitRenderer } from './UnitRenderer.js';
import type { UnitRenderData } from './UnitRenderer.js';
import { OverlayRenderer } from './OverlayRenderer.js';
import { FogRenderer } from './FogRenderer.js';
import { AnimationEngine } from './AnimationEngine.js';
import { pixelToHex } from './hexMath.js';
import type { HexCoord } from './hexMath.js';
import { useGameStore } from '../stores/gameStore.js';
import { useUIStore } from '../stores/uiStore.js';

/** Default hex size in world pixels. */
const HEX_SIZE = 32;

export interface GameCanvasProps {
  cells: HexCell[];
  units: UnitRenderData[];
  visibleHexes: HexCoord[];
  lastSeenHexes: HexCoord[];
  moveRangeHexes: HexCoord[];
  attackRangeHexes: HexCoord[];
  pathPreview: HexCoord[];
  spawnZone: HexCoord[];
  showFog: boolean;
  showGrid: boolean;
  onHexClick: (hex: HexCoord) => void;
  onHexRightClick: (hex: HexCoord) => void;
}

export function GameCanvas({
  cells,
  units,
  visibleHexes,
  lastSeenHexes,
  moveRangeHexes,
  attackRangeHexes,
  pathPreview,
  spawnZone,
  showFog,
  showGrid,
  onHexClick,
  onHexRightClick,
}: GameCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cameraRef = useRef<Camera | null>(null);
  const hexRendererRef = useRef<HexRenderer | null>(null);
  const unitRendererRef = useRef<UnitRenderer | null>(null);
  const overlayRendererRef = useRef<OverlayRenderer | null>(null);
  const fogRendererRef = useRef<FogRenderer | null>(null);
  const animEngineRef = useRef<AnimationEngine | null>(null);
  const rafRef = useRef<number>(0);
  const isDraggingRef = useRef(false);
  const lastMouseRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const selectedUnitId = useUIStore((s) => s.selectedUnitId);
  const hoveredHex = useUIStore((s) => s.hoveredHex);
  const setHoveredHex = useUIStore((s) => s.setHoveredHex);
  const phase = useGameStore((s) => s.phase);

  // Initialize renderers once
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * devicePixelRatio;
    canvas.height = rect.height * devicePixelRatio;

    cameraRef.current = new Camera(canvas.width, canvas.height);
    hexRendererRef.current = new HexRenderer(HEX_SIZE);
    unitRendererRef.current = new UnitRenderer(HEX_SIZE);
    overlayRendererRef.current = new OverlayRenderer(HEX_SIZE);
    fogRendererRef.current = new FogRenderer(HEX_SIZE);
    animEngineRef.current = new AnimationEngine(HEX_SIZE);

    return () => {
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // Handle resize
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        canvas.width = width * devicePixelRatio;
        canvas.height = height * devicePixelRatio;
        cameraRef.current?.setViewport(canvas.width, canvas.height);
      }
    });
    observer.observe(canvas);

    return () => observer.disconnect();
  }, []);

  // Render loop
  useEffect(() => {
    const render = () => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      const camera = cameraRef.current;

      if (!canvas || !ctx || !camera) {
        rafRef.current = requestAnimationFrame(render);
        return;
      }

      const now = performance.now();

      // Clear canvas
      camera.resetTransform(ctx);
      ctx.fillStyle = '#0f0f19';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Apply camera transform for world-space rendering
      camera.applyTransform(ctx);

      // 1. Hex grid (terrain)
      hexRendererRef.current?.draw(ctx, cells, camera, showGrid);

      // 2. Overlays (under units)
      const overlay = overlayRendererRef.current;
      if (overlay) {
        if (spawnZone.length > 0 && phase === 'deploying') {
          overlay.drawSpawnZone(ctx, spawnZone);
        }
        if (moveRangeHexes.length > 0) {
          overlay.drawMoveRange(ctx, moveRangeHexes);
        }
        if (attackRangeHexes.length > 0) {
          overlay.drawAttackRange(ctx, attackRangeHexes);
        }
        if (pathPreview.length > 0) {
          overlay.drawPath(ctx, pathPreview);
        }
        if (hoveredHex) {
          overlay.drawHoveredHex(ctx, hoveredHex);
        }
        if (selectedUnitId !== null) {
          // Find the selected unit's hex to highlight
          const selectedUnit = units.find((u) => u.id === selectedUnitId);
          if (selectedUnit) {
            overlay.drawSelectedHex(ctx, { q: selectedUnit.q, r: selectedUnit.r });
          }
        }
      }

      // 3. Units
      const animEngine = animEngineRef.current;
      if (unitRendererRef.current) {
        unitRendererRef.current.draw(ctx, units, selectedUnitId, animEngine, now);
      }

      // 4. Animations (attack effects, damage numbers)
      animEngine?.draw(ctx, now);

      // 5. Fog of war
      if (showFog && fogRendererRef.current) {
        const allHexes = cells.map((c) => ({ q: c.q, r: c.r }));
        fogRendererRef.current.draw(ctx, allHexes, visibleHexes, lastSeenHexes);
      }

      rafRef.current = requestAnimationFrame(render);
    };

    rafRef.current = requestAnimationFrame(render);
    return () => cancelAnimationFrame(rafRef.current);
  }, [
    cells,
    units,
    visibleHexes,
    lastSeenHexes,
    moveRangeHexes,
    attackRangeHexes,
    pathPreview,
    spawnZone,
    showFog,
    showGrid,
    hoveredHex,
    selectedUnitId,
    phase,
  ]);

  // Mouse handlers
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button === 0) {
      isDraggingRef.current = false;
      lastMouseRef.current = { x: e.clientX, y: e.clientY };
    }
  }, []);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      const camera = cameraRef.current;
      if (!canvas || !camera) return;

      const rect = canvas.getBoundingClientRect();
      const screenX = (e.clientX - rect.left) * devicePixelRatio;
      const screenY = (e.clientY - rect.top) * devicePixelRatio;

      // Update hovered hex
      const world = camera.screenToWorld(screenX, screenY);
      const hex = pixelToHex(world.x, world.y, HEX_SIZE);
      setHoveredHex(hex);

      // Handle panning
      if (e.buttons === 1) {
        const dx = e.clientX - lastMouseRef.current.x;
        const dy = e.clientY - lastMouseRef.current.y;

        if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
          isDraggingRef.current = true;
        }

        camera.pan(dx * devicePixelRatio, dy * devicePixelRatio);
        lastMouseRef.current = { x: e.clientX, y: e.clientY };
      }
    },
    [setHoveredHex],
  );

  const handleMouseUp = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (e.button === 0 && !isDraggingRef.current) {
        const canvas = canvasRef.current;
        const camera = cameraRef.current;
        if (!canvas || !camera) return;

        const rect = canvas.getBoundingClientRect();
        const screenX = (e.clientX - rect.left) * devicePixelRatio;
        const screenY = (e.clientY - rect.top) * devicePixelRatio;
        const world = camera.screenToWorld(screenX, screenY);
        const hex = pixelToHex(world.x, world.y, HEX_SIZE);
        onHexClick(hex);
      }
      isDraggingRef.current = false;
    },
    [onHexClick],
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      const canvas = canvasRef.current;
      const camera = cameraRef.current;
      if (!canvas || !camera) return;

      const rect = canvas.getBoundingClientRect();
      const screenX = (e.clientX - rect.left) * devicePixelRatio;
      const screenY = (e.clientY - rect.top) * devicePixelRatio;
      const world = camera.screenToWorld(screenX, screenY);
      const hex = pixelToHex(world.x, world.y, HEX_SIZE);
      onHexRightClick(hex);
    },
    [onHexRightClick],
  );

  const handleWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    const camera = cameraRef.current;
    if (!canvas || !camera) return;

    const rect = canvas.getBoundingClientRect();
    const screenX = (e.clientX - rect.left) * devicePixelRatio;
    const screenY = (e.clientY - rect.top) * devicePixelRatio;

    // Positive deltaY = scroll down = zoom out
    camera.zoomAt(screenX, screenY, -e.deltaY);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setHoveredHex(null);
    isDraggingRef.current = false;
  }, [setHoveredHex]);

  return (
    <canvas
      ref={canvasRef}
      className="h-full w-full cursor-crosshair"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onContextMenu={handleContextMenu}
      onWheel={handleWheel}
      onMouseLeave={handleMouseLeave}
    />
  );
}
