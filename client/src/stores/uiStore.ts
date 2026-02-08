import { create } from 'zustand';
import type { HexCoord } from '../types/game.js';

export interface UIState {
  selectedUnitId: number | null;
  hoveredHex: HexCoord | null;
  cameraX: number;
  cameraY: number;
  cameraZoom: number;
  showGrid: boolean;
  showFog: boolean;

  selectUnit: (id: number | null) => void;
  setHoveredHex: (hex: HexCoord | null) => void;
  panCamera: (dx: number, dy: number) => void;
  zoomCamera: (delta: number) => void;
  toggleGrid: () => void;
  toggleFog: () => void;
  resetCamera: () => void;
}

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 4.0;

export const useUIStore = create<UIState>()((set) => ({
  selectedUnitId: null,
  hoveredHex: null,
  cameraX: 0,
  cameraY: 0,
  cameraZoom: 1.0,
  showGrid: true,
  showFog: true,

  selectUnit: (id) => set({ selectedUnitId: id }),
  setHoveredHex: (hex) => set({ hoveredHex: hex }),

  panCamera: (dx, dy) =>
    set((s) => ({ cameraX: s.cameraX + dx, cameraY: s.cameraY + dy })),

  zoomCamera: (delta) =>
    set((s) => ({
      cameraZoom: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, s.cameraZoom + delta)),
    })),

  toggleGrid: () => set((s) => ({ showGrid: !s.showGrid })),
  toggleFog: () => set((s) => ({ showFog: !s.showFog })),

  resetCamera: () => set({ cameraX: 0, cameraY: 0, cameraZoom: 1.0 }),
}));
