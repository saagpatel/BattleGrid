/**
 * AnimationEngine: manages tweened animations for unit movement, attacks,
 * damage numbers, and death effects during the resolution phase.
 *
 * Each animation is a tween with a start time, duration, and interpolation
 * callback. The engine ticks on each frame and removes completed animations.
 */

import { hexToPixel } from './hexMath.js';
import type { HexCoord } from './hexMath.js';
import { PLAYER_COLORS } from './colors.js';

export type AnimationType = 'move' | 'attack' | 'death' | 'damage_number' | 'heal_number';

interface BaseAnimation {
  type: AnimationType;
  startTime: number;
  duration: number;
}

export interface MoveAnimation extends BaseAnimation {
  type: 'move';
  unitId: number;
  path: HexCoord[];
}

export interface AttackAnimation extends BaseAnimation {
  type: 'attack';
  attackerId: number;
  from: HexCoord;
  to: HexCoord;
  owner: number;
}

export interface DeathAnimation extends BaseAnimation {
  type: 'death';
  unitId: number;
  hex: HexCoord;
}

export interface DamageNumberAnimation extends BaseAnimation {
  type: 'damage_number';
  hex: HexCoord;
  amount: number;
}

export interface HealNumberAnimation extends BaseAnimation {
  type: 'heal_number';
  hex: HexCoord;
  amount: number;
}

export type Animation =
  | MoveAnimation
  | AttackAnimation
  | DeathAnimation
  | DamageNumberAnimation
  | HealNumberAnimation;

export class AnimationEngine {
  private animations: Animation[] = [];
  private hexSize: number;

  constructor(hexSize: number) {
    this.hexSize = hexSize;
  }

  /** Add a new animation to the queue. */
  enqueue(anim: Animation): void {
    this.animations.push(anim);
  }

  /** Remove all animations. */
  clear(): void {
    this.animations = [];
  }

  /** Whether any animations are currently active. */
  isAnimating(): boolean {
    return this.animations.length > 0;
  }

  /**
   * Get the interpolated position for a moving unit, if it's currently being animated.
   * Returns null if no active move animation for this unit.
   */
  getUnitPosition(unitId: number, now: number): { x: number; y: number } | null {
    for (const anim of this.animations) {
      if (anim.type !== 'move' || anim.unitId !== unitId) continue;

      const elapsed = now - anim.startTime;
      if (elapsed < 0 || elapsed > anim.duration) continue;

      const t = elapsed / anim.duration;
      return this.interpolatePath(anim.path, t);
    }
    return null;
  }

  /**
   * Draw all active animation effects on the canvas.
   * Called after units are drawn so effects appear on top.
   */
  draw(ctx: CanvasRenderingContext2D, now: number): void {
    const completed: number[] = [];

    for (let i = 0; i < this.animations.length; i++) {
      const anim = this.animations[i];
      const elapsed = now - anim.startTime;

      if (elapsed < 0) continue; // not started yet
      if (elapsed > anim.duration) {
        completed.push(i);
        continue;
      }

      const t = elapsed / anim.duration;

      switch (anim.type) {
        case 'attack':
          this.drawAttack(ctx, anim, t);
          break;
        case 'death':
          this.drawDeath(ctx, anim, t);
          break;
        case 'damage_number':
          this.drawDamageNumber(ctx, anim, t);
          break;
        case 'heal_number':
          this.drawHealNumber(ctx, anim, t);
          break;
        // move animations affect unit positions, drawn by UnitRenderer
      }
    }

    // Remove completed animations in reverse order
    for (let i = completed.length - 1; i >= 0; i--) {
      this.animations.splice(completed[i], 1);
    }
  }

  // --- Internal drawing helpers ---

  private interpolatePath(
    path: HexCoord[],
    t: number,
  ): { x: number; y: number } {
    if (path.length < 2) {
      const p = hexToPixel(path[0].q, path[0].r, this.hexSize);
      return p;
    }

    const segmentCount = path.length - 1;
    const rawIndex = t * segmentCount;
    const segIndex = Math.min(Math.floor(rawIndex), segmentCount - 1);
    const segT = rawIndex - segIndex;

    const from = hexToPixel(path[segIndex].q, path[segIndex].r, this.hexSize);
    const to = hexToPixel(path[segIndex + 1].q, path[segIndex + 1].r, this.hexSize);

    return {
      x: from.x + (to.x - from.x) * segT,
      y: from.y + (to.y - from.y) * segT,
    };
  }

  private drawAttack(
    ctx: CanvasRenderingContext2D,
    anim: AttackAnimation,
    t: number,
  ): void {
    const from = hexToPixel(anim.from.q, anim.from.r, this.hexSize);
    const to = hexToPixel(anim.to.q, anim.to.r, this.hexSize);

    // Projectile flies from attacker to defender
    const projT = Math.min(t * 2, 1); // projectile reaches in first half
    const px = from.x + (to.x - from.x) * projT;
    const py = from.y + (to.y - from.y) * projT;

    const color = PLAYER_COLORS[anim.owner] ?? PLAYER_COLORS[0];

    // Draw projectile
    ctx.beginPath();
    ctx.arc(px, py, 4, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();

    // Impact flash at target (second half of animation)
    if (t > 0.5) {
      const flashT = (t - 0.5) * 2;
      const flashRadius = this.hexSize * 0.3 * (1 - flashT);
      const alpha = 1 - flashT;
      ctx.beginPath();
      ctx.arc(to.x, to.y, flashRadius, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 200, 50, ${alpha})`;
      ctx.fill();
    }
  }

  private drawDeath(
    ctx: CanvasRenderingContext2D,
    anim: DeathAnimation,
    t: number,
  ): void {
    const { x, y } = hexToPixel(anim.hex.q, anim.hex.r, this.hexSize);
    const alpha = 1 - t;
    const scale = 1 + t * 0.5;
    const radius = this.hexSize * 0.35 * scale;

    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = '#ff4444';
    ctx.fill();

    // X mark
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    const s = radius * 0.5;
    ctx.beginPath();
    ctx.moveTo(x - s, y - s);
    ctx.lineTo(x + s, y + s);
    ctx.moveTo(x + s, y - s);
    ctx.lineTo(x - s, y + s);
    ctx.stroke();

    ctx.globalAlpha = 1;
  }

  private drawDamageNumber(
    ctx: CanvasRenderingContext2D,
    anim: DamageNumberAnimation,
    t: number,
  ): void {
    const { x, y } = hexToPixel(anim.hex.q, anim.hex.r, this.hexSize);
    const alpha = 1 - t;
    const offsetY = -t * 30;

    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#ff4444';
    ctx.font = `bold ${Math.round(this.hexSize * 0.35)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`-${anim.amount}`, x, y + offsetY);
    ctx.globalAlpha = 1;
  }

  private drawHealNumber(
    ctx: CanvasRenderingContext2D,
    anim: HealNumberAnimation,
    t: number,
  ): void {
    const { x, y } = hexToPixel(anim.hex.q, anim.hex.r, this.hexSize);
    const alpha = 1 - t;
    const offsetY = -t * 30;

    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#44cc66';
    ctx.font = `bold ${Math.round(this.hexSize * 0.35)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`+${anim.amount}`, x, y + offsetY);
    ctx.globalAlpha = 1;
  }
}
