use serde::{Deserialize, Serialize};
use tokio::sync::mpsc;
use tokio::time::Instant;

use crate::error::ServerError;
use crate::game::GameInstance;
use crate::protocol::{self, RoomConfig, RoomInfo, ServerMessage};
use crate::reconnect::DisconnectTracker;

/// Status of a game room.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum RoomStatus {
    Waiting,
    Playing,
    Finished,
}

/// A connected player within a room.
pub struct PlayerConnection {
    pub id: u8,
    pub name: String,
    pub ready: bool,
    pub sender: mpsc::Sender<Vec<u8>>,
}

/// A game room holding players and configuration.
pub struct Room {
    pub id: String,
    pub players: Vec<PlayerConnection>,
    pub config: RoomConfig,
    pub status: RoomStatus,
    #[allow(dead_code)] // Used for room timeout cleanup
    pub created_at: Instant,
    /// Active game instance (set when game starts).
    pub game: Option<GameInstance>,
    /// Tracks disconnected players during an active game.
    pub disconnect_tracker: DisconnectTracker,
}

impl Room {
    /// Create a new room with the given id and configuration.
    pub fn new(id: String, config: RoomConfig) -> Self {
        Self {
            id,
            players: Vec::new(),
            config,
            status: RoomStatus::Waiting,
            created_at: Instant::now(),
            game: None,
            disconnect_tracker: DisconnectTracker::new(),
        }
    }

    /// Start the game, creating a GameInstance and transitioning to Playing.
    pub fn start_game(&mut self) -> Result<(), ServerError> {
        if self.status != RoomStatus::Waiting {
            return Err(ServerError::invalid_message("room is not in waiting state"));
        }

        let player_names: Vec<(u8, String)> = self
            .players
            .iter()
            .map(|p| (p.id, p.name.clone()))
            .collect();

        let game = GameInstance::new(
            &player_names,
            self.config.turn_timer_ms,
            self.config.map_seed,
        );

        self.game = Some(game);
        self.status = RoomStatus::Playing;
        Ok(())
    }

    /// Add a player to the room. Returns the assigned player id.
    pub fn join(&mut self, name: String, sender: mpsc::Sender<Vec<u8>>) -> Result<u8, ServerError> {
        if self.status != RoomStatus::Waiting {
            return Err(ServerError::RoomFull {
                room_id: self.id.clone(),
                max_players: self.config.max_players,
            });
        }

        if self.players.len() >= self.config.max_players as usize {
            return Err(ServerError::RoomFull {
                room_id: self.id.clone(),
                max_players: self.config.max_players,
            });
        }

        let player_id = self.next_player_id();
        self.players.push(PlayerConnection {
            id: player_id,
            name,
            ready: false,
            sender,
        });
        Ok(player_id)
    }

    /// Remove a player from the room by name. Returns the removed player's name if found.
    pub fn leave(&mut self, player_name: &str) -> Result<String, ServerError> {
        let idx = self
            .players
            .iter()
            .position(|p| p.name == player_name)
            .ok_or_else(|| ServerError::PlayerNotFound {
                player_name: player_name.to_string(),
            })?;

        let player = self.players.remove(idx);
        Ok(player.name)
    }

    /// Mark a player as ready. Returns the player's name.
    pub fn set_ready(&mut self, player_name: &str) -> Result<String, ServerError> {
        let player = self
            .players
            .iter_mut()
            .find(|p| p.name == player_name)
            .ok_or_else(|| ServerError::PlayerNotFound {
                player_name: player_name.to_string(),
            })?;

        player.ready = true;
        Ok(player.name.clone())
    }

    /// Check if all players are ready (requires at least max_players).
    pub fn all_ready(&self) -> bool {
        self.players.len() == self.config.max_players as usize
            && self.players.iter().all(|p| p.ready)
    }

    /// Broadcast a server message to all players in the room.
    pub async fn broadcast(&self, msg: &ServerMessage) -> Result<(), ServerError> {
        let bytes = protocol::encode(msg)?;
        for player in &self.players {
            // Best-effort send — if a player's channel is full we skip them
            let _ = player.sender.try_send(bytes.clone());
        }
        Ok(())
    }

    /// Send a message to a specific player by id.
    pub async fn send_to(&self, player_id: u8, msg: &ServerMessage) -> Result<(), ServerError> {
        let bytes = protocol::encode(msg)?;
        let player = self
            .players
            .iter()
            .find(|p| p.id == player_id)
            .ok_or_else(|| ServerError::PlayerNotFound {
                player_name: format!("player_id={player_id}"),
            })?;

        let _ = player.sender.try_send(bytes);
        Ok(())
    }

    /// Get a summary of this room for lobby listings.
    pub fn info(&self) -> RoomInfo {
        RoomInfo {
            room_id: self.id.clone(),
            player_count: self.players.len() as u8,
            max_players: self.config.max_players,
        }
    }

    /// Has available space for more players?
    pub fn has_space(&self) -> bool {
        self.status == RoomStatus::Waiting
            && (self.players.len() < self.config.max_players as usize)
    }

