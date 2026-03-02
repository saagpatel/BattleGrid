export interface CombatPreviewData {
  attackerName: string;
  defenderName: string;
  damageDealt: number;
  counterDamage: number;
  attackerHpAfter: number;
  defenderHpAfter: number;
  attackerDies: boolean;
  defenderDies: boolean;
}

export function CombatPreviewTooltip({
  preview,
  screenX,
  screenY,
}: {
  preview: CombatPreviewData;
  screenX: number;
  screenY: number;
}) {
  return (
    <div
      className="pointer-events-none absolute z-50 rounded-lg border border-slate-600 bg-slate-900/95 p-3 shadow-xl"
      style={{ left: screenX + 16, top: screenY - 10 }}
    >
      <div className="mb-1 text-xs font-semibold text-white">Combat Preview</div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs">
        <span className="text-slate-400">{preview.attackerName}</span>
        <span className="text-slate-400">{preview.defenderName}</span>
        <span className="text-red-400">-{preview.counterDamage} HP</span>
        <span className="text-red-400">-{preview.damageDealt} HP</span>
        <span className={preview.attackerDies ? 'text-red-500 font-bold' : 'text-green-400'}>
          {preview.attackerHpAfter} HP
        </span>
        <span className={preview.defenderDies ? 'text-red-500 font-bold' : 'text-green-400'}>
          {preview.defenderHpAfter} HP
        </span>
      </div>
      {(preview.attackerDies || preview.defenderDies) && (
        <div className="mt-1 text-xs font-bold text-red-400">
          {preview.attackerDies && preview.defenderDies
            ? 'Both units destroyed!'
            : preview.defenderDies
              ? 'Target destroyed!'
              : 'Attacker destroyed!'}
        </div>
      )}
    </div>
  );
}
