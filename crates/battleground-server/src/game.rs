use std::collections::BTreeMap;

use battleground_core::hex::Hex;
use battleground_core::map_gen::{self, MapGenConfig};
use battleground_core::order::UnitOrder;
use battleground_core::replay::GameReplay;
use battleground_core::simulation::{
    self, GameConfig, GamePhase, GameState, PlayerState, SimEvent,
};
use battleground_core::types::PlayerId;
use battleground_core::unit::UnitType;

use crate::error::ServerError;

/// Server-side game instance wrapping core game state and replay recording.
pub struct GameInstance {
    pub state: GameState,
    pub replay: GameReplay,
    #[allow(dead_code)] // Used for replay serialization
    pub seed: u64,
    pub turn_timer_ms: u64,
    /// Per-player deployment submissions (player_id -> placements).
    deployments: BTreeMap<PlayerId, Vec<(u16, i32, i32)>>,
    /// Per-player order submissions for the current turn.
    orders: BTreeMap<PlayerId, Vec<UnitOrder>>,
    /// Which players have submitted orders for this turn.
    submitted: Vec<PlayerId>,
    /// Total number of players in this game.
    player_count: usize,
}

impl GameInstance {
    /// Create a new game instance, generating the map and setting up player states.
    pub fn new(player_names: &[(u8, String)], turn_timer_ms: u64, map_seed: Option<u64>) -> Self {
        let seed = map_seed.unwrap_or_else(|| {
            use rand::Rng;
            rand::thread_rng().gen()
        });

        let map_config = MapGenConfig::default();
        let grid = map_gen::generate_map(seed, &map_config);

        let spawn_a = Hex::new(-map_config.radius + map_config.spawn_radius, 0);
        let spawn_b = Hex::new(map_config.radius - map_config.spawn_radius, 0);

        let spawn_centers = [spawn_a, spawn_b];

        let players: Vec<PlayerState> = player_names
            .iter()
            .enumerate()
            .map(|(i, (_, name))| PlayerState {
                id: PlayerId(i as u8),
                name: name.clone(),
                spawn_center: spawn_centers[i % 2],
            })
            .collect();

        let game_config = GameConfig {
            turn_timer_secs: (turn_timer_ms / 1000) as u32,
            ..GameConfig::default()
        };

        let state = GameState::new(grid, players, game_config.clone());
        let replay = GameReplay::new(game_config, seed, state.clone());
        let player_count = player_names.len();

        Self {
            state,
            replay,
            seed,
            turn_timer_ms,
            deployments: BTreeMap::new(),
            orders: BTreeMap::new(),
            submitted: Vec::new(),
            player_count,
        }
    }

    /// Get the current game phase.
    #[allow(dead_code)] // Used in timer-driven game loop
    pub fn phase(&self) -> &GamePhase {
        &self.state.phase
    }

    /// Get the current turn number.
    pub fn turn(&self) -> u32 {
        self.state.turn
    }

    /// Get spawn zone hexes for a player.
    pub fn spawn_zone_for_player(&self, player_id: u8) -> Vec<(i32, i32)> {
        let pid = PlayerId(player_id);
        if let Some(player) = self.state.players.iter().find(|p| p.id == pid) {
            let map_config = MapGenConfig::default();
            map_gen::spawn_zone(
                player.spawn_center,
                map_config.spawn_radius,
                &self.state.grid,
            )
            .into_iter()
            .map(|h| (h.q, h.r))
            .collect()
        } else {
            Vec::new()
        }
    }

