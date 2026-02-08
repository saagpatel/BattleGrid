import { describe, it, expect, beforeEach } from 'vitest';
import { useUIStore } from '../stores/uiStore.js';

describe('uiStore', () => {
  beforeEach(() => {
    useUIStore.setState({
      selectedUnitId: null,
      hoveredHex: null,
      cameraX: 0,
      cameraY: 0,
      cameraZoom: 1.0,
      showGrid: true,
      showFog: true,
    });
  });

  it('selects a unit', () => {
    useUIStore.getState().selectUnit(5);
    expect(useUIStore.getState().selectedUnitId).toBe(5);
  });

  it('deselects a unit', () => {
    useUIStore.getState().selectUnit(5);
    useUIStore.getState().selectUnit(null);
    expect(useUIStore.getState().selectedUnitId).toBeNull();
  });

  it('sets hovered hex', () => {
    useUIStore.getState().setHoveredHex({ q: 3, r: 4 });
    expect(useUIStore.getState().hoveredHex).toEqual({ q: 3, r: 4 });
  });

  it('pans camera', () => {
    useUIStore.getState().panCamera(10, -5);
    expect(useUIStore.getState().cameraX).toBe(10);
    expect(useUIStore.getState().cameraY).toBe(-5);
  });

  it('pans camera cumulatively', () => {
    useUIStore.getState().panCamera(10, 0);
    useUIStore.getState().panCamera(5, 3);
    expect(useUIStore.getState().cameraX).toBe(15);
    expect(useUIStore.getState().cameraY).toBe(3);
  });

  it('zooms camera within bounds', () => {
    useUIStore.getState().zoomCamera(0.5);
    expect(useUIStore.getState().cameraZoom).toBe(1.5);
  });

  it('clamps zoom to minimum', () => {
    useUIStore.getState().zoomCamera(-10);
    expect(useUIStore.getState().cameraZoom).toBe(0.25);
  });

  it('clamps zoom to maximum', () => {
    useUIStore.getState().zoomCamera(100);
    expect(useUIStore.getState().cameraZoom).toBe(4.0);
  });

  it('toggles grid visibility', () => {
    expect(useUIStore.getState().showGrid).toBe(true);
    useUIStore.getState().toggleGrid();
    expect(useUIStore.getState().showGrid).toBe(false);
    useUIStore.getState().toggleGrid();
    expect(useUIStore.getState().showGrid).toBe(true);
  });

  it('toggles fog visibility', () => {
    expect(useUIStore.getState().showFog).toBe(true);
    useUIStore.getState().toggleFog();
    expect(useUIStore.getState().showFog).toBe(false);
  });

  it('resets camera', () => {
    useUIStore.getState().panCamera(50, 50);
    useUIStore.getState().zoomCamera(1);
    useUIStore.getState().resetCamera();
    expect(useUIStore.getState().cameraX).toBe(0);
    expect(useUIStore.getState().cameraY).toBe(0);
    expect(useUIStore.getState().cameraZoom).toBe(1.0);
  });
});
