import { useState, useCallback } from 'react';
import { X } from 'lucide-react';
import { Button } from '../components/Button.js';
import { useConnectionStore } from '../stores/connectionStore.js';
import { useLobbyStore } from '../stores/lobbyStore.js';

interface CreateRoomDialogProps {
  onClose: () => void;
}

export function CreateRoomDialog({ onClose }: CreateRoomDialogProps) {
  const send = useConnectionStore((s) => s.send);
  const playerName = useLobbyStore((s) => s.playerName);
  const [turnTimer, setTurnTimer] = useState(30);
  const [mapSeed, setMapSeed] = useState('');

  const handleCreate = useCallback(() => {
    const creatorName = playerName.trim() || 'Player';
    send({
      type: 'CreateRoom',
      playerName: creatorName,
      config: {
        turnTimerMs: turnTimer * 1000,
        maxPlayers: 2,
        mapSeed: mapSeed.trim() || null,
      },
    });
    onClose();
  }, [playerName, turnTimer, mapSeed, send, onClose]);

  return (
    <div data-testid="create-room-dialog" className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-full max-w-sm rounded-lg border border-slate-700 bg-slate-800 p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Create Room</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="mb-4 text-sm text-slate-400">
          Creating room as <span className="font-medium text-white">{playerName.trim() || 'Player'}</span>
        </p>

        <div className="mb-4">
          <label htmlFor="turn-timer" className="mb-1 block text-sm text-slate-400">
            Turn Timer: {turnTimer}s
          </label>
          <input
            id="turn-timer-number"
            data-testid="turn-timer-number"
            type="number"
            min={15}
            max={60}
            step={5}
            value={turnTimer}
            onChange={(e) => setTurnTimer(Math.min(60, Math.max(15, Number(e.target.value) || 15)))}
            className="mb-3 w-full rounded-md border border-slate-600 bg-slate-700 px-3 py-2 text-white focus:border-indigo-500 focus:outline-none"
          />
          <input
            id="turn-timer"
            data-testid="turn-timer"
            type="range"
            min={15}
            max={60}
            step={5}
            value={turnTimer}
            onChange={(e) => setTurnTimer(Number(e.target.value))}
            className="w-full"
          />
          <div className="flex justify-between text-xs text-slate-500">
            <span>15s</span>
            <span>60s</span>
          </div>
        </div>

        <div className="mb-6">
          <label htmlFor="map-seed" className="mb-1 block text-sm text-slate-400">
            Map Seed (optional)
          </label>
          <input
            id="map-seed"
            data-testid="map-seed"
            type="text"
            value={mapSeed}
            onChange={(e) => setMapSeed(e.target.value)}
            placeholder="Random"
            maxLength={32}
            className="w-full rounded-md border border-slate-600 bg-slate-700 px-3 py-2 text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
          />
        </div>

        <div className="flex justify-end gap-2">
          <Button data-testid="cancel-create-room" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button data-testid="submit-create-room" onClick={handleCreate}>Create</Button>
        </div>
      </div>
    </div>
  );
}
