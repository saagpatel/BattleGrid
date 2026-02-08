use thiserror::Error;

/// Server-specific error types for WebSocket and room management.
#[derive(Debug, Error)]
pub enum ServerError {
    #[error("room not found: {room_id}")]
    RoomNotFound { room_id: String },

    #[error("room {room_id} is full (max {max_players} players)")]
    RoomFull { room_id: String, max_players: u8 },

    #[error("player not found: {player_name}")]
    PlayerNotFound { player_name: String },

    #[error("game has not started in room {room_id}")]
    GameNotStarted { room_id: String },

    #[error("invalid message: {reason}")]
    InvalidMessage { reason: String },

    #[error("protocol version mismatch: expected {expected}, got {actual}")]
    ProtocolVersionMismatch { expected: u8, actual: u8 },

    #[error("turn mismatch: expected {expected}, got {actual}")]
    #[allow(dead_code)] // Used in Phase 3 game logic
    TurnMismatch { expected: u32, actual: u32 },

    #[error("internal server error: {0}")]
    InternalError(String),
}

impl ServerError {
    pub fn invalid_message(reason: impl Into<String>) -> Self {
        Self::InvalidMessage {
            reason: reason.into(),
        }
    }

    pub fn internal(reason: impl Into<String>) -> Self {
        Self::InternalError(reason.into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn error_messages_format_correctly() {
        let err = ServerError::RoomNotFound {
            room_id: "ABC123".to_string(),
        };
        assert_eq!(err.to_string(), "room not found: ABC123");

        let err = ServerError::RoomFull {
            room_id: "XYZ".to_string(),
            max_players: 2,
        };
        assert_eq!(err.to_string(), "room XYZ is full (max 2 players)");

        let err = ServerError::ProtocolVersionMismatch {
            expected: 1,
            actual: 2,
        };
        assert_eq!(
            err.to_string(),
            "protocol version mismatch: expected 1, got 2"
        );

        let err = ServerError::TurnMismatch {
            expected: 5,
            actual: 3,
        };
        assert_eq!(err.to_string(), "turn mismatch: expected 5, got 3");
    }

    #[test]
    fn convenience_constructors() {
        let err = ServerError::invalid_message("bad data");
        assert_eq!(err.to_string(), "invalid message: bad data");

        let err = ServerError::internal("something broke");
        assert_eq!(err.to_string(), "internal server error: something broke");
    }
}