    /// Find the next available player id (0-based).
    fn next_player_id(&self) -> u8 {
        let used: Vec<u8> = self.players.iter().map(|p| p.id).collect();
        (0..=255).find(|id| !used.contains(id)).unwrap_or(0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_sender() -> mpsc::Sender<Vec<u8>> {
        let (tx, _rx) = mpsc::channel(16);
        tx
    }

    #[test]
    fn new_room_is_waiting() {
        let room = Room::new("TEST".to_string(), RoomConfig::default());
        assert_eq!(room.status, RoomStatus::Waiting);
        assert!(room.players.is_empty());
        assert_eq!(room.id, "TEST");
    }

    #[test]
    fn join_assigns_sequential_ids() {
        let mut room = Room::new("R1".to_string(), RoomConfig::default());
        let id0 = room.join("Alice".to_string(), make_sender()).expect("join");
        let id1 = room.join("Bob".to_string(), make_sender()).expect("join");
        assert_eq!(id0, 0);
        assert_eq!(id1, 1);
    }

    #[test]
    fn join_rejects_when_full() {
        let mut room = Room::new("R1".to_string(), RoomConfig::default()); // max_players = 2
        room.join("Alice".to_string(), make_sender()).expect("join");
        room.join("Bob".to_string(), make_sender()).expect("join");

        let result = room.join("Charlie".to_string(), make_sender());
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("full"));
    }

    #[test]
    fn leave_removes_player() {
        let mut room = Room::new("R1".to_string(), RoomConfig::default());
        room.join("Alice".to_string(), make_sender()).expect("join");
        room.join("Bob".to_string(), make_sender()).expect("join");

        let name = room.leave("Alice").expect("leave");
        assert_eq!(name, "Alice");
        assert_eq!(room.players.len(), 1);
        assert_eq!(room.players[0].name, "Bob");
    }

    #[test]
    fn leave_unknown_player_errors() {
        let mut room = Room::new("R1".to_string(), RoomConfig::default());
        let result = room.leave("Ghost");
        assert!(result.is_err());
    }

    #[test]
    fn set_ready_marks_player() {
        let mut room = Room::new("R1".to_string(), RoomConfig::default());
        room.join("Alice".to_string(), make_sender()).expect("join");

        assert!(!room.players[0].ready);
        room.set_ready("Alice").expect("ready");
        assert!(room.players[0].ready);
    }

    #[test]
    fn set_ready_unknown_player_errors() {
        let mut room = Room::new("R1".to_string(), RoomConfig::default());
        let result = room.set_ready("Ghost");
        assert!(result.is_err());
    }

    #[test]
    fn all_ready_requires_full_room() {
        let mut room = Room::new("R1".to_string(), RoomConfig::default());
        room.join("Alice".to_string(), make_sender()).expect("join");
        room.set_ready("Alice").expect("ready");

        // Only 1 of 2 players — not all ready
        assert!(!room.all_ready());
    }

    #[test]
    fn all_ready_when_full_and_ready() {
        let mut room = Room::new("R1".to_string(), RoomConfig::default());
        room.join("Alice".to_string(), make_sender()).expect("join");
        room.join("Bob".to_string(), make_sender()).expect("join");

        assert!(!room.all_ready());

        room.set_ready("Alice").expect("ready");
        assert!(!room.all_ready());

        room.set_ready("Bob").expect("ready");
        assert!(room.all_ready());
    }

    #[test]
    fn has_space_true_when_waiting() {
        let mut room = Room::new("R1".to_string(), RoomConfig::default());
        assert!(room.has_space());

        room.join("Alice".to_string(), make_sender()).expect("join");
        assert!(room.has_space());
    }

    #[test]
    fn has_space_false_when_full() {
        let mut room = Room::new("R1".to_string(), RoomConfig::default());
        room.join("Alice".to_string(), make_sender()).expect("join");
        room.join("Bob".to_string(), make_sender()).expect("join");
        assert!(!room.has_space());
    }

    #[test]
    fn has_space_false_when_playing() {
        let mut room = Room::new("R1".to_string(), RoomConfig::default());
        room.status = RoomStatus::Playing;
        assert!(!room.has_space());
    }

    #[test]
    fn info_returns_summary() {
        let mut room = Room::new("R1".to_string(), RoomConfig::default());
        room.join("Alice".to_string(), make_sender()).expect("join");

        let info = room.info();
        assert_eq!(info.room_id, "R1");
        assert_eq!(info.player_count, 1);
        assert_eq!(info.max_players, 2);
    }

    #[test]
    fn rejoin_after_leave_reuses_id() {
        let mut room = Room::new("R1".to_string(), RoomConfig::default());
        room.join("Alice".to_string(), make_sender()).expect("join"); // id 0
        room.join("Bob".to_string(), make_sender()).expect("join"); // id 1
        room.leave("Alice").expect("leave"); // free id 0

        let id = room
            .join("Charlie".to_string(), make_sender())
            .expect("join");
        assert_eq!(id, 0); // should reuse id 0
    }
}
