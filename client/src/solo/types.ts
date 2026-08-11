export interface HexCoord {
  q: number;
  r: number;
}

export type Terrain = 'Plains' | 'Forest' | 'Mountain' | 'Water' | 'Fortress';
export type UnitType = 'Scout' | 'Soldier' | 'Archer' | 'Knight' | 'Healer' | 'Siege';
export type PuzzleOrderKind = 'move' | 'attack' | 'defend' | 'ability' | 'hold';
export type PuzzleOutcome = 'in_progress' | 'success' | 'failure';

export interface PuzzleMetadata {
  title: string;
  briefing: string;
  learning_goal: string;
  difficulty: string;
  enemy_intent: string;
  hints: string[];
}

export interface PuzzleDefinition {
  format_version: number;
  puzzle_id: string;
  metadata: PuzzleMetadata;
  player_side: number;
  constraints: {
    permitted_units: number[];
    permitted_order_kinds: PuzzleOrderKind[];
    required_order_count: number;
  };
  expected_digests: {
    gameplay_definition: string;
    initial_state: string;
    reference_trace: string;
  };
}

export interface PuzzleTerrainCell {
  coord: HexCoord;
  terrain: Terrain;
}

export interface PuzzleUnit {
  id: number;
  owner: number;
  unit_type: UnitType;
  coord: HexCoord;
  hp: number;
  max_hp: number;
}

export interface PuzzleState {
  turn: number;
  terrain: PuzzleTerrainCell[];
  units: PuzzleUnit[];
}

export interface LegalPuzzleOrder {
  unit_id: number;
  order_kind: PuzzleOrderKind;
  path: HexCoord[] | null;
  target: HexCoord | null;
  target_unit_id: number | null;
  movement_cost: number | null;
  label: string;
}

export interface PuzzleError {
  code: string;
  message: string;
  order_errors: Array<{
    unit_id: number;
    code: string;
    message: string;
  }>;
}

export interface ValidationResponse {
  valid: boolean;
  error: PuzzleError | null;
}

export interface PuzzleResult {
  outcome: PuzzleOutcome;
  reason: string;
  challenge_results: Array<{ description: string; passed: boolean }>;
}

export interface PuzzleReplayFrame {
  turn_index: number;
  state: PuzzleState;
  events: unknown[];
  event_explanations: string[];
  orders: Record<string, unknown[]>;
  result: PuzzleResult;
  state_digest: string;
  frame_digest: string;
}

export interface CommitResponse {
  ok: boolean;
  frame: PuzzleReplayFrame | null;
  error: PuzzleError | null;
}

export interface InteractionPreview {
  valid: boolean;
  summary: string;
  damage_dealt: number | null;
  counter_damage: number | null;
  currently_blocked_by_los: boolean;
}

export interface PuzzleDigests {
  gameplay_definition: string;
  initial_state: string;
  trace: string;
}

export interface PuzzleSessionApi {
  free(): void;
  definition(): PuzzleDefinition;
  compatibility(): unknown;
  digests(): PuzzleDigests;
  current_state(): PuzzleState;
  player_units(): PuzzleUnit[];
  legal_orders(unitId: number): LegalPuzzleOrder[];
  preview_order(order: LegalPuzzleOrder): InteractionPreview;
  queue_order(order: LegalPuzzleOrder): ValidationResponse;
  remove_order(unitId: number): boolean;
  queued_orders(): unknown[];
  validate_commit(): ValidationResponse;
  commit(): CommitResponse;
  result(): PuzzleResult;
  replay_frame(index: number): PuzzleReplayFrame;
  replay_frame_count(): number;
  reset(): void;
}

export interface PuzzleCatalogEntry {
  definition: PuzzleDefinition;
  raw: string;
}
