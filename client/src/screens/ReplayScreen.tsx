import { useState, useEffect } from 'react';
import { useGameStore } from '../stores/gameStore.js';
import { Button } from '../components/Button.js';
import { Play, Pause, SkipBack, SkipForward, X } from 'lucide-react';

export function ReplayScreen({ onClose }: { onClose: () => void }) {
  const replayBytes = useGameStore((s) => s.replayBytes);
  const [currentTurn, setCurrentTurn] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [replayData, setReplayData] = useState<any>(null);

  // Decode replay data
  useEffect(() => {
    if (replayBytes) {
      try {
        // For now, we'll show a simplified view using existing game state
        // Full WASM replay deserialization would go here
        setReplayData({
          totalTurns: 10, // Placeholder
          config: { gridRadius: 7 },
        });
      } catch (err) {
        console.error('Failed to decode replay:', err);
      }
    }
  }, [replayBytes]);

  // Auto-advance when playing
  useEffect(() => {
    if (!isPlaying || !replayData) return;

    const interval = setInterval(() => {
      setCurrentTurn((t) => {
        if (t >= replayData.totalTurns - 1) {
          setIsPlaying(false);
          return t;
        }
        return t + 1;
      });
    }, 2000); // 2 seconds per turn

    return () => clearInterval(interval);
  }, [isPlaying, replayData]);

  const handlePlayPause = () => setIsPlaying((p) => !p);
  const handlePrevTurn = () => {
    setCurrentTurn((t) => Math.max(0, t - 1));
    setIsPlaying(false);
  };
  const handleNextTurn = () => {
    if (!replayData) return;
    setCurrentTurn((t) => Math.min(replayData.totalTurns - 1, t + 1));
    setIsPlaying(false);
  };

  if (!replayBytes || !replayData) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-900 text-white">
        <div className="text-center">
          <p className="mb-4 text-slate-400">No replay data available</p>
          <Button onClick={onClose}>Close</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-slate-900 text-white">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-700 bg-slate-800 px-6 py-3">
        <h1 className="text-xl font-bold">Replay Viewer</h1>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-white transition-colors"
          aria-label="Close replay"
        >
          <X className="h-6 w-6" />
        </button>
      </div>

      {/* Main content */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center">
          <div className="mb-8 rounded-lg border border-slate-700 bg-slate-800 p-8">
            <div className="mb-4 text-6xl">🎬</div>
            <h2 className="mb-2 text-2xl font-bold">Replay Viewer</h2>
            <p className="mb-4 text-slate-400">
              Turn {currentTurn + 1} of {replayData.totalTurns}
            </p>
            <div className="mb-4 h-2 w-64 bg-slate-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-indigo-500 transition-all duration-300"
                style={{
                  width: `${((currentTurn + 1) / replayData.totalTurns) * 100}%`,
                }}
              />
            </div>
            <p className="text-sm text-slate-500">
              Replay data: {replayBytes.length.toLocaleString()} bytes
            </p>
          </div>

          {/* Playback controls */}
          <div className="flex items-center justify-center gap-2">
            <Button variant="ghost" onClick={handlePrevTurn} disabled={currentTurn === 0}>
              <SkipBack className="h-5 w-5" />
            </Button>
            <Button onClick={handlePlayPause}>
              {isPlaying ? (
                <Pause className="h-5 w-5" />
              ) : (
                <Play className="h-5 w-5" />
              )}
            </Button>
            <Button
              variant="ghost"
              onClick={handleNextTurn}
              disabled={currentTurn >= replayData.totalTurns - 1}
            >
              <SkipForward className="h-5 w-5" />
            </Button>
          </div>

          <div className="mt-6">
            <Button variant="ghost" onClick={onClose}>
              Close Replay
            </Button>
          </div>

          <div className="mt-6 rounded-lg bg-slate-800/50 border border-slate-700 p-4 max-w-md mx-auto">
            <p className="text-sm text-slate-400 mb-2">
              <strong className="text-white">Note:</strong> Full replay viewer with game state visualization coming soon!
            </p>
            <p className="text-xs text-slate-500">
              This demonstrates the replay infrastructure. Full turn-by-turn playback with unit positions,
              combat events, and camera controls will be added in the next iteration.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
