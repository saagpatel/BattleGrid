import { describe, it, expect, beforeEach } from 'vitest';
import { Camera } from '../renderer/Camera.js';

describe('Camera', () => {
  let camera: Camera;

  beforeEach(() => {
    camera = new Camera(800, 600);
  });

  it('starts at origin with zoom 1', () => {
    expect(camera.x).toBe(0);
    expect(camera.y).toBe(0);
    expect(camera.zoom).toBe(1.0);
  });

  describe('worldToScreen / screenToWorld', () => {
    it('center of viewport maps to camera position', () => {
      const screen = camera.worldToScreen(0, 0);
      expect(screen.x).toBe(400);
      expect(screen.y).toBe(300);
    });

    it('round-trips through world→screen→world', () => {
      camera.x = 50;
      camera.y = -30;
      camera.zoom = 1.5;

      const world = camera.screenToWorld(200, 150);
      const backToScreen = camera.worldToScreen(world.x, world.y);
      expect(backToScreen.x).toBeCloseTo(200, 5);
      expect(backToScreen.y).toBeCloseTo(150, 5);
    });

    it('zoom scales correctly', () => {
      camera.zoom = 2.0;
      // World (100, 0) should be further right on screen at 2x zoom
      const s1 = camera.worldToScreen(100, 0);
      camera.zoom = 1.0;
      const s2 = camera.worldToScreen(100, 0);
      expect(s1.x).toBeGreaterThan(s2.x);
    });
  });

  describe('pan', () => {
    it('panning moves the camera in world space', () => {
      camera.pan(100, 0);
      // Panning right on screen should move camera left in world space
      expect(camera.x).toBeLessThan(0);
    });

    it('panning accounts for zoom', () => {
      camera.zoom = 2.0;
      camera.pan(100, 0);
      // At 2x zoom, 100 screen pixels = 50 world pixels
      expect(camera.x).toBeCloseTo(-50, 5);
    });
  });

  describe('zoomAt', () => {
    it('zooming in increases zoom level', () => {
      const before = camera.zoom;
      camera.zoomAt(400, 300, 1); // positive delta = zoom in
      expect(camera.zoom).toBeGreaterThan(before);
    });

    it('zooming out decreases zoom level', () => {
      const before = camera.zoom;
      camera.zoomAt(400, 300, -1); // negative delta = zoom out
      expect(camera.zoom).toBeLessThan(before);
    });

    it('clamps to minimum zoom', () => {
      for (let i = 0; i < 100; i++) {
        camera.zoomAt(400, 300, -1);
      }
      expect(camera.zoom).toBe(0.25);
    });

    it('clamps to maximum zoom', () => {
      for (let i = 0; i < 100; i++) {
        camera.zoomAt(400, 300, 1);
      }
      expect(camera.zoom).toBe(4.0);
    });
  });

  describe('setViewport', () => {
    it('updates viewport dimensions', () => {
      camera.setViewport(1920, 1080);
      // Center of screen should now map to (0,0) with new dimensions
      const screen = camera.worldToScreen(0, 0);
      expect(screen.x).toBe(960);
      expect(screen.y).toBe(540);
    });
  });

  describe('getState / setState', () => {
    it('round-trips camera state', () => {
      camera.x = 100;
      camera.y = -50;
      camera.zoom = 2.5;

      const state = camera.getState();
      const other = new Camera(800, 600);
      other.setState(state);

      expect(other.x).toBe(100);
      expect(other.y).toBe(-50);
      expect(other.zoom).toBe(2.5);
    });

    it('clamps zoom on setState', () => {
      camera.setState({ x: 0, y: 0, zoom: 100 });
      expect(camera.zoom).toBe(4.0);
    });
  });
});
