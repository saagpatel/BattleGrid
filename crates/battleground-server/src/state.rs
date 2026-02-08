use dashmap::DashMap;

use crate::config::ServerConfig;
use crate::room::Room;

/// Shared application state, accessible from all WebSocket handlers.
pub struct AppState {
    pub rooms: DashMap<String, Room>,
    pub config: ServerConfig,
}

impl AppState {
    pub fn new(config: ServerConfig) -> Self {
        Self {
            rooms: DashMap::new(),
            config,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn new_state_has_empty_rooms() {
        let state = AppState::new(ServerConfig::default());
        assert!(state.rooms.is_empty());
    }

    #[test]
    fn state_uses_provided_config() {
        let mut config = ServerConfig::default();
        config.port = 9999;
        config.max_rooms = 42;

        let state = AppState::new(config);
        assert_eq!(state.config.port, 9999);
        assert_eq!(state.config.max_rooms, 42);
    }
}
