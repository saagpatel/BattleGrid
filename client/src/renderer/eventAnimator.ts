/**
 * Converts SimEvents from the game store into Animation objects
 * and enqueues them sequentially on the AnimationEngine.
 * Also logs events to the LogStore.
 */

import type { SimEvent } from '../types/game.js';
import type { UnitData } from '../types/game.js';
import type { AnimationEngine, Animation } from './AnimationEngine.js';
import { useLogStore } from '../stores/logStore.js';

const MOVE_DURATION_PER_HEX = 600;
const ATTACK_DURATION = 400;
const DEATH_DURATION = 300;
const HEAL_DURATION = 500;
const NUMBER_DURATION = 800;
const GAP_BETWEEN = 50;

/**
 * Convert SimEvents into sequential animations with correct timing offsets.
 * Returns the total animation duration in ms.
 */
export function queueSimEvents(
  engine: AnimationEngine,
  events: SimEvent[],
  units: Map<number, UnitData>,
  turn: number,
): number {
  const log = useLogStore.getState();
  let currentTime = performance.now();

  for (const event of events) {
    const anims = eventToAnimations(event, units, currentTime);
    let maxDuration = 0;

    for (const anim of anims) {
      engine.enqueue(anim);
      const animEnd = anim.duration;
      if (animEnd > maxDuration) maxDuration = animEnd;
    }

    logEvent(event, units, turn, log.addEntry);

    // Next batch starts after current batch finishes
    currentTime += maxDuration + GAP_BETWEEN;
  }

  return currentTime - performance.now();
}

function eventToAnimations(
  event: SimEvent,
  units: Map<number, UnitData>,
  startTime: number,
): Animation[] {
  const anims: Animation[] = [];

  switch (event.kind) {
    case 'move': {
      if (event.from && event.to) {
        const path = [event.from, event.to];
        anims.push({
          type: 'move',
          unitId: event.unitId,
          path,
          startTime,
          duration: MOVE_DURATION_PER_HEX * (path.length - 1),
        });
      }
      break;
    }

    case 'attack':
    case 'counter_attack': {
      const attacker = units.get(event.unitId);
      const target = event.targetUnitId !== undefined ? units.get(event.targetUnitId) : undefined;

      if (attacker && target) {
        anims.push({
          type: 'attack',
          attackerId: event.unitId,
          from: attacker.coord,
          to: target.coord,
          owner: attacker.owner,
          startTime,
          duration: ATTACK_DURATION,
        });

        if (event.damage && event.damage > 0) {
          anims.push({
            type: 'damage_number',
            hex: target.coord,
            amount: event.damage,
            startTime: startTime + ATTACK_DURATION * 0.5,
            duration: NUMBER_DURATION,
          });
        }
      }
      break;
    }

    case 'death': {
      const unit = units.get(event.unitId);
      if (unit) {
        anims.push({
          type: 'death',
          unitId: event.unitId,
          hex: unit.coord,
          startTime,
          duration: DEATH_DURATION,
        });
      }
      break;
    }

    case 'heal': {
      const target = event.targetUnitId !== undefined ? units.get(event.targetUnitId) : units.get(event.unitId);
      if (target && event.healAmount) {
        anims.push({
          type: 'heal_number',
          hex: target.coord,
          amount: event.healAmount,
          startTime,
          duration: HEAL_DURATION,
        });
      }
      break;
    }

    case 'ability': {
      // Abilities can produce various effects; for now treat as a heal/damage based on presence
      if (event.healAmount && event.healAmount > 0) {
        const target = event.targetUnitId !== undefined ? units.get(event.targetUnitId) : undefined;
        if (target) {
          anims.push({
            type: 'heal_number',
            hex: target.coord,
            amount: event.healAmount,
            startTime,
            duration: HEAL_DURATION,
          });
        }
      }
      if (event.damage && event.damage > 0 && event.to) {
        anims.push({
          type: 'damage_number',
          hex: event.to,
          amount: event.damage,
          startTime,
          duration: NUMBER_DURATION,
        });
      }
      break;
    }

    case 'terrain_change': {
      // Visual handled by HexRenderer re-reading grid data; no canvas animation needed
      break;
    }
  }

  return anims;
}

function logEvent(
  event: SimEvent,
  units: Map<number, UnitData>,
  turn: number,
  addEntry: (turn: number, text: string, kind: 'move' | 'attack' | 'death' | 'heal' | 'ability' | 'system') => void,
): void {
  const unitName = (id: number) => {
    const u = units.get(id);
    return u ? `${u.unitClass} #${id}` : `Unit #${id}`;
  };

  switch (event.kind) {
    case 'move':
      if (event.from && event.to) {
        addEntry(turn, `${unitName(event.unitId)} moved to (${event.to.q}, ${event.to.r})`, 'move');
      }
      break;

    case 'attack':
      if (event.targetUnitId !== undefined) {
        addEntry(
          turn,
          `${unitName(event.unitId)} attacked ${unitName(event.targetUnitId)} for ${event.damage ?? 0} damage`,
          'attack',
        );
      }
      break;

    case 'counter_attack':
      if (event.targetUnitId !== undefined) {
        addEntry(
          turn,
          `${unitName(event.unitId)} counter-attacked ${unitName(event.targetUnitId)} for ${event.damage ?? 0} damage`,
          'attack',
        );
      }
      break;

    case 'death':
      addEntry(turn, `${unitName(event.unitId)} was destroyed`, 'death');
      break;

    case 'heal':
      if (event.targetUnitId !== undefined) {
        addEntry(
          turn,
          `${unitName(event.unitId)} healed ${unitName(event.targetUnitId)} for ${event.healAmount ?? 0} HP`,
          'heal',
        );
      }
      break;

    case 'ability':
      addEntry(turn, `${unitName(event.unitId)} used ability`, 'ability');
      break;

    case 'terrain_change':
      if (event.to) {
        addEntry(turn, `Terrain changed at (${event.to.q}, ${event.to.r})`, 'system');
      }
      break;
  }
}
