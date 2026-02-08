/**
 * Color palette for terrain, units, overlays, and fog.
 * Centralized so all renderers stay consistent.
 */

export const TERRAIN_COLORS: Record<string, string> = {
  Plains:   '#4a7c59',
  Forest:   '#2d5a27',
  Mountain: '#8b8680',
  Water:    '#3a6fa0',
  Fortress: '#8a7b5e',
};

export const TERRAIN_STROKE: Record<string, string> = {
  Plains:   '#3d6b4a',
  Forest:   '#1f4a1c',
  Mountain: '#6e6963',
  Water:    '#2d5880',
  Fortress: '#6e634a',
};

/** Player colors. Index 0 = player 0, etc. */
export const PLAYER_COLORS = [
  '#4a9eff',  // blue
  '#ff5a5a',  // red
  '#44cc66',  // green (spectator / future)
  '#ffaa33',  // orange (future)
];

export const PLAYER_COLORS_DIM = [
  '#2d5f99',
  '#993636',
  '#2d7a3d',
  '#99661f',
];

/** Unit type icon symbols — keys match client UnitClass values. */
export const UNIT_SYMBOLS: Record<string, string> = {
  scout:    'Sc',
  infantry: 'So',
  archer:   'Ar',
  cavalry:  'Kn',
  healer:   'He',
  siege:    'Si',
};

export const OVERLAY_COLORS = {
  moveRange:    'rgba(74, 158, 255, 0.25)',
  moveRangeStroke: 'rgba(74, 158, 255, 0.5)',
  attackRange:  'rgba(255, 90, 90, 0.25)',
  attackRangeStroke: 'rgba(255, 90, 90, 0.5)',
  pathHighlight: 'rgba(255, 220, 80, 0.4)',
  pathStroke:    'rgba(255, 220, 80, 0.8)',
  selectedHex:  'rgba(255, 255, 255, 0.3)',
  hoveredHex:   'rgba(255, 255, 255, 0.15)',
  spawnZone:    'rgba(100, 200, 100, 0.2)',
  spawnZoneStroke: 'rgba(100, 200, 100, 0.5)',
};

export const FOG_COLOR = 'rgba(15, 15, 25, 0.7)';
export const FOG_HIDDEN_COLOR = 'rgba(15, 15, 25, 0.9)';

export const GRID_LINE_COLOR = 'rgba(200, 200, 200, 0.15)';
export const GRID_LINE_WIDTH = 1;
