import { useRef, useEffect } from 'react';
import { useLogStore } from '../../stores/logStore.js';
import type { LogEntry } from '../../stores/logStore.js';

const KIND_COLORS: Record<LogEntry['kind'], string> = {
  move: 'text-indigo-400',
  attack: 'text-red-400',
  death: 'text-red-500',
  heal: 'text-green-400',
  ability: 'text-yellow-400',
  system: 'text-slate-400',
};

export function GameLog() {
  const entries = useLogStore((s) => s.entries);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new entries
  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [entries.length]);

  if (entries.length === 0) return null;

  return (
    <div className="absolute bottom-4 left-72 w-72 rounded-lg border border-slate-700 bg-slate-800/95 shadow-lg">
      <div className="border-b border-slate-700 px-3 py-1.5">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          Game Log
        </h3>
      </div>
      <div
        ref={scrollRef}
        className="max-h-40 overflow-y-auto px-3 py-2"
      >
        {entries.map((entry) => (
          <div key={entry.id} className="mb-0.5 text-xs leading-relaxed">
            <span className="mr-1 text-slate-600">T{entry.turn}</span>
            <span className={KIND_COLORS[entry.kind]}>
              {entry.text}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
