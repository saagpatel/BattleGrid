import { useCallback } from 'react';
import { Copy, LogOut } from 'lucide-react';
import { Button } from '../components/Button.js';
import { PlayerBadge } from '../components/PlayerBadge.js';
import { useLobbyStore } from '../stores/lobbyStore.js';
import { useConnectionStore } from '../stores/connectionStore.js';
import { useGameStore } from '../stores/gameStore.js';

export function WaitingRoom() {
  const currentRoom = useLobbyStore((s) => s.currentRoom);
  const playerName = useLobbyStore((s) => s.playerName);
  const setCurrentRoom = useLobbyStore((s) => s.setCurrentRoom);
  const send = useConnectionStore((s) => s.send);
  const playerId = useGameStore((s) => s.playerId);

  const handleReady = useCallback(() => {
    if (!currentRoom) return;
    const me = currentRoom.players.find(
      (p) => p.id === playerId || p.name === playerName,
    );
    send({ type: 'SetReady', ready: !me?.ready });
  }, [currentRoom, playerId, playerName, send]);

  const handleLeave = useCallback(() => {
    send({ type: 'LeaveRoom' });
    setCurrentRoom(null);
  }, [send, setCurrentRoom]);

  const handleCopyCode = useCallback(() => {
    if (currentRoom) {
      navigator.clipboard.writeText(currentRoom.roomId).catch(() => {
        // Clipboard access may be denied
      });
    }
  }, [currentRoom]);

  if (!currentRoom) return null;

  const allReady =
    currentRoom.players.length >= 2 &&
    currentRoom.players.every((p) => p.ready);

  const me = currentRoom.players.find(
    (p) => p.id === playerId || p.name === playerName,
  );
  const amReady = me?.ready ?? false;

  return (
    <div data-testid="waiting-room" className="flex min-h-screen flex-col items-center justify-center bg-slate-900 p-6 text-white">
      <h1 className="mb-2 text-2xl font-bold">{currentRoom.name}</h1>

      {/* Room code */}
      <div className="mb-6 flex items-center gap-2">
        <span className="text-sm text-slate-400">Room Code:</span>
        <code className="rounded bg-slate-800 px-3 py-1 text-lg font-mono tracking-wider text-indigo-400">
          {currentRoom.roomId}
        </code>
        <button
          onClick={handleCopyCode}
          className="text-slate-400 hover:text-white"
          aria-label="Copy room code"
        >
          <Copy className="h-4 w-4" />
        </button>
      </div>

      {/* Player list */}
      <div className="mb-6 w-full max-w-xs space-y-2">
        <h2 className="text-sm font-semibold text-slate-400">Players</h2>
        {currentRoom.players.map((player) => (
          <PlayerBadge
            key={player.id}
            name={player.name}
            ready={player.ready}
            isYou={player.id === playerId || player.name === playerName}
          />
        ))}
        {currentRoom.players.length < (currentRoom.config.maxPlayers) && (
          <div className="rounded-md border border-dashed border-slate-700 px-3 py-2 text-center text-sm text-slate-500">
            Waiting for players...
          </div>
        )}
      </div>

      {/* Status */}
      <p className="mb-4 text-sm text-slate-400">
        {allReady ? 'All players ready!' : 'Waiting for all players to ready up...'}
      </p>

      {/* Actions */}
      <div className="flex gap-3">
        <Button data-testid="ready-toggle" onClick={handleReady} variant={amReady ? 'secondary' : 'primary'}>
          {amReady ? 'Unready' : 'Ready'}
        </Button>
        <Button data-testid="leave-room" variant="danger" onClick={handleLeave}>
          <LogOut className="mr-1 inline h-4 w-4" />
          Leave
        </Button>
      </div>
    </div>
  );
}
