import { useState, useEffect, useMemo } from 'react';
import { useGameStore } from '../stores/gameStore.js';
import { Button } from '../components/Button.js';
import { Play, Pause, SkipBack, SkipForward, X } from 'lucide-react';
import { getWasm } from '../wasm/loader.js';

export function ReplayScreen({ onClose }: { onClose: () => void }) {
  const replayBytes = useGameStore((s) => s.replayBytes);
  const [currentTurn, setCurrentTurn] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const replayData = useMemo(() => {
    if (!replayBytes) return null;

    try {
      const wasm = getWasm();
      if (wasm && typeof (wasm as { decode_replay_summary?: unknown }).decode_replay_summary === 'function') {
        const summary = (wasm as { decode_replay_summary: (bytes: Uint8Array) => { total_turns: number; grid_radius: number } }).decode_replay_summary(replayBytes);
        return {
          totalTurns: summary.total_turns,
          config: { gridRadius: summary.grid_radius },
        };
      }
    } catch (err) {
      console.error('Failed to decode replay summary via WASM:', err);
    }

    return {
      totalTurns: 0,
      config: { gridRadius: 0 },
    };
  }, [replayBytes]);

  const maxTurnIndex = replayData ? Math.max(replayData.totalTurns - 1, 0) : 0;
  const displayTurn = Math.min(currentTurn, maxTurnIndex);

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

  if (!replayBytes || !replayData || replayData.totalTurns <= 0) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-900 text-white">
        <div className="text-center">
          <p className="mb-4 text-slate-400">Replay data could not be decoded</p>
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
              Turn {displayTurn + 1} of {replayData.totalTurns}
            </p>
            <div className="mb-4 h-2 w-64 bg-slate-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-indigo-500 transition-all duration-300"
                style={{
                  width: `${((displayTurn + 1) / replayData.totalTurns) * 100}%`,
                }}
              />
            </div>
            <p className="text-sm text-slate-500">
              Replay data: {replayBytes.length.toLocaleString()} bytes
            </p>
          </div>

          {/* Playback controls */}
          <div className="flex items-center justify-center gap-2">
            <Button variant="ghost" onClick={handlePrevTurn} disabled={displayTurn === 0}>
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
              disabled={displayTurn >= replayData.totalTurns - 1}
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
              <strong className="text-white">Replay summary:</strong> {replayData.totalTurns} recorded turns.
            </p>
            <p className="text-xs text-slate-500">
              Grid radius: {replayData.config.gridRadius}. This view uses deterministic replay metadata from the
              recorded match.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
