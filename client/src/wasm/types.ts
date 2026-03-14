// TypeScript type declarations for the BattleGrid WASM bridge.
// These match the shapes returned by serde_wasm_bindgen from Rust.

// Hex coordinate types
export interface HexCoord {
  q: number;
  r: number;
}

export interface PixelCoord {
  x: number;
  y: number;
}

export interface PathResult {
  path: HexCoord[];
  cost: number;
}

export interface CombatPreview {
  damage_dealt: number;
  counter_damage: number;
  attacker_hp_after: number;
  defender_hp_after: number;
  attacker_dies: boolean;
  defender_dies: boolean;
}

export interface ReachableHex {
  hex: HexCoord;
  cost: number;
}

// Unit types
export type UnitTypeName =
  | "Scout"
  | "Soldier"
  | "Archer"
  | "Knight"
  | "Healer"
  | "Siege";

// Protocol message types — externally tagged (serde default for enums)
// Wire format uses bincode with version byte prefix.
// JS representation uses serde_wasm_bindgen externally-tagged format:
// e.g. { RoomCreated: { room_id: "abc" } }

export type ServerMessage =
  | { RoomCreated: { room_id: string } }
  | { RoomJoined: { room_id: string; player_id: number } }
  | { PlayerJoined: { player_name: string } }
  | { PlayerLeft: { player_name: string } }
  | { PlayerReady: { player_name: string } }
  | "AllPlayersReady"
  | { GameStarted: { your_player_id: number } }
  | {
      DeploymentPhaseStarted: {
        spawn_zone: HexCoord[];
        time_limit_ms: number;
      };
    }
  | {
      PlanningPhaseStarted: {
        turn_number: number;
        time_limit_ms: number;
      };
    }
  | { ResolutionStarted: { events: Uint8Array } }
  | { TurnCompleted: { state: Uint8Array } }
  | { GameOver: { winner: number | null; reason: string } }
  | { ReplayData: { replay_bytes: Uint8Array } }
  | { Error: { message: string } }
  | { RoomList: { rooms: RoomInfo[] } }
  | "Pong";

export type ClientMessage =
  | { CreateRoom: { player_name: string; config: RoomConfig } }
  | { JoinRoom: { room_id: string; player_name: string } }
  | { QuickMatch: { player_name: string } }
  | "SetReady"
  | { SubmitDeployment: { placements: [number, number, number][] } }
  | { SubmitOrders: { for_turn: number; orders: Uint8Array } }
  | "ListRooms"
  | "Ping"
  | "LeaveRoom";

export interface RoomInfo {
  room_id: string;
  player_count: number;
  max_players: number;
}

export interface RoomConfig {
  max_players: number;
  turn_timer_ms: number;
  map_seed?: number;
}
