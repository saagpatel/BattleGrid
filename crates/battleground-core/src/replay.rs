use crate::order::UnitOrder;
use crate::simulation::{simulate_turn, GameConfig, GameState, SimEvent};
use crate::types::PlayerId;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

/// Ruling R11: Replay system.
///
/// Because the simulation is deterministic, replays are trivial:
/// store the initial state and each turn's orders, then replay by calling
/// simulate_turn with each set of orders.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GameReplay {
    pub config: GameConfig,
    pub seed: u64,
    pub initial_state: GameState,
    pub turns: Vec<BTreeMap<PlayerId, Vec<UnitOrder>>>,
}

impl GameReplay {
    pub fn new(config: GameConfig, seed: u64, initial_state: GameState) -> Self {
        Self {
            config,
            seed,
            initial_state,
            turns: Vec::new(),
        }
    }

    pub fn record_turn(&mut self, orders: BTreeMap<PlayerId, Vec<UnitOrder>>) {
        self.turns.push(orders);
    }

    /// Replay the entire game, returning states and events for each turn.
    pub fn replay(&self) -> Vec<(GameState, Vec<SimEvent>)> {
        let mut state = self.initial_state.clone();
        let mut results = Vec::new();

        for turn_orders in &self.turns {
            let events = simulate_turn(&mut state, turn_orders);
            results.push((state.clone(), events));
        }

        results
    }

    pub fn turn_count(&self) -> usize {
        self.turns.len()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::grid::HexGrid;
    use crate::hex::Hex;
    use crate::order::UnitOrder;
    use crate::simulation::{GamePhase, PlayerState};
    use crate::types::UnitId;
    use crate::unit::UnitType;

    fn make_replay_state() -> GameState {
        let grid = HexGrid::new(5);
        let players = vec![
            PlayerState {
                id: PlayerId(0),
                name: "P1".to_string(),
                spawn_center: Hex::new(-3, 0),
            },
            PlayerState {
                id: PlayerId(1),
                name: "P2".to_string(),
                spawn_center: Hex::new(3, 0),
            },
        ];
        let mut state = GameState::new(grid, players, GameConfig::default());
        state.phase = GamePhase::Planning;
        state.turn = 1;
        state.place_unit(UnitType::Soldier, PlayerId(0), Hex::new(-1, 0));
        state.place_unit(UnitType::Soldier, PlayerId(1), Hex::new(1, 0));
        state
    }

    #[test]
    fn replay_deterministic() {
        let state = make_replay_state();
        let uid1 = UnitId(1);

        let mut replay = GameReplay::new(GameConfig::default(), 42, state.clone());

        // Record a turn with movement
        let mut orders = BTreeMap::new();
        orders.insert(
            PlayerId(0),
            vec![UnitOrder::move_to(
                uid1,
                vec![Hex::new(-1, 0), Hex::new(0, 0)],
            )],
        );
        replay.record_turn(orders);

        // Replay should produce identical results
        let results = replay.replay();
        assert_eq!(results.len(), 1);

        let (final_state, events) = &results[0];
        assert_eq!(
            final_state.units.get(&uid1).map(|u| u.position),
            Some(Hex::new(0, 0))
        );
        assert!(!events.is_empty());
    }

    #[test]
    fn replay_multiple_turns() {
        let state = make_replay_state();
        let uid1 = UnitId(1);

        let mut replay = GameReplay::new(GameConfig::default(), 42, state);

        // Turn 1: move
        let mut orders1 = BTreeMap::new();
        orders1.insert(
            PlayerId(0),
            vec![UnitOrder::move_to(
                uid1,
                vec![Hex::new(-1, 0), Hex::new(0, 0)],
            )],
        );
        replay.record_turn(orders1);

        // Turn 2: hold
        replay.record_turn(BTreeMap::new());

        let results = replay.replay();
        assert_eq!(results.len(), 2);
        assert_eq!(replay.turn_count(), 2);
    }

    #[test]
    fn replay_matches_live() {
        let state = make_replay_state();
        let uid1 = UnitId(1);

        // Play live
        let mut live_state = state.clone();
        let mut orders = BTreeMap::new();
        orders.insert(
            PlayerId(0),
            vec![UnitOrder::move_to(
                uid1,
                vec![Hex::new(-1, 0), Hex::new(0, 0)],
            )],
        );
        let live_events = simulate_turn(&mut live_state, &orders);

        // Replay
        let mut replay = GameReplay::new(GameConfig::default(), 42, state);
        replay.record_turn(orders);
        let replay_results = replay.replay();

        let (replay_state, replay_events) = &replay_results[0];

        // States must match
        assert_eq!(
            live_state.units.get(&uid1).map(|u| u.position),
            replay_state.units.get(&uid1).map(|u| u.position)
        );
        assert_eq!(live_events.len(), replay_events.len());
    }
}
