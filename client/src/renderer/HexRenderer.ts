/**
 * HexRenderer: draws the hex grid terrain cells.
 * Each hex is drawn as a filled polygon with terrain color + grid lines.
 */

import type { Camera } from './Camera.js';
import { hexToPixel, hexCorners } from './hexMath.js';
import {
  TERRAIN_COLORS,
  TERRAIN_STROKE,
  GRID_LINE_COLOR,
  GRID_LINE_WIDTH,
} from './colors.js';

export interface HexCell {
  q: number;
  r: number;
  terrain: string;
}

export class HexRenderer {
  private hexSize: number;

  constructor(hexSize: number) {
    this.hexSize = hexSize;
  }

  /** Draw all hex cells. Caller must have applied camera transform already. */
  draw(
    ctx: CanvasRenderingContext2D,
    cells: HexCell[],
    _camera: Camera,
    showGrid: boolean,
  ): void {
    for (const cell of cells) {
      const { x, y } = hexToPixel(cell.q, cell.r, this.hexSize);
      const corners = hexCorners(x, y, this.hexSize);

      // Fill terrain
      const fillColor = TERRAIN_COLORS[cell.terrain] ?? TERRAIN_COLORS['Plains'];
      ctx.fillStyle = fillColor;
      this.drawHexPath(ctx, corners);
      ctx.fill();

      // Terrain outline
      if (showGrid) {
        const strokeColor = TERRAIN_STROKE[cell.terrain] ?? TERRAIN_STROKE['Plains'];
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = GRID_LINE_WIDTH + 0.5;
        ctx.stroke();
      }

      // Terrain decoration (trees for Forest, wave for Water, etc.)
      this.drawTerrainDecoration(ctx, cell.terrain, x, y);
    }

    // Grid overlay pass (drawn on top for consistent appearance)
    if (showGrid) {
      ctx.strokeStyle = GRID_LINE_COLOR;
      ctx.lineWidth = GRID_LINE_WIDTH;
      for (const cell of cells) {
        const { x, y } = hexToPixel(cell.q, cell.r, this.hexSize);
        const corners = hexCorners(x, y, this.hexSize);
        this.drawHexPath(ctx, corners);
        ctx.stroke();
      }
    }
  }

  /** Draw a hex polygon path from corner vertices. */
  private drawHexPath(ctx: CanvasRenderingContext2D, corners: [number, number][]): void {
    ctx.beginPath();
    const first = corners[0];
    ctx.moveTo(first[0], first[1]);
    for (let i = 1; i < corners.length; i++) {
      ctx.lineTo(corners[i][0], corners[i][1]);
    }
    ctx.closePath();
  }

  /** Draw small decorations inside hex to visually distinguish terrain. */
  private drawTerrainDecoration(
    ctx: CanvasRenderingContext2D,
    terrain: string,
    cx: number,
    cy: number,
  ): void {
    const s = this.hexSize * 0.3;

    switch (terrain) {
      case 'Forest': {
        // Simple tree triangle
        ctx.fillStyle = '#1a3f15';
        ctx.beginPath();
        ctx.moveTo(cx, cy - s);
        ctx.lineTo(cx - s * 0.6, cy + s * 0.4);
        ctx.lineTo(cx + s * 0.6, cy + s * 0.4);
        ctx.closePath();
        ctx.fill();
        break;
      }
      case 'Mountain': {
        // Simple peak triangle
        ctx.fillStyle = '#a09a94';
        ctx.beginPath();
        ctx.moveTo(cx, cy - s * 0.8);
        ctx.lineTo(cx - s * 0.7, cy + s * 0.5);
        ctx.lineTo(cx + s * 0.7, cy + s * 0.5);
        ctx.closePath();
        ctx.fill();
        // Snow cap
        ctx.fillStyle = '#d4d0cc';
        ctx.beginPath();
        ctx.moveTo(cx, cy - s * 0.8);
        ctx.lineTo(cx - s * 0.25, cy - s * 0.2);
        ctx.lineTo(cx + s * 0.25, cy - s * 0.2);
        ctx.closePath();
        ctx.fill();
        break;
      }
      case 'Water': {
        // Wave lines
        ctx.strokeStyle = '#5a90c0';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(cx - s, cy);
        ctx.quadraticCurveTo(cx - s * 0.5, cy - s * 0.3, cx, cy);
        ctx.quadraticCurveTo(cx + s * 0.5, cy + s * 0.3, cx + s, cy);
        ctx.stroke();
        break;
      }
      case 'Fortress': {
        // Small tower symbol
        ctx.fillStyle = '#6e5f48';
        const tw = s * 0.5;
        const th = s * 0.7;
        ctx.fillRect(cx - tw / 2, cy - th / 2, tw, th);
        // Battlements
        ctx.fillRect(cx - tw * 0.7, cy - th / 2 - 3, tw * 0.3, 3);
        ctx.fillRect(cx + tw * 0.4, cy - th / 2 - 3, tw * 0.3, 3);
        break;
      }
      // Plains: no decoration
    }
  }
}