    /// Submit a deployment for a player. Returns true if all players have deployed.
    pub fn submit_deployment(
        &mut self,
        player_id: u8,
        placements: &[(u16, i32, i32)],
    ) -> Result<bool, ServerError> {
        if self.state.phase != GamePhase::Deploying {
            return Err(ServerError::invalid_message("not in deployment phase"));
        }

        let pid = PlayerId(player_id);
        let spawn_zone = self.spawn_zone_for_player(player_id);
        let spawn_set: std::collections::HashSet<(i32, i32)> = spawn_zone.into_iter().collect();

        // Validate all placements are in the spawn zone
        for &(_unit_type_idx, q, r) in placements {
            if !spawn_set.contains(&(q, r)) {
                return Err(ServerError::invalid_message(format!(
                    "placement ({q}, {r}) is outside spawn zone"
                )));
            }
        }

        self.deployments.insert(pid, placements.to_vec());

        let all_deployed = self.deployments.len() == self.player_count;
        if all_deployed {
            self.apply_deployments()?;
        }
        Ok(all_deployed)
    }

    /// Apply all deployment submissions, placing units on the grid.
    fn apply_deployments(&mut self) -> Result<(), ServerError> {
        let army = UnitType::army();
        for (&pid, placements) in &self.deployments {
            for (i, &(_unit_type_idx, q, r)) in placements.iter().enumerate() {
                let unit_type = army.get(i).copied().unwrap_or(UnitType::Soldier);
                self.state.place_unit(unit_type, pid, Hex::new(q, r));
            }
        }

        // Transition to planning phase
        self.state.phase = GamePhase::Planning;
        self.state.turn = 1;
        self.deployments.clear();
        Ok(())
    }

    /// Submit orders for the current turn from a player.
    /// Returns true if all players have submitted.
    pub fn submit_orders(
        &mut self,
        player_id: u8,
        for_turn: u32,
        order_bytes: &[u8],
    ) -> Result<bool, ServerError> {
        if self.state.phase != GamePhase::Planning {
            return Err(ServerError::invalid_message("not in planning phase"));
        }

        if for_turn != self.state.turn {
            return Err(ServerError::TurnMismatch {
                expected: self.state.turn,
                actual: for_turn,
            });
        }

        let pid = PlayerId(player_id);

        if self.submitted.contains(&pid) {
            return Err(ServerError::invalid_message(
                "orders already submitted for this turn",
            ));
        }

        // Deserialize orders from bincode
        let unit_orders: Vec<UnitOrder> = bincode::deserialize(order_bytes).map_err(|e| {
            ServerError::invalid_message(format!("failed to deserialize orders: {e}"))
        })?;

        self.orders.insert(pid, unit_orders);
        self.submitted.push(pid);

        Ok(self.submitted.len() == self.player_count)
    }

    /// Force-submit empty orders for a player (used on timeout).
    #[allow(dead_code)] // Used by timer-driven game loop
    pub fn force_empty_orders(&mut self, player_id: u8) {
        let pid = PlayerId(player_id);
        if !self.submitted.contains(&pid) {
            self.orders.insert(pid, Vec::new());
            self.submitted.push(pid);
        }
    }

    /// Check if all players have submitted orders.
    #[allow(dead_code)] // Used by timer-driven game loop
    pub fn all_orders_submitted(&self) -> bool {
        self.submitted.len() == self.player_count
    }

    /// Resolve the current turn. Returns simulation events.
    pub fn resolve_turn(&mut self) -> Result<Vec<SimEvent>, ServerError> {
        if self.state.phase != GamePhase::Planning {
            return Err(ServerError::invalid_message(
                "cannot resolve: not in planning phase",
            ));
        }

        self.state.phase = GamePhase::Resolving;

        // Record orders in replay before simulation
        self.replay.record_turn(self.orders.clone());

        // Run simulation
        let events = simulation::simulate_turn(&mut self.state, &self.orders);

        // Clear submissions for next turn
        self.orders.clear();
        self.submitted.clear();

        Ok(events)
    }

    /// Serialize the current game state to bincode bytes.
    pub fn serialize_state(&self) -> Result<Vec<u8>, ServerError> {
        bincode::serialize(&self.state).map_err(|e| ServerError::internal(e.to_string()))
    }

