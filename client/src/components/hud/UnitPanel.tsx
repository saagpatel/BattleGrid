import { useGameStore } from '../../stores/gameStore.js';
import { useUIStore } from '../../stores/uiStore.js';
import { PLAYER_COLORS } from '../../renderer/colors.js';

const UNIT_ICONS: Record<string, string> = {
  scout: 'Sc',
  infantry: 'So',
  archer: 'Ar',
  cavalry: 'Kn',
  healer: 'He',
  siege: 'Si',
};

export function UnitPanel() {
  const selectedUnitId = useUIStore((s) => s.selectedUnitId);
  const selectUnit = useUIStore((s) => s.selectUnit);
  const units = useGameStore((s) => s.units);
  const orders = useGameStore((s) => s.orders);
  const removeOrder = useGameStore((s) => s.removeOrder);

  const unit = selectedUnitId !== null ? units.get(selectedUnitId) : undefined;

  if (!unit) return null;

  const order = orders.find((o) => o.unitId === unit.id);
  const playerColor = PLAYER_COLORS[unit.owner] ?? PLAYER_COLORS[0];
  const hpFraction = unit.hp / unit.maxHp;
  const hpColor = hpFraction > 0.5 ? '#44cc66' : hpFraction > 0.25 ? '#ffaa33' : '#ff4444';

  return (
    <div className="absolute bottom-4 left-4 w-64 rounded-lg border border-slate-700 bg-slate-800/95 p-4 shadow-lg">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div
            className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold text-white"
            style={{ backgroundColor: playerColor }}
          >
            {UNIT_ICONS[unit.unitClass] ?? '??'}
          </div>
          <div>
            <div className="text-sm font-semibold capitalize text-white">
              {unit.unitClass}
            </div>
            <div className="text-xs text-slate-400">
              ID #{unit.id} — Player {unit.owner}
            </div>
          </div>
        </div>
        <button
          onClick={() => selectUnit(null)}
          className="text-slate-400 hover:text-white"
          aria-label="Deselect"
        >
          x
        </button>
      </div>

      {/* HP Bar */}
      <div className="mb-3">
        <div className="mb-1 flex justify-between text-xs text-slate-400">
          <span>HP</span>
          <span>{unit.hp}/{unit.maxHp}</span>
        </div>
        <div className="h-2 w-full rounded-full bg-slate-700">
          <div
            className="h-2 rounded-full transition-all"
            style={{ width: `${hpFraction * 100}%`, backgroundColor: hpColor }}
          />
        </div>
      </div>

      {/* Stats grid */}
      <div className="mb-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
        <StatRow label="Attack" value={unit.attack} />
        <StatRow label="Defense" value={unit.defense} />
        <StatRow label="Move" value={unit.moveRange} />
        <StatRow label="Range" value={unit.attackRange} />
      </div>

      {/* Position */}
      <div className="mb-2 text-xs text-slate-500">
        Position: ({unit.coord.q}, {unit.coord.r})
      </div>

      {/* Current order */}
      {order && (
        <div className="flex items-center justify-between rounded bg-slate-700/60 px-2 py-1">
          <span className="text-xs text-indigo-400 capitalize">
            Order: {order.orderType} → ({order.target.q}, {order.target.r})
          </span>
          <button
            onClick={() => removeOrder(unit.id)}
            className="text-xs text-red-400 hover:text-red-300"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between">
      <span className="text-slate-400">{label}</span>
      <span className="font-medium text-white">{value}</span>
    </div>
  );
}
