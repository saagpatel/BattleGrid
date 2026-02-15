use serde::{Deserialize, Serialize};

use crate::error::ServerError;

/// Protocol version byte prefix on all WebSocket messages (Ruling R7).
pub const PROTOCOL_VERSION: u8 = 1;

/// Server-to-client messages.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum ServerMessage {
    RoomCreated {
        room_id: String,
    },
    RoomJoined {
        room_id: String,
        player_id: u8,
    },
    PlayerJoined {
        player_name: String,
    },
    PlayerLeft {
        player_name: String,
    },
    PlayerReady {
        player_name: String,
    },
    AllPlayersReady,
    GameStarted {
        your_player_id: u8,
    },
    DeploymentPhaseStarted {
        spawn_zone: Vec<(i32, i32)>,
        time_limit_ms: u64,
    },
    PlanningPhaseStarted {
        turn_number: u32,
        time_limit_ms: u64,
    },
    ResolutionStarted {
        events: Vec<u8>,
    },
    TurnCompleted {
        state: Vec<u8>,
    },
    GameOver {
        winner: Option<u8>,
        reason: String,
    },
    ReplayData {
        replay_bytes: Vec<u8>,
    },
    Error {
        message: String,
    },
    RoomList {
        rooms: Vec<RoomInfo>,
    },
    Pong,
}

/// Room summary for lobby listings.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct RoomInfo {
    pub room_id: String,
    pub player_count: u8,
    pub max_players: u8,
}

/// Room configuration sent by the client when creating a room.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct RoomConfig {
    pub max_players: u8,
    pub turn_timer_ms: u64,
    pub map_seed: Option<u64>,
}

impl Default for RoomConfig {
    fn default() -> Self {
        Self {
            max_players: 2,
            turn_timer_ms: 30_000,
            map_seed: None,
        }
    }
}

/// Client-to-server messages.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum ClientMessage {
    CreateRoom {
        player_name: String,
        config: RoomConfig,
    },
    JoinRoom {
        room_id: String,
        player_name: String,
    },
    QuickMatch {
        player_name: String,
    },
    SetReady,
    SubmitDeployment {
        placements: Vec<(u16, i32, i32)>,
    },
    SubmitOrders {
        for_turn: u32,
        orders: Vec<u8>,
    },
    ListRooms,
    Ping,
    LeaveRoom,
}

/// Encode a server message with the protocol version prefix.
///
/// Wire format: `[PROTOCOL_VERSION: u8][bincode payload...]`
pub fn encode(msg: &ServerMessage) -> Result<Vec<u8>, ServerError> {
    let payload = bincode::serialize(msg).map_err(|e| ServerError::internal(e.to_string()))?;
    let mut buf = Vec::with_capacity(1 + payload.len());
    buf.push(PROTOCOL_VERSION);
    buf.extend_from_slice(&payload);
    Ok(buf)
}

