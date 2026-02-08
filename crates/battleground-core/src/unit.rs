use crate::grid::Terrain;
use crate::hex::Hex;
use crate::types::{PlayerId, UnitId};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum UnitType {
    Scout,
    Soldier,
    Archer,
    Knight,
    Healer,
    Siege,
}

impl UnitType {
    pub fn stats(&self) -> UnitStats {
        match self {
            UnitType::Scout => UnitStats {
                max_hp: 2,
                attack: 1,
                defense: 0,
                movement: 4,
                range: 1,
                ability: Some(Ability::Reveal),
            },
            UnitType::Soldier => UnitStats {
                max_hp: 4,
                attack: 3,
                defense: 2,
                movement: 2,
                range: 1,
                ability: None,
            },
            UnitType::Archer => UnitStats {
                max_hp: 3,
                attack: 3,
                defense: 1,
                movement: 2,
                range: 3,
                ability: None,
            },
            UnitType::Knight => UnitStats {
                max_hp: 5,
                attack: 4,
                defense: 1,
                movement: 3,
                range: 1,
                ability: Some(Ability::Charge),
            },
            UnitType::Healer => UnitStats {
                max_hp: 3,
                attack: 1,
                defense: 1,
                movement: 2,
                range: 1,
                ability: Some(Ability::Heal),
            },
            UnitType::Siege => UnitStats {
                max_hp: 4,
                attack: 5,
                defense: 0,
                movement: 1,
                range: 2,
                ability: Some(Ability::Demolish),
            },
        }
    }

    pub fn army() -> Vec<UnitType> {
        vec![
            UnitType::Scout,
            UnitType::Scout,
            UnitType::Soldier,
            UnitType::Soldier,
            UnitType::Soldier,
            UnitType::Archer,
            UnitType::Archer,
            UnitType::Knight,
            UnitType::Healer,
            UnitType::Siege,
        ]
    }
}

impl std::fmt::Display for UnitType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            UnitType::Scout => write!(f, "Scout"),
            UnitType::Soldier => write!(f, "Soldier"),
            UnitType::Archer => write!(f, "Archer"),
            UnitType::Knight => write!(f, "Knight"),
            UnitType::Healer => write!(f, "Healer"),
            UnitType::Siege => write!(f, "Siege"),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum Ability {
    Reveal,   // Scout: reveals fog in 3-hex radius
    Charge,   // Knight: +2 attack when moving 2+ hexes before attacking
    Heal,     // Healer: heal adjacent friendly unit for 2 HP
    Demolish, // Siege: destroy forest/fortress terrain
}

#[derive(Debug, Clone, Copy)]
pub struct UnitStats {
    pub max_hp: i32,
    pub attack: i32,
    pub defense: i32,
    pub movement: u32,
    pub range: u32,
    pub ability: Option<Ability>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Unit {
    pub id: UnitId,
    pub unit_type: UnitType,
    pub owner: PlayerId,
    pub position: Hex,
    pub hp: i32,
    pub max_hp: i32,
    pub defending: bool,
    pub charge_bonus: bool,
}

impl Unit {
    pub fn new(id: UnitId, unit_type: UnitType, owner: PlayerId, position: Hex) -> Self {
        let stats = unit_type.stats();
        Self {
            id,
            unit_type,
            owner,
            position,
            hp: stats.max_hp,
            max_hp: stats.max_hp,
            defending: false,
            charge_bonus: false,
        }
    }

    pub fn stats(&self) -> UnitStats {
        self.unit_type.stats()
    }

    pub fn is_alive(&self) -> bool {
        self.hp > 0
    }

    /// Effective attack power considering distance and abilities.
    /// Archers have -1 attack at range 1 (melee penalty).
    /// Knights get +2 attack with charge bonus.
    pub fn effective_attack(&self, distance: u32) -> i32 {
        let base = self.stats().attack;
        let mut attack = base;

        // Archer melee penalty
        if self.unit_type == UnitType::Archer && distance <= 1 {
            attack -= 1;
        }

        // Knight charge bonus
        if self.charge_bonus {
            attack += 2;
        }

        attack.max(0)
    }

