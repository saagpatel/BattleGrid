import type { UnitData } from '../../types/game.js';
import type { CombatPreviewData } from './combatPreview.js';

export function buildCombatPreview(
  attacker: UnitData,
  defender: UnitData,
  damageDealt: number,
  counterDamage: number,
): CombatPreviewData {
  return {
    attackerName: `${attacker.unitClass} #${attacker.id}`,
    defenderName: `${defender.unitClass} #${defender.id}`,
    damageDealt,
    counterDamage,
    attackerHpAfter: attacker.hp - counterDamage,
    defenderHpAfter: defender.hp - damageDealt,
    attackerDies: attacker.hp - counterDamage <= 0,
    defenderDies: defender.hp - damageDealt <= 0,
  };
}
