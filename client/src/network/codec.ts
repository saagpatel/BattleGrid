import { getWasm } from '../wasm/loader.js';
import { useGameStore } from '../stores/gameStore.js';
import type { ClientMessage, ServerMessage } from '../types/network.js';
import type {
  GamePhase,
  GridData,
  TerrainType,
  UnitClass,
  UnitData,
  UnitOrder,
} from '../types/game.js';

const DEFAULT_ARMY = [
  'scout',
  'scout',
  'infantry',
  'infantry',
  'infantry',
  'archer',
  'archer',
  'cavalry',
  'healer',
  'siege',
] as const;

type WireClientMessage = Record<string, unknown> | string;
type WireServerMessage = Record<string, unknown> | string;
type MappedWireState = {
  turn: number;
  phase: GamePhase;
  grid: GridData;
  units: UnitData[];
};

const UNIT_CLASSES: ReadonlySet<UnitClass> = new Set([
  'scout',
  'infantry',
  'archer',
  'cavalry',
  'healer',
  'siege',
]);

const TERRAIN_TYPES: ReadonlySet<TerrainType> = new Set([
  'Plains',
  'Forest',
  'Mountain',
  'Water',
  'Fortress',
]);

const GAME_PHASES: ReadonlySet<GamePhase> = new Set([
  'idle',
  'deploying',
  'planning',
  'resolving',
  'finished',
]);

function toUint8Array(value: unknown): Uint8Array {
  if (value instanceof Uint8Array) return value;
  if (Array.isArray(value)) return Uint8Array.from(value as number[]);
  return new Uint8Array();
}

function serializeTurnOrders(orders: UnitOrder[]): Uint8Array {
  const wasm = getWasm();
  if (!wasm || typeof wasm.encode_turn_orders !== 'function') {
    return new Uint8Array();
  }

  const units = useGameStore.getState().units;
  const encodedOrders = orders.map((order) => {
    const unit = units.get(order.unitId);
    const enemy = [...units.values()].find(
      (candidate) =>
        candidate.coord.q === order.target.q &&
        candidate.coord.r === order.target.r &&
        candidate.owner !== unit?.owner &&
        candidate.hp > 0,
    );

    return {
      unit_id: order.unitId,
      order_type: order.orderType,
      from: unit ? { q: unit.coord.q, r: unit.coord.r } : null,
      target: { q: order.target.q, r: order.target.r },
      target_unit_id: enemy?.id ?? null,
    };
  });

  return toUint8Array(wasm.encode_turn_orders(encodedOrders));
}

function normalizeUnitClass(value: unknown): UnitClass {
  return typeof value === 'string' && UNIT_CLASSES.has(value as UnitClass)
    ? (value as UnitClass)
    : 'infantry';
}

function normalizeTerrain(value: unknown): TerrainType {
  return typeof value === 'string' && TERRAIN_TYPES.has(value as TerrainType)
    ? (value as TerrainType)
    : 'Plains';
}

function normalizePhase(value: unknown): GamePhase {
  return typeof value === 'string' && GAME_PHASES.has(value as GamePhase)
    ? (value as GamePhase)
    : 'planning';
}

function toWireClientMessage(msg: ClientMessage): WireClientMessage {
  switch (msg.type) {
    case 'CreateRoom':
      {
        const parsedSeed = msg.config.mapSeed ? Number(msg.config.mapSeed) : null;
        const mapSeed = Number.isFinite(parsedSeed as number) ? parsedSeed : null;
        return {
          CreateRoom: {
            player_name: msg.playerName,
            config: {
              max_players: msg.config.maxPlayers,
              turn_timer_ms: msg.config.turnTimerMs,
              map_seed: mapSeed,
            },
          },
        };
      }
    case 'JoinRoom':
      return {
        JoinRoom: {
          room_id: msg.roomId,
          player_name: msg.playerName,
        },
      };
    case 'QuickMatch':
      return { QuickMatch: { player_name: msg.playerName } };
    case 'LeaveRoom':
      return 'LeaveRoom';
    case 'SetReady':
      return 'SetReady';
    case 'ListRooms':
      return 'ListRooms';
    case 'Deploy':
      return {
        SubmitDeployment: {
          placements: msg.orders.map((deployment, index) => [
            index,
            deployment.coord.q,
            deployment.coord.r,
          ]),
        },
      };
    case 'SubmitOrders':
      return {
        SubmitOrders: {
          for_turn: msg.turn,
          orders: serializeTurnOrders(msg.orders),
        },
      };
    case 'Ping':
      return 'Ping';
    default:
      return msg;
  }
}

