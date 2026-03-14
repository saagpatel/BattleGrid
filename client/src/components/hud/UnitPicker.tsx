import { useGameStore } from '../../stores/gameStore.js';
import { useUIStore } from '../../stores/uiStore.js';

const UNIT_ICONS: Record<string, string> = {
  scout: 'Sc',
  infantry: 'So',
  archer: 'Ar',
  cavalry: 'Kn',
  healer: 'He',
  siege: 'Si',
};

export function UnitPicker() {
  const playerId = useGameStore((s) => s.playerId);
  const units = useGameStore((s) => s.units);
  const selectedUnitId = useUIStore((s) => s.selectedUnitId);
  const selectUnit = useUIStore((s) => s.selectUnit);

  if (playerId === null) return null;

  const playerUnits = [...units.values()]
    .filter((unit) => unit.owner === playerId && unit.hp > 0)
    .sort((a, b) => a.id - b.id);

  if (playerUnits.length === 0) return null;

  return (
    <div
      data-testid="unit-picker"
      className="absolute left-20 bottom-4 flex max-w-[40rem] flex-wrap gap-2 rounded-lg border border-slate-700 bg-slate-800/95 p-2 shadow-lg"
    >
      {playerUnits.map((unit) => {
        const isSelected = selectedUnitId === unit.id;
        return (
          <button
            key={unit.id}
            data-testid={`select-unit-${unit.id}`}
            onClick={() => selectUnit(unit.id)}
            className={`rounded-md border px-2 py-1 text-xs font-semibold transition-colors ${
              isSelected
                ? 'border-indigo-400 bg-indigo-600 text-white'
                : 'border-slate-700 bg-slate-900 text-slate-200 hover:border-slate-500 hover:bg-slate-700'
            }`}
            title={`${unit.unitClass} at (${unit.coord.q}, ${unit.coord.r})`}
          >
            {UNIT_ICONS[unit.unitClass] ?? '??'} #{unit.id}
          </button>
        );
      })}
    </div>
  );
}
