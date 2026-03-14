import type {
  HexCoord,
  UnitData,
  GridData,
  UnitOrder,
  DeployOrder,
  SimEvent,
  GamePhase,
  UnitClass,
} from './game.js';

// ---- Room / Lobby types ----

export interface RoomConfig {
  turnTimerMs: number;
  maxPlayers: number;
  mapSeed: string | null;
}

export interface RoomInfo {
  roomId: string;
  name?: string;
  playerCount: number;
  maxPlayers: number;
  status?: 'waiting' | 'in_progress';
}

export interface PlayerInfo {
  id: number;
  name: string;
  ready: boolean;
}

export interface RoomDetails {
  roomId: string;
  name: string;
  config: RoomConfig;
  players: PlayerInfo[];
  status: 'waiting' | 'in_progress' | 'finished';
}

// ---- Messages FROM server ----

export type ServerMessage =
  | { type: 'RoomCreated'; roomId: string }
  | { type: 'RoomJoinedAck'; roomId: string; playerId: number }
  | { type: 'PlayerJoined'; playerName: string }
  | { type: 'PlayerLeft'; playerName: string }
  | { type: 'PlayerReady'; playerName: string }
  | { type: 'AllPlayersReady' }
  | { type: 'GameStarted'; playerId: number }
  | { type: 'DeploymentPhaseStarted'; spawnZone: HexCoord[]; timerMs: number }
  | { type: 'PlanningPhaseStarted'; turn: number; timerMs: number }
  | { type: 'ResolutionStarted'; events: SimEvent[] }
  | { type: 'TurnCompleted'; turn: number; units: UnitData[]; grid: GridData; phase: GamePhase; stateBytes: Uint8Array }
  | { type: 'RoomList'; rooms: RoomInfo[] }
  | { type: 'RoomJoined'; room: RoomDetails }
  | { type: 'RoomUpdated'; room: RoomDetails }
  | { type: 'GameStart'; grid: GridData; spawnZones: Record<number, HexCoord[]>; turnTimerMs: number }
  | { type: 'DeploymentPhase'; spawnZone: HexCoord[]; availableUnits: UnitClass[]; timerMs: number }
  | { type: 'PlanningPhase'; turn: number; units: UnitData[]; timerMs: number }
  | { type: 'ResolutionPhase'; events: SimEvent[] }
  | { type: 'TurnResult'; turn: number; units: UnitData[] }
  | { type: 'GameOver'; winner: number | null }
  | { type: 'ReplayData'; replayBytes: Uint8Array }
  | { type: 'Error'; message: string }
  | { type: 'Pong' };

// ---- Messages TO server ----

export type ClientMessage =
  | { type: 'CreateRoom'; playerName: string; config: RoomConfig }
  | { type: 'JoinRoom'; roomId: string; playerName: string }
  | { type: 'QuickMatch'; playerName: string }
  | { type: 'LeaveRoom' }
  | { type: 'SetReady'; ready: boolean }
  | { type: 'ListRooms' }
  | { type: 'Deploy'; orders: DeployOrder[] }
  | { type: 'SubmitOrders'; turn: number; orders: UnitOrder[] }
  | { type: 'Ping' };

// Re-export game types used across network boundary
export type {
  HexCoord,
  UnitData,
  GridData,
  UnitOrder,
  DeployOrder,
  SimEvent,
  GamePhase,
};
