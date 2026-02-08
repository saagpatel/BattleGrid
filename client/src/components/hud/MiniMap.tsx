import { useRef, useEffect, useMemo } from 'react';
import { useGameStore } from '../../stores/gameStore.js';
import { hexToPixel } from '../../renderer/hexMath.js';
import { TERRAIN_COLORS, PLAYER_COLORS } from '../../renderer/colors.js';

const MINI_HEX_SIZE = 4;
const MINI_MAP_SIZE = 140;

export function MiniMap() {
  const grid = useGameStore((s) => s.grid);
  const units = useGameStore((s) => s.units);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Compute bounding box of all hexes
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

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !grid || !bounds) return;

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
  }, [grid, units, bounds]);

  if (!grid) return null;

  return (
    <div className="absolute right-4 bottom-4 rounded-lg border border-slate-700 bg-slate-800/95 p-1 shadow-lg">
      <canvas
        ref={canvasRef}
        style={{ width: MINI_MAP_SIZE, height: MINI_MAP_SIZE }}
        className="rounded"
      />
    </div>
  );
}
