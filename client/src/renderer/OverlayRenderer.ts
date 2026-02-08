/**
 * OverlayRenderer: draws movement range, attack range, path highlights,
 * selected hex, hovered hex, and spawn zone overlays.
 */

import type { HexCoord } from './hexMath.js';
import { hexToPixel, hexCorners } from './hexMath.js';
import { OVERLAY_COLORS } from './colors.js';

export class OverlayRenderer {
  private hexSize: number;

  constructor(hexSize: number) {
    this.hexSize = hexSize;
  }

  /** Draw movement range overlay for the selected unit. */
  drawMoveRange(ctx: CanvasRenderingContext2D, hexes: HexCoord[]): void {
    this.drawHexOverlay(
      ctx,
      hexes,
      OVERLAY_COLORS.moveRange,
      OVERLAY_COLORS.moveRangeStroke,
    );
  }

  /** Draw attack range overlay. */
  drawAttackRange(ctx: CanvasRenderingContext2D, hexes: HexCoord[]): void {
    this.drawHexOverlay(
      ctx,
      hexes,
      OVERLAY_COLORS.attackRange,
      OVERLAY_COLORS.attackRangeStroke,
    );
  }

  /** Draw a path preview (ordered sequence of hexes). */
  drawPath(ctx: CanvasRenderingContext2D, path: HexCoord[]): void {
    if (path.length === 0) return;

    // Fill each hex along the path
    this.drawHexOverlay(
      ctx,
      path,
      OVERLAY_COLORS.pathHighlight,
      OVERLAY_COLORS.pathStroke,
    );

    // Draw connecting line through hex centers
    ctx.strokeStyle = OVERLAY_COLORS.pathStroke;
    ctx.lineWidth = 3;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    const first = hexToPixel(path[0].q, path[0].r, this.hexSize);
    ctx.moveTo(first.x, first.y);
    for (let i = 1; i < path.length; i++) {
      const p = hexToPixel(path[i].q, path[i].r, this.hexSize);
      ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // Arrow at end
    if (path.length >= 2) {
      const last = hexToPixel(path[path.length - 1].q, path[path.length - 1].r, this.hexSize);
      const prev = hexToPixel(path[path.length - 2].q, path[path.length - 2].r, this.hexSize);
      this.drawArrowhead(ctx, prev.x, prev.y, last.x, last.y);
    }
  }

  /** Highlight a single selected hex. */
  drawSelectedHex(ctx: CanvasRenderingContext2D, hex: HexCoord): void {
    this.drawHexOverlay(
      ctx,
      [hex],
      OVERLAY_COLORS.selectedHex,
      'rgba(255, 255, 255, 0.6)',
      2,
    );
  }

  /** Highlight a single hovered hex. */
  drawHoveredHex(ctx: CanvasRenderingContext2D, hex: HexCoord): void {
    this.drawHexOverlay(
      ctx,
      [hex],
      OVERLAY_COLORS.hoveredHex,
      'rgba(255, 255, 255, 0.3)',
    );
  }

  /** Draw spawn zone overlay. */
  drawSpawnZone(ctx: CanvasRenderingContext2D, hexes: HexCoord[]): void {
    this.drawHexOverlay(
      ctx,
      hexes,
      OVERLAY_COLORS.spawnZone,
      OVERLAY_COLORS.spawnZoneStroke,
    );
  }

  // --- Internal helpers ---

  private drawHexOverlay(
    ctx: CanvasRenderingContext2D,
    hexes: HexCoord[],
    fillColor: string,
    strokeColor: string,
    lineWidth: number = 1,
  ): void {
    for (const hex of hexes) {
      const { x, y } = hexToPixel(hex.q, hex.r, this.hexSize);
      const corners = hexCorners(x, y, this.hexSize);

      ctx.beginPath();
      ctx.moveTo(corners[0][0], corners[0][1]);
      for (let i = 1; i < corners.length; i++) {
        ctx.lineTo(corners[i][0], corners[i][1]);
      }
      ctx.closePath();

      ctx.fillStyle = fillColor;
      ctx.fill();
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = lineWidth;
      ctx.stroke();
    }
  }

  private drawArrowhead(
    ctx: CanvasRenderingContext2D,
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
  ): void {
    const angle = Math.atan2(toY - fromY, toX - fromX);
    const arrowLen = 8;

    ctx.fillStyle = OVERLAY_COLORS.pathStroke;
    ctx.beginPath();
    ctx.moveTo(toX, toY);
    ctx.lineTo(
      toX - arrowLen * Math.cos(angle - Math.PI / 6),
      toY - arrowLen * Math.sin(angle - Math.PI / 6),
    );
    ctx.lineTo(
      toX - arrowLen * Math.cos(angle + Math.PI / 6),
      toY - arrowLen * Math.sin(angle + Math.PI / 6),
    );
    ctx.closePath();
    ctx.fill();
  }
}