    /// Serialize simulation events to bincode bytes.
    pub fn serialize_events(events: &[SimEvent]) -> Result<Vec<u8>, ServerError> {
        bincode::serialize(events).map_err(|e| ServerError::internal(e.to_string()))
    }

    /// Check if the game is finished.
    pub fn is_finished(&self) -> bool {
        matches!(self.state.phase, GamePhase::Finished(_))
    }

    /// Get the winner if the game is finished.
    pub fn winner(&self) -> Option<Option<u8>> {
        if let GamePhase::Finished(winner) = &self.state.phase {
            Some(winner.map(|pid| pid.0))
        } else {
            None
        }
    }

    /// Get the finish reason from the last events.
    pub fn finish_reason(events: &[SimEvent]) -> String {
        events
            .iter()
            .find_map(|e| {
                if let SimEvent::GameOver { reason, .. } = e {
                    Some(reason.clone())
                } else {
                    None
                }
            })
            .unwrap_or_else(|| "unknown".to_string())
    }

    /// Auto-deploy default army positions for a player who times out.
    #[allow(dead_code)] // Used by timer-driven game loop
    pub fn auto_deploy(&mut self, player_id: u8) {
        let pid = PlayerId(player_id);
        if self.deployments.contains_key(&pid) {
            return;
        }

        let spawn = self.spawn_zone_for_player(player_id);
        let army = UnitType::army();
        let placements: Vec<(u16, i32, i32)> = army
            .iter()
            .enumerate()
            .filter_map(|(i, _)| spawn.get(i).map(|&(q, r)| (i as u16, q, r)))
            .collect();

        self.deployments.insert(pid, placements);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn player_names() -> Vec<(u8, String)> {
        vec![(0, "Alice".to_string()), (1, "Bob".to_string())]
    }

    #[test]
    fn new_game_starts_in_deploying() {
        let game = GameInstance::new(&player_names(), 30_000, Some(42));
        assert_eq!(*game.phase(), GamePhase::Deploying);
        assert_eq!(game.turn(), 0);
        assert!(!game.is_finished());
    }

    #[test]
    fn spawn_zones_are_nonempty() {
        let game = GameInstance::new(&player_names(), 30_000, Some(42));
        let zone_0 = game.spawn_zone_for_player(0);
        let zone_1 = game.spawn_zone_for_player(1);
        assert!(!zone_0.is_empty());
        assert!(!zone_1.is_empty());
        // Zones should be different (opposite sides)
        assert_ne!(zone_0, zone_1);
    }

    #[test]
    fn deployment_transitions_to_planning() {
        let mut game = GameInstance::new(&player_names(), 30_000, Some(42));
        let zone_0 = game.spawn_zone_for_player(0);
        let zone_1 = game.spawn_zone_for_player(1);

        // Each player places their army
        let army = UnitType::army();
        let placements_0: Vec<(u16, i32, i32)> = army
            .iter()
            .enumerate()
            .map(|(i, _)| {
                (
                    i as u16,
                    zone_0[i % zone_0.len()].0,
                    zone_0[i % zone_0.len()].1,
                )
            })
            .collect();
        let placements_1: Vec<(u16, i32, i32)> = army
            .iter()
            .enumerate()
            .map(|(i, _)| {
                (
                    i as u16,
                    zone_1[i % zone_1.len()].0,
                    zone_1[i % zone_1.len()].1,
                )
            })
            .collect();

        let all = game.submit_deployment(0, &placements_0).expect("deploy 0");
        assert!(!all);

        let all = game.submit_deployment(1, &placements_1).expect("deploy 1");
        assert!(all);

        assert_eq!(*game.phase(), GamePhase::Planning);
        assert_eq!(game.turn(), 1);
        // Units should be placed
        assert!(!game.state.units.is_empty());
    }

    #[test]
    fn deployment_rejects_outside_spawn() {
        let mut game = GameInstance::new(&player_names(), 30_000, Some(42));
        // Place outside spawn zone
        let result = game.submit_deployment(0, &[(0, 99, 99)]);
        assert!(result.is_err());
    }

    #[test]
    fn submit_orders_validates_turn_number() {
        let mut game = GameInstance::new(&player_names(), 30_000, Some(42));
        // Auto-deploy both players
        game.auto_deploy(0);
        game.auto_deploy(1);
        game.apply_deployments().expect("deploy");

        // Submit for wrong turn
        let orders: Vec<UnitOrder> = Vec::new();
        let bytes = bincode::serialize(&orders).expect("serialize");
        let result = game.submit_orders(0, 999, &bytes);
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("turn mismatch"));
    }