/// Decode a client message from raw bytes, validating the protocol version prefix.
///
/// Wire format: `[PROTOCOL_VERSION: u8][bincode payload...]`
pub fn decode(bytes: &[u8]) -> Result<ClientMessage, ServerError> {
    if bytes.is_empty() {
        return Err(ServerError::invalid_message("empty message"));
    }

    let version = bytes[0];
    if version != PROTOCOL_VERSION {
        return Err(ServerError::ProtocolVersionMismatch {
            expected: PROTOCOL_VERSION,
            actual: version,
        });
    }

    bincode::deserialize(&bytes[1..])
        .map_err(|e| ServerError::invalid_message(format!("failed to deserialize: {e}")))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn encode_decode_roundtrip_ping() {
        let msg = ClientMessage::Ping;
        let payload = bincode::serialize(&msg).expect("serialize");
        let mut wire = vec![PROTOCOL_VERSION];
        wire.extend_from_slice(&payload);

        let decoded = decode(&wire).expect("decode");
        assert_eq!(decoded, msg);
    }

    #[test]
    fn encode_decode_roundtrip_create_room() {
        let msg = ClientMessage::CreateRoom {
            player_name: "Alice".to_string(),
            config: RoomConfig::default(),
        };
        let payload = bincode::serialize(&msg).expect("serialize");
        let mut wire = vec![PROTOCOL_VERSION];
        wire.extend_from_slice(&payload);

        let decoded = decode(&wire).expect("decode");
        assert_eq!(decoded, msg);
    }

    #[test]
    fn encode_decode_roundtrip_submit_orders() {
        let msg = ClientMessage::SubmitOrders {
            for_turn: 42,
            orders: vec![1, 2, 3, 4],
        };
        let payload = bincode::serialize(&msg).expect("serialize");
        let mut wire = vec![PROTOCOL_VERSION];
        wire.extend_from_slice(&payload);

        let decoded = decode(&wire).expect("decode");
        assert_eq!(decoded, msg);
    }

    #[test]
    fn server_message_encode_roundtrip() {
        let msg = ServerMessage::RoomCreated {
            room_id: "ABC123".to_string(),
        };
        let bytes = encode(&msg).expect("encode");

        assert_eq!(bytes[0], PROTOCOL_VERSION);
        let decoded: ServerMessage = bincode::deserialize(&bytes[1..]).expect("deserialize");
        assert_eq!(decoded, msg);
    }

    #[test]
    fn server_message_encode_all_variants() {
        let messages = vec![
            ServerMessage::RoomCreated {
                room_id: "R1".to_string(),
            },
            ServerMessage::RoomJoined {
                room_id: "R1".to_string(),
                player_id: 0,
            },
            ServerMessage::PlayerJoined {
                player_name: "Bob".to_string(),
            },
            ServerMessage::PlayerLeft {
                player_name: "Bob".to_string(),
            },
            ServerMessage::PlayerReady {
                player_name: "Bob".to_string(),
            },
            ServerMessage::AllPlayersReady,
            ServerMessage::GameStarted { your_player_id: 1 },
            ServerMessage::DeploymentPhaseStarted {
                spawn_zone: vec![(0, 0), (1, -1)],
                time_limit_ms: 30_000,
            },
            ServerMessage::PlanningPhaseStarted {
                turn_number: 1,
                time_limit_ms: 30_000,
            },
            ServerMessage::ResolutionStarted {
                events: vec![10, 20],
            },
            ServerMessage::TurnCompleted {
                state: vec![30, 40],
            },
            ServerMessage::GameOver {
                winner: Some(0),
                reason: "annihilation".to_string(),
            },
            ServerMessage::Error {
                message: "oops".to_string(),
            },
            ServerMessage::RoomList {
                rooms: vec![RoomInfo {
                    room_id: "R1".to_string(),
                    player_count: 1,
                    max_players: 2,
                }],
            },
            ServerMessage::Pong,
        ];

        for msg in &messages {
            let bytes = encode(msg).expect("encode");
            assert_eq!(bytes[0], PROTOCOL_VERSION);
            let decoded: ServerMessage = bincode::deserialize(&bytes[1..]).expect("deserialize");
            assert_eq!(&decoded, msg);
        }
    }

    #[test]
    fn decode_rejects_empty() {
        let result = decode(&[]);
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(err.to_string().contains("empty message"));
    }

    #[test]
    fn decode_rejects_wrong_version() {
        let msg = ClientMessage::Ping;
        let payload = bincode::serialize(&msg).expect("serialize");
        let mut wire = vec![99]; // wrong version
        wire.extend_from_slice(&payload);

        let result = decode(&wire);
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(err.to_string().contains("protocol version mismatch"));
    }

    #[test]
    fn decode_rejects_garbage() {
        let wire = vec![PROTOCOL_VERSION, 0xFF, 0xFF, 0xFF];
        let result = decode(&wire);
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(err.to_string().contains("failed to deserialize"));
    }

    #[test]
    fn room_config_default() {
        let config = RoomConfig::default();
        assert_eq!(config.max_players, 2);
        assert_eq!(config.turn_timer_ms, 30_000);
        assert!(config.map_seed.is_none());
    }

    #[test]
    fn client_message_all_variants_serialize() {
        let messages = vec![
            ClientMessage::CreateRoom {
                player_name: "Alice".to_string(),
                config: RoomConfig::default(),
            },
            ClientMessage::JoinRoom {
                room_id: "R1".to_string(),
                player_name: "Bob".to_string(),
            },
            ClientMessage::QuickMatch {
                player_name: "Charlie".to_string(),
            },
            ClientMessage::SetReady,
            ClientMessage::SubmitDeployment {
                placements: vec![(1, 0, 0), (2, 1, -1)],
            },
            ClientMessage::SubmitOrders {
                for_turn: 1,
                orders: vec![1, 2, 3],
            },
            ClientMessage::ListRooms,
            ClientMessage::Ping,
            ClientMessage::LeaveRoom,
        ];

        for msg in &messages {
            let payload = bincode::serialize(msg).expect("serialize");
            let mut wire = vec![PROTOCOL_VERSION];
            wire.extend_from_slice(&payload);
            let decoded = decode(&wire).expect("decode");
            assert_eq!(&decoded, msg);
        }
    }
}
