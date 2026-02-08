import { Check, Circle } from 'lucide-react';

interface PlayerBadgeProps {
  name: string;
  ready: boolean;
  isYou?: boolean;
}

export function PlayerBadge({ name, ready, isYou = false }: PlayerBadgeProps) {
  return (
    <div className="flex items-center gap-2 rounded-md bg-slate-800 px-3 py-2">
      {ready ? (
        <Check className="h-4 w-4 text-green-400" aria-label="Ready" />
      ) : (
        <Circle className="h-4 w-4 text-slate-500" aria-label="Not ready" />
      )}
      <span className="text-sm text-white">
        {name}
        {isYou && (
          <span className="ml-1 text-xs text-slate-400">(you)</span>
        )}
      </span>
    </div>
  );
}