    #[test]
    fn submit_orders_rejects_duplicate() {
        let mut game = GameInstance::new(&player_names(), 30_000, Some(42));
        game.auto_deploy(0);
        game.auto_deploy(1);
        game.apply_deployments().expect("deploy");

        let orders: Vec<UnitOrder> = Vec::new();
        let bytes = bincode::serialize(&orders).expect("serialize");

        game.submit_orders(0, 1, &bytes).expect("first submit");
        let result = game.submit_orders(0, 1, &bytes);
        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .to_string()
            .contains("already submitted"));
    }

    #[test]
    fn full_turn_cycle() {
        let mut game = GameInstance::new(&player_names(), 30_000, Some(42));

        // Deploy
        game.auto_deploy(0);
        game.auto_deploy(1);
        game.apply_deployments().expect("deploy");
        assert_eq!(*game.phase(), GamePhase::Planning);

        // Submit empty orders
        let empty_orders: Vec<UnitOrder> = Vec::new();
        let bytes = bincode::serialize(&empty_orders).expect("serialize");

        let all = game.submit_orders(0, 1, &bytes).expect("submit 0");
        assert!(!all);
        let all = game.submit_orders(1, 1, &bytes).expect("submit 1");
        assert!(all);

        // Resolve — with empty orders all units Hold, which may produce no events
        let _events = game.resolve_turn().expect("resolve");

        // Should be back to Planning for turn 2 (unless game ended)
        if !game.is_finished() {
            assert_eq!(*game.phase(), GamePhase::Planning);
            assert_eq!(game.turn(), 2);
        }
    }

    #[test]
    fn force_empty_orders_works() {
        let mut game = GameInstance::new(&player_names(), 30_000, Some(42));
        game.auto_deploy(0);
        game.auto_deploy(1);
        game.apply_deployments().expect("deploy");

        game.force_empty_orders(0);
        game.force_empty_orders(1);
        assert!(game.all_orders_submitted());
    }

    #[test]
    fn serialize_state_roundtrip() {
        let game = GameInstance::new(&player_names(), 30_000, Some(42));
        let bytes = game.serialize_state().expect("serialize");
        let decoded: GameState = bincode::deserialize(&bytes).expect("deserialize");
        assert_eq!(decoded.turn, game.state.turn);
    }

    #[test]
    fn replay_records_turns() {
        let mut game = GameInstance::new(&player_names(), 30_000, Some(42));
        game.auto_deploy(0);
        game.auto_deploy(1);
        game.apply_deployments().expect("deploy");

        let empty: Vec<UnitOrder> = Vec::new();
        let bytes = bincode::serialize(&empty).expect("serialize");
        game.submit_orders(0, 1, &bytes).expect("submit");
        game.submit_orders(1, 1, &bytes).expect("submit");
        game.resolve_turn().expect("resolve");

        assert_eq!(game.replay.turn_count(), 1);
    }

    #[test]
    fn winner_returns_none_when_not_finished() {
        let game = GameInstance::new(&player_names(), 30_000, Some(42));
        assert!(game.winner().is_none());
    }

    #[test]
    fn auto_deploy_is_idempotent() {
        let mut game = GameInstance::new(&player_names(), 30_000, Some(42));
        game.auto_deploy(0);
        game.auto_deploy(0); // second call should be a no-op
        assert_eq!(game.deployments.len(), 1);
    }
}
