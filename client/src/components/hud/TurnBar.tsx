import { useGameStore } from '../../stores/gameStore.js';
import { useConnectionStore } from '../../stores/connectionStore.js';
import { Timer } from '../Timer.js';
import { Button } from '../Button.js';

interface TurnBarProps {
  onSubmitOrders: () => void;
  onAutoSubmit: () => void;
}

export function TurnBar({ onSubmitOrders, onAutoSubmit }: TurnBarProps) {
  const phase = useGameStore((s) => s.phase);
  const turn = useGameStore((s) => s.turn);
  const orders = useGameStore((s) => s.orders);
  const winner = useGameStore((s) => s.winner);
  const turnTimerMs = useGameStore((s) => s.turnTimerMs);
  const status = useConnectionStore((s) => s.status);

  return (
    <div data-testid="turn-bar" className="flex items-center justify-between border-b border-slate-700 bg-slate-800 px-4 py-2">
      <div className="flex items-center gap-4">
        <span className="text-lg font-bold text-white">Turn {turn}</span>
        <PhaseIndicator phase={phase} />
        {status !== 'connected' && (
          <span className="rounded bg-yellow-900/60 px-2 py-0.5 text-xs text-yellow-300">
            {status}
          </span>
        )}
      </div>

      <div className="flex items-center gap-4">
        {phase === 'planning' && (
          <>
            <Timer key={turnTimerMs} durationMs={turnTimerMs} onExpire={onAutoSubmit} />
            <Button data-testid="submit-orders" size="sm" onClick={onSubmitOrders}>
              Submit ({orders.length})
            </Button>
          </>
        )}

        {phase === 'resolving' && (
          <span className="animate-pulse text-sm text-yellow-400">
            Resolving...
          </span>
        )}

        {phase === 'deploying' && (
          <span className="text-sm text-green-400">
            Deploy your units
          </span>
        )}

        {winner !== null && (
          <span className="text-lg font-semibold text-yellow-400">
            Player {winner} wins!
          </span>
        )}
      </div>
    </div>
  );
}

function PhaseIndicator({ phase }: { phase: string }) {
  const colorMap: Record<string, string> = {
    idle: 'bg-slate-600',
    deploying: 'bg-green-700',
    planning: 'bg-indigo-700',
    resolving: 'bg-yellow-700',
    finished: 'bg-red-700',
  };

  return (
    <span
      className={`rounded px-2 py-0.5 text-sm capitalize text-white ${colorMap[phase] ?? 'bg-slate-600'}`}
    >
      {phase}
    </span>
  );
}