function mapWireState(raw: unknown): MappedWireState | null {
  if (!raw || typeof raw !== 'object') return null;
  const state = raw as {
    turn: number;
    phase: string;
    grid: { width: number; height: number; cells: Array<{ coord: { q: number; r: number }; terrain: string; elevation: number }> };
    units: Array<{
      id: number;
      owner: number;
      unit_class: string;
      hp: number;
      max_hp: number;
      attack: number;
      defense: number;
      move_range: number;
      attack_range: number;
      coord: { q: number; r: number };
    }>;
  };

  return {
    turn: state.turn,
    phase: normalizePhase(state.phase),
    grid: {
      width: state.grid.width,
      height: state.grid.height,
      cells: state.grid.cells.map((cell) => ({
        coord: { q: cell.coord.q, r: cell.coord.r },
        terrain: normalizeTerrain(cell.terrain),
        elevation: cell.elevation,
      })),
    },
    units: state.units.map((u) => ({
      id: u.id,
      owner: u.owner,
      unitClass: normalizeUnitClass(u.unit_class),
      hp: u.hp,
      maxHp: u.max_hp,
      attack: u.attack,
      defense: u.defense,
      moveRange: u.move_range,
      attackRange: u.attack_range,
      coord: { q: u.coord.q, r: u.coord.r },
    })),
  };
}

