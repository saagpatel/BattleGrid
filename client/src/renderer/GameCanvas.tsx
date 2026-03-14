/**
 * GameCanvas: React component that wraps an HTML5 Canvas with the full
 * rendering pipeline: hex grid, units, overlays, fog, and animations.
 *
 * Interaction chain:
 *   Mouse event → Camera.screenToWorld → pixelToHex → hex lookup → UI action
 */

import { useRef, useEffect, useCallback, useState } from 'react';
import { Camera } from './Camera.js';
import { HexRenderer } from './HexRenderer.js';
import type { HexCell } from './HexRenderer.js';
import { UnitRenderer } from './UnitRenderer.js';
import type { UnitRenderData } from './UnitRenderer.js';
import { OverlayRenderer } from './OverlayRenderer.js';
import { FogRenderer } from './FogRenderer.js';
import { AnimationEngine } from './AnimationEngine.js';
import { hexToPixel, pixelToHex } from './hexMath.js';
import type { HexCoord } from './hexMath.js';
import { useGameStore } from '../stores/gameStore.js';
import { useUIStore } from '../stores/uiStore.js';

/** Default hex size in world pixels. */
const HEX_SIZE = 32;

export interface GameCanvasProps {
  testId?: string;
  autoFit?: boolean;
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
  testId,
  autoFit = false,
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
  const [cameraDebug, setCameraDebug] = useState('{"x":0,"y":0,"zoom":1}');

  const selectedUnitId = useUIStore((s) => s.selectedUnitId);
  const hoveredHex = useUIStore((s) => s.hoveredHex);
  const setHoveredHex = useUIStore((s) => s.setHoveredHex);
  const phase = useGameStore((s) => s.phase);

  const syncCameraDebug = useCallback((camera: Camera | null) => {
    if (!camera) return;
    setCameraDebug(JSON.stringify(camera.getState()));
  }, []);

  // Initialize renderers once
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * devicePixelRatio;
    canvas.height = rect.height * devicePixelRatio;

    cameraRef.current = new Camera(canvas.width, canvas.height);
    syncCameraDebug(cameraRef.current);
    hexRendererRef.current = new HexRenderer(HEX_SIZE);
    unitRendererRef.current = new UnitRenderer(HEX_SIZE);
    overlayRendererRef.current = new OverlayRenderer(HEX_SIZE);
    fogRendererRef.current = new FogRenderer(HEX_SIZE);
    animEngineRef.current = new AnimationEngine(HEX_SIZE);

    return () => {
      cancelAnimationFrame(rafRef.current);
    };
  }, [syncCameraDebug]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const camera = cameraRef.current;
    if (!autoFit || !canvas || !camera || cells.length === 0) return;

    const centers = cells.map((cell) => hexToPixel(cell.q, cell.r, HEX_SIZE));
    const minX = Math.min(...centers.map((center) => center.x));
    const maxX = Math.max(...centers.map((center) => center.x));
    const minY = Math.min(...centers.map((center) => center.y));
    const maxY = Math.max(...centers.map((center) => center.y));
    const padding = HEX_SIZE * 2;

    const contentWidth = Math.max(maxX - minX + padding * 2, HEX_SIZE * 4);
    const contentHeight = Math.max(maxY - minY + padding * 2, HEX_SIZE * 4);
    const fitZoom = Math.min(
      canvas.width / contentWidth,
      canvas.height / contentHeight,
      1.75,
    );

    camera.setState({
      x: (minX + maxX) / 2,
      y: (minY + maxY) / 2,
      zoom: fitZoom,
    });
    syncCameraDebug(camera);
  }, [autoFit, cells, syncCameraDebug]);

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
        syncCameraDebug(cameraRef.current);
      }
    });
    observer.observe(canvas);

    return () => observer.disconnect();
  }, [syncCameraDebug]);

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
      data-testid={testId ?? 'game-canvas'}
      data-camera={cameraDebug}
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
