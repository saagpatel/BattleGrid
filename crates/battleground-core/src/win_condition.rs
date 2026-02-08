use crate::simulation::GameState;
use crate::types::PlayerId;

/// Check if a player has been eliminated (no living units).
pub fn is_eliminated(state: &GameState, player_id: PlayerId) -> bool {
    !state
        .units
        .values()
        .any(|u| u.owner == player_id && u.is_alive())
}

/// Check if a player controls all fortresses.
pub fn controls_all_fortresses(state: &GameState, player_id: PlayerId) -> bool {
    let fortresses = state.grid.fortress_hexes();
    if fortresses.is_empty() {
        return false;
    }
    fortresses
        .iter()
        .all(|hex| state.unit_at_hex(hex).is_some_and(|u| u.owner == player_id))
}

/// Get the number of consecutive turns a player has held all fortresses.
pub fn fortress_control_turns(state: &GameState, player_id: PlayerId) -> u32 {
    state
        .fortress_control_turns
        .get(&player_id)
        .copied()
        .unwrap_or(0)
}

/// Count living units for a player.
pub fn living_unit_count(state: &GameState, player_id: PlayerId) -> usize {
    state
        .units
        .values()
        .filter(|u| u.owner == player_id && u.is_alive())
        .count()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::grid::HexGrid;
    use crate::grid::Terrain;
    use crate::hex::Hex;
    use crate::simulation::{GameConfig, GamePhase, GameState, PlayerState};
    use crate::unit::UnitType;

    fn test_state() -> GameState {
        let grid = HexGrid::new(3);
        let players = vec![
            PlayerState {
                id: PlayerId(0),
                name: "P1".to_string(),
                spawn_center: Hex::new(-2, 0),
            },
            PlayerState {
                id: PlayerId(1),
                name: "P2".to_string(),
                spawn_center: Hex::new(2, 0),
            },
        ];
        let mut state = GameState::new(grid, players, GameConfig::default());
        state.phase = GamePhase::Planning;
        state
    }

    #[test]
    fn elimination_check() {
        let mut state = test_state();
        state.place_unit(UnitType::Soldier, PlayerId(0), Hex::new(0, 0));
        // Player 1 has no units
        assert!(!is_eliminated(&state, PlayerId(0)));
        assert!(is_eliminated(&state, PlayerId(1)));
    }

    #[test]
    fn fortress_control() {
        let mut state = test_state();
        state.grid.set_terrain(Hex::ORIGIN, Terrain::Fortress);
        state.place_unit(UnitType::Soldier, PlayerId(0), Hex::ORIGIN);

        assert!(controls_all_fortresses(&state, PlayerId(0)));
        assert!(!controls_all_fortresses(&state, PlayerId(1)));
    }

    #[test]
    fn no_fortresses_means_no_control() {
        let state = test_state();
        assert!(!controls_all_fortresses(&state, PlayerId(0)));
    }

    #[test]
    fn living_count() {
        let mut state = test_state();
        state.place_unit(UnitType::Soldier, PlayerId(0), Hex::new(0, 0));
        state.place_unit(UnitType::Archer, PlayerId(0), Hex::new(1, 0));
        state.place_unit(UnitType::Scout, PlayerId(1), Hex::new(-1, 0));

        assert_eq!(living_unit_count(&state, PlayerId(0)), 2);
        assert_eq!(living_unit_count(&state, PlayerId(1)), 1);
    }
}
