use crate::hex::Hex;
use crate::types::UnitId;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum Action {
    /// Deployment phase only: place unit at position
    Deploy { position: Hex },
    /// Move along a path
    Move { path: Vec<Hex> },
    /// Attack a specific unit
    Attack { target_id: UnitId },
    /// Defend in place (+2 defense this turn)
    Defend,
    /// Use unit's special ability on a target hex
    Ability { target: Hex },
    /// Do nothing
    Hold,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct UnitOrder {
    pub unit_id: UnitId,
    pub action: Action,
}

impl UnitOrder {
    pub fn new(unit_id: UnitId, action: Action) -> Self {
        Self { unit_id, action }
    }

    pub fn hold(unit_id: UnitId) -> Self {
        Self {
            unit_id,
            action: Action::Hold,
        }
    }

    pub fn move_to(unit_id: UnitId, path: Vec<Hex>) -> Self {
        Self {
            unit_id,
            action: Action::Move { path },
        }
    }

    pub fn attack(unit_id: UnitId, target_id: UnitId) -> Self {
        Self {
            unit_id,
            action: Action::Attack { target_id },
        }
    }

    pub fn defend(unit_id: UnitId) -> Self {
        Self {
            unit_id,
            action: Action::Defend,
        }
    }

    pub fn ability(unit_id: UnitId, target: Hex) -> Self {
        Self {
            unit_id,
            action: Action::Ability { target },
        }
    }

    pub fn deploy(unit_id: UnitId, position: Hex) -> Self {
        Self {
            unit_id,
            action: Action::Deploy { position },
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn order_serde_roundtrip() {
        let orders = vec![
            UnitOrder::hold(UnitId(1)),
            UnitOrder::move_to(UnitId(2), vec![Hex::ORIGIN, Hex::new(1, 0)]),
            UnitOrder::attack(UnitId(3), UnitId(4)),
            UnitOrder::defend(UnitId(5)),
            UnitOrder::ability(UnitId(6), Hex::new(2, -1)),
            UnitOrder::deploy(UnitId(7), Hex::new(0, 1)),
        ];

        for order in &orders {
            let bytes = bincode::serialize(order).expect("serialize");
            let decoded: UnitOrder = bincode::deserialize(&bytes).expect("deserialize");
            assert_eq!(order, &decoded);
        }
    }

    #[test]
    fn hold_constructor() {
        let o = UnitOrder::hold(UnitId(1));
        assert_eq!(o.action, Action::Hold);
    }

    #[test]
    fn deploy_constructor() {
        let pos = Hex::new(3, -2);
        let o = UnitOrder::deploy(UnitId(1), pos);
        assert_eq!(o.action, Action::Deploy { position: pos });
    }
}