    /// Effective defense including terrain bonus and defend action.
    /// Soldiers get +1 extra when in Fortress.
    pub fn effective_defense(&self, terrain: Terrain) -> i32 {
        let base = self.stats().defense;
        let mut defense = base + terrain.defense_bonus();

        // Defend action bonus
        if self.defending {
            defense += 2;
        }

        // Soldier fortress bonus
        if self.unit_type == UnitType::Soldier && terrain == Terrain::Fortress {
            defense += 1;
        }

        defense
    }

    /// Whether this unit can attack at the given distance.
    pub fn can_attack_at_range(&self, distance: u32) -> bool {
        distance >= 1 && distance <= self.stats().range
    }

    /// Counter-attack damage this unit deals.
    /// Archers cannot counter-attack at melee range (they use melee penalty instead).
    /// Counter damage = attack - 1 (weaker than a full attack).
    pub fn counter_damage(&self, distance: u32) -> i32 {
        if !self.can_attack_at_range(distance) {
            return 0;
        }
        let attack = self.effective_attack(distance);
        (attack - 1).max(0)
    }

    pub fn movement(&self) -> u32 {
        self.stats().movement
    }

    pub fn range(&self) -> u32 {
        self.stats().range
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn army_has_10_units() {
        assert_eq!(UnitType::army().len(), 10);
    }

    #[test]
    fn unit_creation() {
        let u = Unit::new(UnitId(1), UnitType::Soldier, PlayerId(0), Hex::ORIGIN);
        assert_eq!(u.hp, 4);
        assert_eq!(u.max_hp, 4);
        assert!(u.is_alive());
        assert!(!u.defending);
    }

    #[test]
    fn archer_melee_penalty() {
        let archer = Unit::new(UnitId(1), UnitType::Archer, PlayerId(0), Hex::ORIGIN);
        assert_eq!(archer.effective_attack(3), 3); // full range
        assert_eq!(archer.effective_attack(2), 3); // still ranged
        assert_eq!(archer.effective_attack(1), 2); // melee penalty
    }

    #[test]
    fn knight_charge_bonus() {
        let mut knight = Unit::new(UnitId(1), UnitType::Knight, PlayerId(0), Hex::ORIGIN);
        assert_eq!(knight.effective_attack(1), 4); // base
        knight.charge_bonus = true;
        assert_eq!(knight.effective_attack(1), 6); // +2 charge
    }

    #[test]
    fn soldier_fortress_bonus() {
        let soldier = Unit::new(UnitId(1), UnitType::Soldier, PlayerId(0), Hex::ORIGIN);
        assert_eq!(soldier.effective_defense(Terrain::Plains), 2);
        assert_eq!(soldier.effective_defense(Terrain::Forest), 3); // +1 forest
        assert_eq!(soldier.effective_defense(Terrain::Fortress), 5); // +2 fort + 1 soldier bonus
    }

    #[test]
    fn defend_action_bonus() {
        let mut soldier = Unit::new(UnitId(1), UnitType::Soldier, PlayerId(0), Hex::ORIGIN);
        let base = soldier.effective_defense(Terrain::Plains);
        soldier.defending = true;
        assert_eq!(soldier.effective_defense(Terrain::Plains), base + 2);
    }

    #[test]
    fn attack_range() {
        let scout = Unit::new(UnitId(1), UnitType::Scout, PlayerId(0), Hex::ORIGIN);
        assert!(scout.can_attack_at_range(1));
        assert!(!scout.can_attack_at_range(2));

        let archer = Unit::new(UnitId(2), UnitType::Archer, PlayerId(0), Hex::ORIGIN);
        assert!(archer.can_attack_at_range(1));
        assert!(archer.can_attack_at_range(3));
        assert!(!archer.can_attack_at_range(4));
    }

    #[test]
    fn unit_serde_roundtrip() {
        let u = Unit::new(UnitId(42), UnitType::Healer, PlayerId(1), Hex::new(2, -1));
        let bytes = bincode::serialize(&u).unwrap();
        let decoded: Unit = bincode::deserialize(&bytes).unwrap();
        assert_eq!(decoded.id, u.id);
        assert_eq!(decoded.unit_type, u.unit_type);
        assert_eq!(decoded.position, u.position);
    }
}
