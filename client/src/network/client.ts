import { useConnectionStore } from '../stores/connectionStore.js';
import { useGameStore } from '../stores/gameStore.js';
import { useLobbyStore } from '../stores/lobbyStore.js';
import { useToastStore } from '../stores/toastStore.js';
import { DEFAULT_ARMY, decodeMessage } from './codec.js';
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
  const toast = useToastStore.getState();

  switch (msg.type) {
    case 'RoomCreated':
      toast.addToast(`Room ${msg.roomId} created`, 'success');
      break;

    case 'RoomJoinedAck': {
      game.setPlayerId(msg.playerId);
      const currentRoom = lobby.currentRoom;
      const myName = lobby.playerName || `Player ${msg.playerId + 1}`;
      const players = currentRoom?.players ?? [];
      const mergedPlayers = players.some((player) => player.id === msg.playerId)
        ? players
        : [...players, { id: msg.playerId, name: myName, ready: false }];

      lobby.setCurrentRoom({
        roomId: msg.roomId,
        name: currentRoom?.name ?? `Room ${msg.roomId}`,
        config: currentRoom?.config ?? { turnTimerMs: 30000, maxPlayers: 2, mapSeed: null },
        players: mergedPlayers,
        status: currentRoom?.status ?? 'waiting',
      });
      toast.addToast('Joined room successfully', 'success');
      break;
    }

    case 'PlayerJoined': {
      const currentRoom = lobby.currentRoom;
      if (!currentRoom) break;
      if (currentRoom.players.some((player) => player.name === msg.playerName)) break;
      const nextId = currentRoom.players.length;
      lobby.setCurrentRoom({
        ...currentRoom,
        players: [...currentRoom.players, { id: nextId, name: msg.playerName, ready: false }],
      });
      break;
    }

    case 'PlayerLeft': {
      const currentRoom = lobby.currentRoom;
      if (!currentRoom) break;
      lobby.setCurrentRoom({
        ...currentRoom,
        players: currentRoom.players.filter((player) => player.name !== msg.playerName),
      });
      break;
    }

    case 'PlayerReady': {
      const currentRoom = lobby.currentRoom;
      if (!currentRoom) break;
      lobby.setCurrentRoom({
        ...currentRoom,
        players: currentRoom.players.map((player) =>
          player.name === msg.playerName ? { ...player, ready: true } : player,
        ),
      });
      break;
    }

    case 'AllPlayersReady':
      toast.addToast('All players ready', 'info', 2500);
      break;

    case 'GameStarted': {
      game.setPlayerId(msg.playerId);
      const currentRoom = lobby.currentRoom;
      if (currentRoom) {
        lobby.setCurrentRoom({ ...currentRoom, status: 'in_progress' });
      }
      toast.addToast('Game starting! Deploy your units.', 'info', 4000);
      break;
    }

    case 'DeploymentPhaseStarted':
      game.setSpawnZone(msg.spawnZone);
      game.setAvailableUnits([...DEFAULT_ARMY]);
      game.setTurnTimer(msg.timerMs);
      game.setPhase('deploying');
      break;

    case 'PlanningPhaseStarted':
      game.setTurn(msg.turn);
      game.setTurnTimer(msg.timerMs);
      game.clearOrders();
      game.setPhase('planning');
      if (msg.turn === 1) {
        toast.addToast('Battle begins! Issue your orders.', 'info', 4000);
      }
      break;

    case 'ResolutionStarted':
      game.setEvents(msg.events);
      game.setPhase('resolving');
      break;

    case 'TurnCompleted':
      game.setTurn(msg.turn);
      game.setGrid(msg.grid);
      game.setUnits(msg.units);
      game.setStateBytes(msg.stateBytes);
      if (msg.phase === 'planning') {
        game.setPhase('planning');
      }
      break;

    case 'RoomList':
      lobby.setRooms(msg.rooms);
      break;

    case 'RoomJoined':
      lobby.setCurrentRoom(msg.room);
      toast.addToast('Joined room successfully', 'success');
      break;

    case 'RoomUpdated':
      lobby.setCurrentRoom(msg.room);
      break;

    case 'GameStart':
      game.setGrid(msg.grid);
      game.setTurnTimer(msg.turnTimerMs);
      game.setPhase('deploying');
      toast.addToast('Game starting! Deploy your units.', 'info', 4000);
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
      if (msg.turn === 1) {
        toast.addToast('Battle begins! Issue your orders.', 'info', 4000);
      }
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
      if (lobby.currentRoom) {
        lobby.setCurrentRoom({ ...lobby.currentRoom, status: 'finished' });
      }
      {
        const playerId = game.playerId;
        if (msg.winner === playerId) {
          toast.addToast('Victory! You won the battle!', 'success', 5000);
        } else if (msg.winner === null) {
          toast.addToast('Game ended in a draw.', 'info', 5000);
        } else {
          toast.addToast('Defeat. Better luck next time!', 'error', 5000);
        }
      }
      break;

    case 'ReplayData':
      game.setReplayBytes(msg.replayBytes);
      toast.addToast('Replay data received', 'success', 2000);
      break;

    case 'Error':
      console.error('Server error:', msg.message);
      toast.addToast(msg.message, 'error', 5000);
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

    // Ignore close events from a superseded WebSocket (race: old ws closing
    // after a new connect() call would overwrite the new connection state).
    if (c.ws !== ws) return;

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
