/**
 * Camera manages the viewport transform: pan, zoom, and coordinate conversions.
 * All rendering uses worldToScreen to map world pixels to canvas pixels.
 * Mouse interactions use screenToWorld to map canvas clicks back to world space.
 */

export interface CameraState {
  x: number;       // world X at center of viewport
  y: number;       // world Y at center of viewport
  zoom: number;    // scale factor (1.0 = 100%)
}

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 4.0;
const ZOOM_STEP = 0.1;

export class Camera {
  x: number;
  y: number;
  zoom: number;
  private canvasWidth: number;
  private canvasHeight: number;

  constructor(canvasWidth: number, canvasHeight: number) {
    this.x = 0;
    this.y = 0;
    this.zoom = 1.0;
    this.canvasWidth = canvasWidth;
    this.canvasHeight = canvasHeight;
  }

  /** Update canvas dimensions (e.g. on resize). */
  setViewport(width: number, height: number): void {
    this.canvasWidth = width;
    this.canvasHeight = height;
  }

  /** Pan camera by screen-space delta. */
  pan(screenDx: number, screenDy: number): void {
    this.x -= screenDx / this.zoom;
    this.y -= screenDy / this.zoom;
  }

  /** Zoom towards a screen-space point. */
  zoomAt(screenX: number, screenY: number, delta: number): void {
    const worldBefore = this.screenToWorld(screenX, screenY);

    const step = delta > 0 ? ZOOM_STEP : -ZOOM_STEP;
    this.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, this.zoom + step));

    const worldAfter = this.screenToWorld(screenX, screenY);

    // Adjust position so the point under the cursor stays fixed
    this.x += worldBefore.x - worldAfter.x;
    this.y += worldBefore.y - worldAfter.y;
  }

  /** Convert world coordinates to screen (canvas) coordinates. */
  worldToScreen(worldX: number, worldY: number): { x: number; y: number } {
    return {
      x: (worldX - this.x) * this.zoom + this.canvasWidth / 2,
      y: (worldY - this.y) * this.zoom + this.canvasHeight / 2,
    };
  }

  /** Convert screen (canvas) coordinates to world coordinates. */
  screenToWorld(screenX: number, screenY: number): { x: number; y: number } {
    return {
      x: (screenX - this.canvasWidth / 2) / this.zoom + this.x,
      y: (screenY - this.canvasHeight / 2) / this.zoom + this.y,
    };
  }

  /** Apply the camera transform to a canvas context. */
  applyTransform(ctx: CanvasRenderingContext2D): void {
    ctx.setTransform(
      this.zoom,
      0,
      0,
      this.zoom,
      -this.x * this.zoom + this.canvasWidth / 2,
      -this.y * this.zoom + this.canvasHeight / 2,
    );
  }

  /** Reset canvas transform to identity. */
  resetTransform(ctx: CanvasRenderingContext2D): void {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  /** Get a snapshot of camera state (for syncing with Zustand). */
  getState(): CameraState {
    return { x: this.x, y: this.y, zoom: this.zoom };
  }

  /** Load camera state from external source. */
  setState(state: CameraState): void {
    this.x = state.x;
    this.y = state.y;
    this.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, state.zoom));
  }
}
