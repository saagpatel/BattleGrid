import { useConnectionStore } from '../stores/connectionStore.js';
import { useGameStore } from '../stores/gameStore.js';
import { useLobbyStore } from '../stores/lobbyStore.js';
import { decodeMessage } from './codec.js';
import type { ServerMessage } from '../types/network.js';

const BASE_RECONNECT_MS = 1000;
const MAX_RECONNECT_MS = 30000;

let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

function getReconnectDelay(attempts: number): number {
  return Math.min(BASE_RECONNECT_MS * Math.pow(2, attempts), MAX_RECONNECT_MS);
}

/** Dispatch a decoded server message to the appropriate stores */
function handleMessage(msg: ServerMessage): void {
  const game = useGameStore.getState();
  const lobby = useLobbyStore.getState();

  switch (msg.type) {
    case 'RoomList':
      lobby.setRooms(msg.rooms);
      break;

    case 'RoomJoined':
      lobby.setCurrentRoom(msg.room);
      break;

    case 'RoomUpdated':
      lobby.setCurrentRoom(msg.room);
      break;

    case 'GameStart':
      game.setGrid(msg.grid);
      game.setTurnTimer(msg.turnTimerMs);
      game.setPhase('deploying');
      break;

    case 'DeploymentPhase':
      game.setSpawnZone(msg.spawnZone);
      game.setAvailableUnits(msg.availableUnits);
      game.setTurnTimer(msg.timerMs);
      game.setPhase('deploying');
      break;

    case 'PlanningPhase':
      game.setTurn(msg.turn);
      game.setUnits(msg.units);
      game.setTurnTimer(msg.timerMs);
      game.clearOrders();
      game.setPhase('planning');
      break;

    case 'ResolutionPhase':
      game.setEvents(msg.events);
      game.setPhase('resolving');
      break;

    case 'TurnResult':
      game.setTurn(msg.turn);
      game.setUnits(msg.units);
      break;

    case 'GameOver':
      game.setWinner(msg.winner);
      game.setPhase('finished');
      break;

    case 'Error':
      console.error('Server error:', msg.message);
      break;

    case 'Pong':
      // heartbeat acknowledged
      break;
  }
}

/** Connect to the game server WebSocket */
export function connect(url: string): void {
  const conn = useConnectionStore.getState();

  if (conn.ws) {
    conn.ws.close();
  }

  conn.setStatus('connecting');

  const ws = new WebSocket(url);
  ws.binaryType = 'arraybuffer';

  ws.addEventListener('open', () => {
    const c = useConnectionStore.getState();
    c.setStatus('connected');
    c.resetReconnect();
    c.setWs(ws);
  });

  ws.addEventListener('message', (event: MessageEvent<ArrayBuffer | string>) => {
    const msg = decodeMessage(event.data);
    if (msg) {
      handleMessage(msg);
    }
  });

  ws.addEventListener('close', () => {
    const c = useConnectionStore.getState();
    c.setWs(null);

    if (c.status === 'disconnected') return; // intentional disconnect

    c.setStatus('reconnecting');
    scheduleReconnect(url);
  });

  ws.addEventListener('error', () => {
    // The close event will fire after this, triggering reconnect
  });

  conn.setWs(ws);
}

function scheduleReconnect(url: string): void {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
  }

  const conn = useConnectionStore.getState();
  const delay = getReconnectDelay(conn.reconnectAttempts);
  conn.incrementReconnect();

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    const current = useConnectionStore.getState();
    if (current.status === 'reconnecting') {
      connect(url);
    }
  }, delay);
}

/** Disconnect and stop reconnection attempts */
export function disconnect(): void {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  useConnectionStore.getState().disconnect();
}
