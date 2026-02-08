/**
 * UnitRenderer: draws unit tokens on the hex grid.
 * Each unit is a colored circle with a type abbreviation and HP bar.
 */

import { hexToPixel } from './hexMath.js';
import { PLAYER_COLORS, PLAYER_COLORS_DIM, UNIT_SYMBOLS } from './colors.js';
import type { AnimationEngine } from './AnimationEngine.js';

export interface UnitRenderData {
  id: number;
  owner: number;
  unitType: string;
  hp: number;
  maxHp: number;
  q: number;
  r: number;
}

export class UnitRenderer {
  private hexSize: number;

  constructor(hexSize: number) {
    this.hexSize = hexSize;
  }

  /** Draw all units. Caller must have applied camera transform. */
  draw(
    ctx: CanvasRenderingContext2D,
    units: UnitRenderData[],
    selectedUnitId: number | null,
    animEngine?: AnimationEngine | null,
    now?: number,
  ): void {
    for (const unit of units) {
      if (unit.hp <= 0) continue;
      // Use animated position during move animations, otherwise hex position
      const animPos =
        animEngine && now != null ? animEngine.getUnitPosition(unit.id, now) : null;
      this.drawUnit(ctx, unit, unit.id === selectedUnitId, animPos);
    }
  }

  private drawUnit(
    ctx: CanvasRenderingContext2D,
    unit: UnitRenderData,
    isSelected: boolean,
    animPos?: { x: number; y: number } | null,
  ): void {
    const { x, y } = animPos ?? hexToPixel(unit.q, unit.r, this.hexSize);
    const radius = this.hexSize * 0.38;

    // Selection ring
    if (isSelected) {
      ctx.beginPath();
      ctx.arc(x, y, radius + 4, 0, Math.PI * 2);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.stroke();
    }

    // Unit circle background
    const color = PLAYER_COLORS[unit.owner] ?? PLAYER_COLORS[0];
    const dimColor = PLAYER_COLORS_DIM[unit.owner] ?? PLAYER_COLORS_DIM[0];
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = dimColor;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Unit type label
    const symbol = UNIT_SYMBOLS[unit.unitType] ?? '??';
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${Math.round(this.hexSize * 0.28)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(symbol, x, y - 1);

    // HP bar below unit
    this.drawHpBar(ctx, x, y + radius + 4, unit.hp, unit.maxHp);
  }

  private drawHpBar(
    ctx: CanvasRenderingContext2D,
    cx: number,
    topY: number,
    hp: number,
    maxHp: number,
  ): void {
    const barWidth = this.hexSize * 0.5;
    const barHeight = 4;
    const left = cx - barWidth / 2;
    const fraction = Math.max(0, hp / maxHp);

    // Background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(left, topY, barWidth, barHeight);

    // HP fill
    const hpColor = fraction > 0.5 ? '#44cc66' : fraction > 0.25 ? '#ffaa33' : '#ff4444';
    ctx.fillStyle = hpColor;
    ctx.fillRect(left, topY, barWidth * fraction, barHeight);

    // Border
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.lineWidth = 0.5;
    ctx.strokeRect(left, topY, barWidth, barHeight);
  }
}
