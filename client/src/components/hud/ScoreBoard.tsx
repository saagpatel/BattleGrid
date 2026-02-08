import { useMemo } from 'react';
import { useGameStore } from '../../stores/gameStore.js';
import { PLAYER_COLORS } from '../../renderer/colors.js';

interface PlayerScore {
  id: number;
  unitsAlive: number;
  totalHp: number;
  maxHp: number;
}

export function ScoreBoard() {
  const units = useGameStore((s) => s.units);
  const playerId = useGameStore((s) => s.playerId);

  const scores: PlayerScore[] = useMemo(() => {
    const byPlayer = new Map<number, PlayerScore>();

    units.forEach((u) => {
      if (!byPlayer.has(u.owner)) {
        byPlayer.set(u.owner, { id: u.owner, unitsAlive: 0, totalHp: 0, maxHp: 0 });
      }
      const s = byPlayer.get(u.owner)!;
      s.maxHp += u.maxHp;
      if (u.hp > 0) {
        s.unitsAlive += 1;
        s.totalHp += u.hp;
      }
    });

    return Array.from(byPlayer.values()).sort((a, b) => a.id - b.id);
  }, [units]);

  if (scores.length === 0) return null;

  return (
    <div className="absolute right-4 top-14 w-44 rounded-lg border border-slate-700 bg-slate-800/95 p-3 shadow-lg">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
        Score
      </h3>
      <div className="space-y-2">
        {scores.map((s) => {
          const color = PLAYER_COLORS[s.id] ?? PLAYER_COLORS[0];
          const isYou = s.id === playerId;
          const hpPercent = s.maxHp > 0 ? (s.totalHp / s.maxHp) * 100 : 0;

          return (
            <div key={s.id}>
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1">
                  <span
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ backgroundColor: color }}
                  />
                  <span className="text-white">
                    P{s.id}
                    {isYou && <span className="ml-1 text-slate-400">(you)</span>}
                  </span>
                </div>
                <span className="text-slate-300">{s.unitsAlive} units</span>
              </div>
              <div className="mt-0.5 h-1.5 w-full rounded-full bg-slate-700">
                <div
                  className="h-1.5 rounded-full transition-all"
                  style={{ width: `${hpPercent}%`, backgroundColor: color }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
