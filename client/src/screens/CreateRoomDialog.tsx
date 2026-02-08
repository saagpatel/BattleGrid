import { useState, useCallback } from 'react';
import { X } from 'lucide-react';
import { Button } from '../components/Button.js';
import { useConnectionStore } from '../stores/connectionStore.js';

interface CreateRoomDialogProps {
  onClose: () => void;
}

export function CreateRoomDialog({ onClose }: CreateRoomDialogProps) {
  const send = useConnectionStore((s) => s.send);
  const [roomName, setRoomName] = useState('');
  const [turnTimer, setTurnTimer] = useState(30);
  const [mapSeed, setMapSeed] = useState('');

  const handleCreate = useCallback(() => {
    const name = roomName.trim() || 'New Game';
    send({
      type: 'CreateRoom',
      name,
      config: {
        turnTimerMs: turnTimer * 1000,
        maxPlayers: 2,
        mapSeed: mapSeed.trim() || null,
      },
    });
    onClose();
  }, [roomName, turnTimer, mapSeed, send, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
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

        <div className="mb-4">
          <label htmlFor="room-name" className="mb-1 block text-sm text-slate-400">
            Room Name
          </label>
          <input
            id="room-name"
            type="text"
            value={roomName}
            onChange={(e) => setRoomName(e.target.value)}
            placeholder="My Game"
            maxLength={32}
            className="w-full rounded-md border border-slate-600 bg-slate-700 px-3 py-2 text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
          />
        </div>

        <div className="mb-4">
          <label htmlFor="turn-timer" className="mb-1 block text-sm text-slate-400">
            Turn Timer: {turnTimer}s
          </label>
          <input
            id="turn-timer"
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
            type="text"
            value={mapSeed}
            onChange={(e) => setMapSeed(e.target.value)}
            placeholder="Random"
            maxLength={32}
            className="w-full rounded-md border border-slate-600 bg-slate-700 px-3 py-2 text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
          />
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleCreate}>Create</Button>
        </div>
      </div>
    </div>
  );
}