function normalizeWireServerMessage(wire: WireServerMessage): ServerMessage | null {
  if (typeof wire === 'string') {
    if (wire === 'Pong') return { type: 'Pong' };
    if (wire === 'AllPlayersReady') return { type: 'AllPlayersReady' };
    return null;
  }

  if ('type' in wire) {
    return wire as ServerMessage;
  }

  const entries = Object.entries(wire);
  if (entries.length !== 1) return null;
  const [variant, payload] = entries[0];
  const wasm = getWasm();

  switch (variant) {
    case 'RoomCreated':
      return { type: 'RoomCreated', roomId: (payload as { room_id: string }).room_id };
    case 'RoomJoined':
      return {
        type: 'RoomJoinedAck',
        roomId: (payload as { room_id: string }).room_id,
        playerId: (payload as { player_id: number }).player_id,
      };
    case 'PlayerJoined':
      return { type: 'PlayerJoined', playerName: (payload as { player_name: string }).player_name };
    case 'PlayerLeft':
      return { type: 'PlayerLeft', playerName: (payload as { player_name: string }).player_name };
    case 'PlayerReady':
      return { type: 'PlayerReady', playerName: (payload as { player_name: string }).player_name };
    case 'GameStarted':
      return { type: 'GameStarted', playerId: (payload as { your_player_id: number }).your_player_id };
    case 'DeploymentPhaseStarted':
      return {
        type: 'DeploymentPhaseStarted',
        spawnZone: (payload as { spawn_zone: Array<{ q: number; r: number }> }).spawn_zone,
        timerMs: (payload as { time_limit_ms: number }).time_limit_ms,
      };
    case 'PlanningPhaseStarted':
      return {
        type: 'PlanningPhaseStarted',
        turn: (payload as { turn_number: number }).turn_number,
        timerMs: (payload as { time_limit_ms: number }).time_limit_ms,
      };
    case 'ResolutionStarted': {
      const rawBytes = (payload as { events: unknown }).events;
      const bytes = toUint8Array(rawBytes);
      if (wasm && typeof wasm.decode_sim_events === 'function') {
        const events = wasm.decode_sim_events(bytes) as Array<{
          kind: string;
          unit_id: number;
          target_unit_id?: number;
          from?: { q: number; r: number };
          to?: { q: number; r: number };
          damage?: number;
          heal_amount?: number;
        }>;
        return {
          type: 'ResolutionStarted',
          events: events.map((event) => ({
            kind: event.kind as
              | 'move'
              | 'attack'
              | 'counter_attack'
              | 'ability'
              | 'death'
              | 'heal'
              | 'terrain_change',
            unitId: event.unit_id,
            targetUnitId: event.target_unit_id,
            from: event.from,
            to: event.to,
            damage: event.damage,
            healAmount: event.heal_amount,
          })),
        };
      }
      return { type: 'ResolutionStarted', events: [] };
    }
    case 'TurnCompleted': {
      const rawBytes = (payload as { state: unknown }).state;
      const bytes = toUint8Array(rawBytes);
      if (wasm && typeof wasm.decode_game_state === 'function') {
        const state = mapWireState(wasm.decode_game_state(bytes));
        if (state) {
          return {
            type: 'TurnCompleted',
            turn: state.turn,
            units: state.units,
            grid: state.grid,
            phase: state.phase,
            stateBytes: bytes,
          };
        }
      }
      return {
        type: 'TurnCompleted',
        turn: useGameStore.getState().turn,
        units: [],
        grid: { width: 0, height: 0, cells: [] },
        phase: 'planning',
        stateBytes: bytes,
      };
    }
    case 'GameOver':
      return {
        type: 'GameOver',
        winner: (payload as { winner: number | null }).winner,
      };
    case 'ReplayData':
      return {
        type: 'ReplayData',
        replayBytes: toUint8Array((payload as { replay_bytes: unknown }).replay_bytes),
      };
    case 'Error':
      return { type: 'Error', message: (payload as { message: string }).message };
    case 'RoomList':
      return {
        type: 'RoomList',
        rooms: ((payload as { rooms: Array<{ room_id: string; player_count: number; max_players: number }> }).rooms ?? []).map((room) => ({
          roomId: room.room_id,
          playerCount: room.player_count,
          maxPlayers: room.max_players,
          status: 'waiting',
        })),
      };
    default:
      return null;
  }
}

/**
 * Encode a client message for sending over WebSocket.
 * Uses WASM binary encoding when available, falls back to JSON.
 */
export function encodeMessage(msg: ClientMessage): ArrayBuffer | string {
  const wasm = getWasm();
  if (wasm) {
    const wire = toWireClientMessage(msg);
    const bytes = wasm.encode_client_message(wire);
    return Uint8Array.from(bytes as Uint8Array | number[]).buffer;
  }
  return JSON.stringify(msg);
}

/**
 * Decode a server message received from WebSocket.
 * Uses WASM binary decoding when available, falls back to JSON.
 */
export function decodeMessage(data: ArrayBuffer | string): ServerMessage | null {
  try {
    if (typeof data === 'string') {
      return JSON.parse(data) as ServerMessage;
    }

    const wasm = getWasm();
    if (wasm) {
      const bytes = new Uint8Array(data);
      const decoded = wasm.decode_server_message(bytes) as WireServerMessage | string;
      if (typeof decoded === 'string') {
        try {
          return JSON.parse(decoded) as ServerMessage;
        } catch {
          return normalizeWireServerMessage(decoded);
        }
      }
      return normalizeWireServerMessage(decoded);
    }

    const decoder = new TextDecoder();
    return JSON.parse(decoder.decode(data)) as ServerMessage;
  } catch (err) {
    console.error('Failed to decode server message:', err);
    return null;
  }
}

export { DEFAULT_ARMY };
