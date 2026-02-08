import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Plus, Zap } from 'lucide-react';
import { Button } from '../components/Button.js';
import { useLobbyStore } from '../stores/lobbyStore.js';
import { useConnectionStore } from '../stores/connectionStore.js';
import { CreateRoomDialog } from './CreateRoomDialog.js';

export function LobbyScreen() {
  const rooms = useLobbyStore((s) => s.rooms);
  const playerName = useLobbyStore((s) => s.playerName);
  const setPlayerName = useLobbyStore((s) => s.setPlayerName);
  const send = useConnectionStore((s) => s.send);
  const status = useConnectionStore((s) => s.status);

  const [showCreate, setShowCreate] = useState(false);
  const [nameInput, setNameInput] = useState(playerName);

  useEffect(() => {
    if (status === 'connected') {
      send({ type: 'ListRooms' });
    }
  }, [status, send]);

  const handleNameBlur = useCallback(() => {
    const trimmed = nameInput.trim();
    if (trimmed) {
      setPlayerName(trimmed);
    }
  }, [nameInput, setPlayerName]);

  const handleRefresh = useCallback(() => {
    send({ type: 'ListRooms' });
  }, [send]);

  const handleJoin = useCallback(
    (roomId: string) => {
      const name = playerName.trim() || 'Player';
      send({ type: 'JoinRoom', roomId, playerName: name });
    },
    [send, playerName],
  );

  const handleQuickMatch = useCallback(() => {
    const waiting = rooms.find((r) => r.status === 'waiting' && r.playerCount < r.maxPlayers);
    if (waiting) {
      handleJoin(waiting.roomId);
    }
  }, [rooms, handleJoin]);

  return (
    <div className="flex min-h-screen flex-col items-center bg-slate-900 p-6 text-white">
      <h1 className="mb-8 text-4xl font-bold tracking-tight">BattleGrid</h1>

      {/* Player name input */}
      <div className="mb-6 w-full max-w-md">
        <label htmlFor="player-name" className="mb-1 block text-sm text-slate-400">
          Your Name
        </label>
        <input
          id="player-name"
          type="text"
          value={nameInput}
          onChange={(e) => setNameInput(e.target.value)}
          onBlur={handleNameBlur}
          placeholder="Enter your name..."
          maxLength={24}
          className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
      </div>

      {/* Connection status */}
      {status !== 'connected' && (
        <div className="mb-4 rounded-md bg-yellow-900/50 px-4 py-2 text-sm text-yellow-300">
          {status === 'connecting' && 'Connecting to server...'}
          {status === 'reconnecting' && 'Reconnecting...'}
          {status === 'disconnected' && 'Disconnected from server'}
        </div>
      )}

      {/* Action buttons */}
      <div className="mb-6 flex gap-3">
        <Button onClick={() => setShowCreate(true)} disabled={status !== 'connected'}>
          <Plus className="mr-1 inline h-4 w-4" />
          Create Room
        </Button>
        <Button
          variant="secondary"
          onClick={handleQuickMatch}
          disabled={status !== 'connected' || rooms.filter((r) => r.status === 'waiting').length === 0}
        >
          <Zap className="mr-1 inline h-4 w-4" />
          Quick Match
        </Button>
        <Button variant="ghost" onClick={handleRefresh} disabled={status !== 'connected'}>
          <RefreshCw className="mr-1 inline h-4 w-4" />
          Refresh
        </Button>
      </div>

      {/* Room list */}
      <div className="w-full max-w-md">
        <h2 className="mb-3 text-lg font-semibold text-slate-300">Available Rooms</h2>
        {rooms.length === 0 ? (
          <p className="text-center text-sm text-slate-500">
            No rooms available. Create one to get started!
          </p>
        ) : (
          <ul className="space-y-2">
            {rooms.map((room) => (
              <li
                key={room.roomId}
                className="flex items-center justify-between rounded-md border border-slate-700 bg-slate-800 px-4 py-3"
              >
                <div>
                  <span className="font-medium">{room.name}</span>
                  <span className="ml-2 text-sm text-slate-400">
                    {room.playerCount}/{room.maxPlayers}
                  </span>
                </div>
                <Button
                  size="sm"
                  onClick={() => handleJoin(room.roomId)}
                  disabled={
                    room.status !== 'waiting' || room.playerCount >= room.maxPlayers
                  }
                >
                  Join
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {showCreate && <CreateRoomDialog onClose={() => setShowCreate(false)} />}
    </div>
  );
}
