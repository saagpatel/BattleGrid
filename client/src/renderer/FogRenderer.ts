/**
 * FogRenderer: draws fog of war over hexes not visible to the current player.
 * Visible hexes are left clear; partially-seen hexes (seen last turn) get
 * a lighter fog; fully hidden hexes get a darker fog.
 */

import type { HexCoord } from './hexMath.js';
import { hexToPixel, hexCorners, hexKey } from './hexMath.js';
import { FOG_COLOR, FOG_HIDDEN_COLOR } from './colors.js';

export class FogRenderer {
  private hexSize: number;

  constructor(hexSize: number) {
    this.hexSize = hexSize;
  }

  /**
   * Draw fog over non-visible hexes.
   * @param allHexes Every hex on the grid
   * @param visibleHexes Hexes currently visible to the player
   * @param lastSeenHexes Hexes that were visible last turn (partial fog)
   */
  draw(
    ctx: CanvasRenderingContext2D,
    allHexes: HexCoord[],
    visibleHexes: HexCoord[],
    lastSeenHexes: HexCoord[],
  ): void {
    const visibleSet = new Set(visibleHexes.map((h) => hexKey(h.q, h.r)));
    const lastSeenSet = new Set(lastSeenHexes.map((h) => hexKey(h.q, h.r)));

    for (const hex of allHexes) {
      const key = hexKey(hex.q, hex.r);

      if (visibleSet.has(key)) {
        // Fully visible — no fog
        continue;
      }

      const { x, y } = hexToPixel(hex.q, hex.r, this.hexSize);
      const corners = hexCorners(x, y, this.hexSize);

      ctx.beginPath();
      ctx.moveTo(corners[0][0], corners[0][1]);
      for (let i = 1; i < corners.length; i++) {
        ctx.lineTo(corners[i][0], corners[i][1]);
      }
      ctx.closePath();

      if (lastSeenSet.has(key)) {
        // Partial fog — seen last turn
        ctx.fillStyle = FOG_COLOR;
      } else {
        // Full fog — never seen
        ctx.fillStyle = FOG_HIDDEN_COLOR;
      }
      ctx.fill();
    }
  }
}
