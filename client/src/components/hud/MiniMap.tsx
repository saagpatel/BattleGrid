import { useRef, useEffect, useMemo, useCallback } from 'react';
import { useGameStore } from '../../stores/gameStore.js';
import { useUIStore } from '../../stores/uiStore.js';
import { hexToPixel } from '../../renderer/hexMath.js';
import { TERRAIN_COLORS, PLAYER_COLORS } from '../../renderer/colors.js';

const MINI_HEX_SIZE = 4;
const MINI_MAP_SIZE = 140;

/** Real hex size used in the main canvas renderer. */
const WORLD_HEX_SIZE = 32;

export function MiniMap() {
  const grid = useGameStore((s) => s.grid);
  const units = useGameStore((s) => s.units);
  const cameraX = useUIStore((s) => s.cameraX);
  const cameraY = useUIStore((s) => s.cameraY);
  const cameraZoom = useUIStore((s) => s.cameraZoom);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Compute bounding box of all hexes in minimap space
  const bounds = useMemo(() => {
    if (!grid) return null;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const cell of grid.cells) {
      const p = hexToPixel(cell.coord.q, cell.coord.r, MINI_HEX_SIZE);
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
    const pad = MINI_HEX_SIZE * 2;
    return { minX: minX - pad, maxX: maxX + pad, minY: minY - pad, maxY: maxY + pad };
  }, [grid]);

  // Compute bounding box of all hexes in world space (for camera viewport mapping)
  const worldBounds = useMemo(() => {
    if (!grid) return null;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const cell of grid.cells) {
      const p = hexToPixel(cell.coord.q, cell.coord.r, WORLD_HEX_SIZE);
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
    const pad = WORLD_HEX_SIZE * 2;
    return { minX: minX - pad, maxX: maxX + pad, minY: minY - pad, maxY: maxY + pad };
  }, [grid]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !grid || !bounds || !worldBounds) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio;
    canvas.width = MINI_MAP_SIZE * dpr;
    canvas.height = MINI_MAP_SIZE * dpr;
    ctx.scale(dpr, dpr);

    const rangeX = bounds.maxX - bounds.minX;
    const rangeY = bounds.maxY - bounds.minY;
    const scale = Math.min(MINI_MAP_SIZE / rangeX, MINI_MAP_SIZE / rangeY);
    const offsetX = (MINI_MAP_SIZE - rangeX * scale) / 2;
    const offsetY = (MINI_MAP_SIZE - rangeY * scale) / 2;

    const toScreen = (wx: number, wy: number) => ({
      x: (wx - bounds.minX) * scale + offsetX,
      y: (wy - bounds.minY) * scale + offsetY,
    });

    // Clear
    ctx.fillStyle = '#0f0f19';
    ctx.fillRect(0, 0, MINI_MAP_SIZE, MINI_MAP_SIZE);

    // Draw terrain dots
    for (const cell of grid.cells) {
      const p = hexToPixel(cell.coord.q, cell.coord.r, MINI_HEX_SIZE);
      const s = toScreen(p.x, p.y);
      const terrainKey = cell.terrain.charAt(0).toUpperCase() + cell.terrain.slice(1);
      ctx.fillStyle = TERRAIN_COLORS[terrainKey] ?? TERRAIN_COLORS['Plains'];
      ctx.fillRect(s.x - 2, s.y - 2, 4, 4);
    }

    // Draw unit dots
    units.forEach((u) => {
      if (u.hp <= 0) return;
      const p = hexToPixel(u.coord.q, u.coord.r, MINI_HEX_SIZE);
      const s = toScreen(p.x, p.y);
      ctx.beginPath();
      ctx.arc(s.x, s.y, 3, 0, Math.PI * 2);
      ctx.fillStyle = PLAYER_COLORS[u.owner] ?? PLAYER_COLORS[0];
      ctx.fill();
    });

    // Draw camera viewport rectangle
    // The camera stores an offset in screen pixels. We need to convert to
    // the minimap's coordinate system.
    // Camera center in world coords: the camera pans by translating, so
    // the world-space center visible on the main canvas is approximately
    // (-cameraX / cameraZoom, -cameraY / cameraZoom).
    // Viewport size in world coords depends on the main canvas size and zoom.
    // We estimate using a reasonable default viewport (e.g., 800x600 CSS pixels).
    const viewportW = 800 * devicePixelRatio;
    const viewportH = 600 * devicePixelRatio;

    const worldCenterX = -cameraX / cameraZoom;
    const worldCenterY = -cameraY / cameraZoom;
    const worldViewW = viewportW / cameraZoom;
    const worldViewH = viewportH / cameraZoom;

    // Map world bounds to minimap bounds for the viewport rect
    const worldRangeX = worldBounds.maxX - worldBounds.minX;
    const worldRangeY = worldBounds.maxY - worldBounds.minY;

    // World coords → fraction of world bounds
    const fractX = (worldCenterX - worldViewW / 2 - worldBounds.minX) / worldRangeX;
    const fractY = (worldCenterY - worldViewH / 2 - worldBounds.minY) / worldRangeY;
    const fractW = worldViewW / worldRangeX;
    const fractH = worldViewH / worldRangeY;

    // Map to minimap pixels
    const miniRangeX = rangeX * scale;
    const miniRangeY = rangeY * scale;
    const rectX = offsetX + fractX * miniRangeX;
    const rectY = offsetY + fractY * miniRangeY;
    const rectW = fractW * miniRangeX;
    const rectH = fractH * miniRangeY;

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(rectX, rectY, rectW, rectH);
  }, [grid, units, bounds, worldBounds, cameraX, cameraY, cameraZoom]);

  // Click-to-jump: convert minimap click position to camera offset
  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!bounds || !worldBounds) return;

      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top;

      const rangeX = bounds.maxX - bounds.minX;
      const rangeY = bounds.maxY - bounds.minY;
      const scale = Math.min(MINI_MAP_SIZE / rangeX, MINI_MAP_SIZE / rangeY);
      const offsetX = (MINI_MAP_SIZE - rangeX * scale) / 2;
      const offsetY = (MINI_MAP_SIZE - rangeY * scale) / 2;

      // Convert minimap click → fraction of minimap range
      const fractX = (clickX - offsetX) / (rangeX * scale);
      const fractY = (clickY - offsetY) / (rangeY * scale);

      // Convert fraction → world coordinates
      const worldRangeX = worldBounds.maxX - worldBounds.minX;
      const worldRangeY = worldBounds.maxY - worldBounds.minY;
      const worldX = worldBounds.minX + fractX * worldRangeX;
      const worldY = worldBounds.minY + fractY * worldRangeY;

      // Set camera so this world point is centered
      const zoom = useUIStore.getState().cameraZoom;
      const newCameraX = -worldX * zoom;
      const newCameraY = -worldY * zoom;

      // We need to set camera position directly — reset then pan
      const ui = useUIStore.getState();
      const dx = newCameraX - ui.cameraX;
      const dy = newCameraY - ui.cameraY;
      ui.panCamera(dx, dy);
    },
    [bounds, worldBounds],
  );

  if (!grid) return null;

  return (
    <div className="absolute right-4 bottom-4 rounded-lg border border-slate-700 bg-slate-800/95 p-1 shadow-lg">
      <canvas
        ref={canvasRef}
        style={{ width: MINI_MAP_SIZE, height: MINI_MAP_SIZE }}
        className="cursor-pointer rounded"
        onClick={handleClick}
      />
    </div>
  );
}
