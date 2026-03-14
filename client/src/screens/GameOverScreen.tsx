import { useMemo, useState } from 'react';
import { useGameStore } from '../stores/gameStore.js';
import { useLobbyStore } from '../stores/lobbyStore.js';
import { Button } from '../components/Button.js';
import { PLAYER_COLORS } from '../renderer/colors.js';
import { ReplayScreen } from './ReplayScreen.js';

export function GameOverScreen() {
  const winner = useGameStore((s) => s.winner);
  const playerId = useGameStore((s) => s.playerId);
  const units = useGameStore((s) => s.units);
  const turn = useGameStore((s) => s.turn);
  const replayBytes = useGameStore((s) => s.replayBytes);
  const reset = useGameStore((s) => s.reset);
  const leaveRoom = useLobbyStore((s) => s.setCurrentRoom);

  const isVictory = winner === playerId;
  const isDraw = winner === null;
  const hasReplay = replayBytes !== null;

  const [showReplay, setShowReplay] = useState(false);

  const stats = useMemo(() => {
    let aliveUnits = 0;
    let deadUnits = 0;
    let totalHp = 0;
    let totalMaxHp = 0;

    units.forEach((u) => {
      if (u.owner === playerId) {
        totalMaxHp += u.maxHp;
        if (u.hp > 0) {
          aliveUnits++;
          totalHp += u.hp;
        } else {
          deadUnits++;
        }
      }
    });

    return { aliveUnits, deadUnits, totalHp, totalMaxHp };
  }, [units, playerId]);

  const winnerColor = winner !== null ? (PLAYER_COLORS[winner] ?? '#fbbf24') : '#94a3b8';

  const handleReturnToLobby = () => {
    reset();
    leaveRoom(null);
  };

  const handleWatchReplay = () => {
    if (replayBytes) {
      setShowReplay(true);
    }
  };

  if (showReplay) {
    return <ReplayScreen onClose={() => setShowReplay(false)} />;
  }

  return (
    <div data-testid="game-over-screen" className="flex min-h-screen flex-col items-center justify-center bg-slate-900 text-white">
      {/* Winner announcement */}
      <div className="mb-8 text-center">
        {isDraw ? (
          <>
            <h1 className="mb-2 text-5xl font-extrabold text-slate-400">Draw</h1>
            <p className="text-lg text-slate-500">No winner this time.</p>
          </>
        ) : isVictory ? (
          <>
            <h1
              className="mb-2 text-5xl font-extrabold"
              style={{ color: winnerColor }}
            >
              Victory!
            </h1>
            <p className="text-lg text-slate-400">You won the battle!</p>
          </>
        ) : (
          <>
            <h1 className="mb-2 text-5xl font-extrabold text-red-500">Defeat</h1>
            <p className="text-lg text-slate-400">
              Player {winner} wins.
            </p>
          </>
        )}
      </div>

      {/* Stats card */}
      <div className="mb-8 w-72 rounded-lg border border-slate-700 bg-slate-800 p-6">
        <h2 className="mb-4 text-center text-sm font-semibold uppercase tracking-wider text-slate-400">
          Final Stats
        </h2>
        <div className="space-y-3">
          <StatRow label="Turns Played" value={String(turn)} />
          <StatRow label="Units Surviving" value={String(stats.aliveUnits)} />
          <StatRow label="Units Lost" value={String(stats.deadUnits)} />
          <StatRow
            label="HP Remaining"
            value={`${stats.totalHp}/${stats.totalMaxHp}`}
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <Button onClick={handleReturnToLobby}>
          Return to Lobby
        </Button>
        <Button variant="ghost" onClick={handleWatchReplay} disabled={!hasReplay}>
          {hasReplay ? 'Watch Replay' : 'Replay Unavailable'}
        </Button>
      </div>
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-slate-400">{label}</span>
      <span className="text-sm font-medium text-white">{value}</span>
    </div>
  );
}
