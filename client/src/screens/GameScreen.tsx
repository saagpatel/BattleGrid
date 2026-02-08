import { useGameStore } from '../stores/gameStore.js';

/**
 * Placeholder for the main game screen.
 * Canvas rendering will be implemented in Phase 6.
 */
export function GameScreen() {
  const phase = useGameStore((s) => s.phase);
  const turn = useGameStore((s) => s.turn);
  const winner = useGameStore((s) => s.winner);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-900 text-white">
      <h1 className="mb-4 text-3xl font-bold">BattleGrid</h1>
      <p className="text-slate-400">
        Turn {turn} — Phase: {phase}
      </p>
      {winner !== null && (
        <p className="mt-2 text-lg font-semibold text-yellow-400">
          Player {winner} wins!
        </p>
      )}
      <p className="mt-8 text-sm text-slate-500">
        Game canvas will render here (Phase 6)
      </p>
    </div>
  );
}
