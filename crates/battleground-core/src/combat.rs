use crate::grid::Terrain;
use crate::types::UnitId;
use crate::unit::Unit;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

/// Result of a single combat interaction.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CombatResult {
    pub attacker_id: UnitId,
    pub defender_id: UnitId,
    pub damage_dealt: i32,
    pub counter_damage: i32,
}

/// Preview combat outcome without modifying state.
pub fn preview_combat(
    attacker: &Unit,
    defender: &Unit,
    defender_terrain: Terrain,
    distance: u32,
) -> CombatResult {
    let attack_power = attacker.effective_attack(distance);
    let defense_power = defender.effective_defense(defender_terrain);
    let damage_dealt = (attack_power - defense_power).max(0);

    // Counter-attack uses defender's pre-combat stats
    let counter_damage = if defender.can_attack_at_range(distance) {
        defender.counter_damage(distance)
    } else {
        0
    };

    CombatResult {
        attacker_id: attacker.id,
        defender_id: defender.id,
        damage_dealt,
        counter_damage,
    }
}

/// Ruling R2: Simultaneous combat resolution.
///
/// All attacks are resolved simultaneously. Counter-attacks use PRE-COMBAT HP.
/// A defender can counter-attack multiple attackers even if combined damage kills it.
/// All damage is pooled and applied at once.
///
/// Returns a map of UnitId → total damage taken.
pub fn resolve_all_combat(
    attacks: &[(UnitId, UnitId)],
    units: &BTreeMap<UnitId, Unit>,
    terrain_at: &dyn Fn(UnitId) -> Terrain,
) -> BTreeMap<UnitId, i32> {
    let mut damage_pool: BTreeMap<UnitId, i32> = BTreeMap::new();

    for &(attacker_id, defender_id) in attacks {
        let attacker = match units.get(&attacker_id) {
            Some(u) => u,
            None => continue,
        };
        let defender = match units.get(&defender_id) {
            Some(u) => u,
            None => continue,
        };

        let distance = attacker.position.distance(&defender.position);
        let defender_terrain = terrain_at(defender_id);

        let result = preview_combat(attacker, defender, defender_terrain, distance);

        *damage_pool.entry(defender_id).or_insert(0) += result.damage_dealt;
        *damage_pool.entry(attacker_id).or_insert(0) += result.counter_damage;
    }

    damage_pool
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::hex::Hex;
    use crate::types::PlayerId;
    use crate::unit::UnitType;

    fn make_unit(id: u16, unit_type: UnitType, pos: Hex) -> Unit {
        Unit::new(UnitId(id), unit_type, PlayerId(0), pos)
    }

    #[test]
    fn basic_combat() {
        let attacker = make_unit(1, UnitType::Soldier, Hex::new(0, 0));
        let defender = make_unit(2, UnitType::Soldier, Hex::new(1, 0));

        let result = preview_combat(&attacker, &defender, Terrain::Plains, 1);
        // Soldier: attack=3, defense=2 on plains
        assert_eq!(result.damage_dealt, 1); // 3 - 2
        assert_eq!(result.counter_damage, 2); // counter = effective_attack(1) - 1 = 3 - 1 = 2
    }

    #[test]
    fn forest_defense_bonus() {
        let attacker = make_unit(1, UnitType::Soldier, Hex::new(0, 0));
        let defender = make_unit(2, UnitType::Soldier, Hex::new(1, 0));

        let result = preview_combat(&attacker, &defender, Terrain::Forest, 1);
        // Soldier in forest: defense = 2 + 1 = 3
        assert_eq!(result.damage_dealt, 0); // 3 - 3 = 0
    }

    #[test]
    fn knight_charge_attack() {
        let mut attacker = make_unit(1, UnitType::Knight, Hex::new(0, 0));
        attacker.charge_bonus = true;
        let defender = make_unit(2, UnitType::Soldier, Hex::new(1, 0));

        let result = preview_combat(&attacker, &defender, Terrain::Plains, 1);
        // Knight with charge: attack = 4 + 2 = 6, defender defense = 2
        assert_eq!(result.damage_dealt, 4); // 6 - 2
    }

    #[test]
    fn archer_ranged_no_counter() {
        let attacker = make_unit(1, UnitType::Archer, Hex::new(0, 0));
        let defender = make_unit(2, UnitType::Soldier, Hex::new(3, 0));

        let result = preview_combat(&attacker, &defender, Terrain::Plains, 3);
        // Archer at range 3: full attack
        assert_eq!(result.damage_dealt, 1); // 3 - 2
                                            // Soldier can't counter at range 3 (range=1)
        assert_eq!(result.counter_damage, 0);
    }

    #[test]
    fn archer_melee_penalty() {
        let attacker = make_unit(1, UnitType::Archer, Hex::new(0, 0));
        let defender = make_unit(2, UnitType::Scout, Hex::new(1, 0));

        let result = preview_combat(&attacker, &defender, Terrain::Plains, 1);
        // Archer melee: attack = 3-1 = 2, Scout defense = 0
        assert_eq!(result.damage_dealt, 2);
    }

    #[test]
    fn simultaneous_combat_r2() {
        // R2: Unit B counter-attacks both A and C even if combined damage kills B
        let unit_a = make_unit(1, UnitType::Soldier, Hex::new(0, 0));
        let unit_b = make_unit(2, UnitType::Soldier, Hex::new(1, 0));
        let unit_c = make_unit(3, UnitType::Soldier, Hex::new(2, 0));

        let mut units = BTreeMap::new();
        units.insert(unit_a.id, unit_a);
        units.insert(unit_b.id, unit_b);
        units.insert(unit_c.id, unit_c);

        let attacks = vec![
            (UnitId(1), UnitId(2)), // A attacks B
            (UnitId(3), UnitId(2)), // C attacks B
        ];

        let terrain_fn = |_: UnitId| Terrain::Plains;
        let damage = resolve_all_combat(&attacks, &units, &terrain_fn);

        // B takes damage from both A and C
        let b_damage = damage.get(&UnitId(2)).copied().unwrap_or(0);
        assert_eq!(b_damage, 2); // 1 from A + 1 from C

        // A and C both take counter-attack damage from B
        let a_damage = damage.get(&UnitId(1)).copied().unwrap_or(0);
        let c_damage = damage.get(&UnitId(3)).copied().unwrap_or(0);
        assert!(a_damage > 0, "A should take counter damage");
        assert!(c_damage > 0, "C should take counter damage");
    }

    #[test]
    fn mutual_kill() {
        // Two units attack each other simultaneously
        let unit_a = make_unit(1, UnitType::Knight, Hex::new(0, 0));
        let unit_b = make_unit(2, UnitType::Knight, Hex::new(1, 0));

        let mut units = BTreeMap::new();
        units.insert(unit_a.id, unit_a);
        units.insert(unit_b.id, unit_b);

        let attacks = vec![(UnitId(1), UnitId(2)), (UnitId(2), UnitId(1))];

        let terrain_fn = |_: UnitId| Terrain::Plains;
        let damage = resolve_all_combat(&attacks, &units, &terrain_fn);

        // Both should take damage
        assert!(damage.get(&UnitId(1)).copied().unwrap_or(0) > 0);
        assert!(damage.get(&UnitId(2)).copied().unwrap_or(0) > 0);
    }

    #[test]
    fn defend_reduces_damage() {
        let attacker = make_unit(1, UnitType::Soldier, Hex::new(0, 0));
        let mut defender = make_unit(2, UnitType::Soldier, Hex::new(1, 0));
        defender.defending = true;

        let result = preview_combat(&attacker, &defender, Terrain::Plains, 1);
        // Defending Soldier: defense = 2 + 2 = 4, attacker attack = 3
        assert_eq!(result.damage_dealt, 0); // 3 - 4 = -1 → 0
    }

    #[test]
    fn damage_never_negative() {
        let attacker = make_unit(1, UnitType::Scout, Hex::new(0, 0));
        let defender = make_unit(2, UnitType::Soldier, Hex::new(1, 0));

        let result = preview_combat(&attacker, &defender, Terrain::Fortress, 1);
        // Scout attack=1, Soldier in fortress: defense = 2 + 2 + 1 = 5
        assert_eq!(result.damage_dealt, 0);
        assert!(result.counter_damage >= 0);
    }
}
