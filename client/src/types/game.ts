/** Axial hex coordinate (q = column, r = row) */
export interface HexCoord {
  q: number;
  r: number;
}

/** Terrain types that affect movement and line-of-sight */
export type TerrainType = 'plain' | 'forest' | 'mountain' | 'water' | 'ruins';

/** A single hex cell on the grid */
export interface HexCell {
  coord: HexCoord;
  terrain: TerrainType;
  elevation: number;
}

/** Full grid data sent from server */
export interface GridData {
  width: number;
  height: number;
  cells: HexCell[];
}

/** Unit class determines base stats and abilities */
export type UnitClass =
  | 'infantry'
  | 'cavalry'
  | 'archer'
  | 'healer'
  | 'siege'
  | 'scout';

/** Runtime state of a unit on the board */
export interface UnitData {
  id: number;
  owner: number;
  unitClass: UnitClass;
  hp: number;
  maxHp: number;
  attack: number;
  defense: number;
  moveRange: number;
  attackRange: number;
  coord: HexCoord;
}

/** Order types a player can issue during planning */
export type OrderType = 'move' | 'attack' | 'ability' | 'hold';

/** A single order for one unit */
export interface UnitOrder {
  unitId: number;
  orderType: OrderType;
  target: HexCoord;
}

/** Deployment order: placing a unit in spawn zone */
export interface DeployOrder {
  unitClass: UnitClass;
  coord: HexCoord;
}

/** Types of simulation events for the resolution phase */
export type SimEventKind =
  | 'move'
  | 'attack'
  | 'counter_attack'
  | 'ability'
  | 'death'
  | 'heal'
  | 'terrain_change';

/** A single event that occurred during turn resolution */
export interface SimEvent {
  kind: SimEventKind;
  unitId: number;
  targetUnitId?: number;
  from?: HexCoord;
  to?: HexCoord;
  damage?: number;
  healAmount?: number;
}

/** Game phase as tracked on the client */
export type GamePhase = 'idle' | 'deploying' | 'planning' | 'resolving' | 'finished';
