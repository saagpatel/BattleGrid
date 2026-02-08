use rand::Rng;

use crate::error::ServerError;
use crate::protocol::{RoomConfig, RoomInfo};
use crate::room::{Room, RoomStatus};
use crate::state::AppState;

/// Generate a 6-character alphanumeric room code.
pub fn generate_room_code() -> String {
    const CHARS: &[u8] = b"ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I to avoid confusion
    let mut rng = rand::thread_rng();
    (0..6)
        .map(|_| {
            let idx = rng.gen_range(0..CHARS.len());
            CHARS[idx] as char
        })
        .collect()
}

/// Create a new room in the app state. Returns the room id.
pub fn create_room(state: &AppState, config: RoomConfig) -> Result<String, ServerError> {
    if state.rooms.len() >= state.config.max_rooms {
        return Err(ServerError::internal("maximum room limit reached"));
    }

    // Generate a unique room code (retry on collision)
    let room_id = {
        let mut code = generate_room_code();
        let mut attempts = 0;
        while state.rooms.contains_key(&code) {
            code = generate_room_code();
            attempts += 1;
            if attempts > 100 {
                return Err(ServerError::internal("failed to generate unique room code"));
            }
        }
        code
    };

    let room = Room::new(room_id.clone(), config);
    state.rooms.insert(room_id.clone(), room);
    Ok(room_id)
}

/// List all rooms with `Waiting` status.
pub fn list_rooms(state: &AppState) -> Vec<RoomInfo> {
    state
        .rooms
        .iter()
        .filter(|entry| entry.value().status == RoomStatus::Waiting)
        .map(|entry| entry.value().info())
        .collect()
}

/// Find a waiting room with available space, or create a new one.
/// Returns the room id.
pub fn quick_match(state: &AppState) -> Result<String, ServerError> {
    // Try to find an existing waiting room with space
    for entry in state.rooms.iter() {
        if entry.value().has_space() {
            return Ok(entry.key().clone());
        }
    }

    // No room found — create a new one with defaults
    create_room(state, RoomConfig::default())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::ServerConfig;

    fn make_state() -> AppState {
        AppState::new(ServerConfig::default())
    }

    #[test]
    fn generate_room_code_length() {
        let code = generate_room_code();
        assert_eq!(code.len(), 6);
    }

    #[test]
    fn generate_room_code_is_alphanumeric() {
        for _ in 0..100 {
            let code = generate_room_code();
            assert!(
                code.chars().all(|c| c.is_ascii_alphanumeric()),
                "code contains non-alphanumeric: {code}"
            );
        }
    }

    #[test]
    fn generate_room_code_no_confusing_chars() {
        for _ in 0..1000 {
            let code = generate_room_code();
            assert!(!code.contains('0'), "code contains '0': {code}");
            assert!(!code.contains('O'), "code contains 'O': {code}");
            assert!(!code.contains('1'), "code contains '1': {code}");
            assert!(!code.contains('I'), "code contains 'I': {code}");
        }
    }

    #[test]
    fn create_room_adds_to_state() {
        let state = make_state();
        let room_id = create_room(&state, RoomConfig::default()).expect("create");
        assert!(state.rooms.contains_key(&room_id));
    }

    #[test]
    fn create_room_respects_max_rooms() {
        let mut config = ServerConfig::default();
        config.max_rooms = 2;
        let state = AppState::new(config);

        create_room(&state, RoomConfig::default()).expect("create 1");
        create_room(&state, RoomConfig::default()).expect("create 2");

        let result = create_room(&state, RoomConfig::default());
        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .to_string()
            .contains("maximum room limit"));
    }

    #[test]
    fn list_rooms_only_waiting() {
        let state = make_state();
        let id1 = create_room(&state, RoomConfig::default()).expect("create");
        let id2 = create_room(&state, RoomConfig::default()).expect("create");

        // Set one room to Playing
        state.rooms.get_mut(&id2).expect("room").status = RoomStatus::Playing;

        let rooms = list_rooms(&state);
        assert_eq!(rooms.len(), 1);
        assert_eq!(rooms[0].room_id, id1);
    }

    #[test]
    fn quick_match_creates_room_when_none_available() {
        let state = make_state();
        let room_id = quick_match(&state).expect("quick match");
        assert!(state.rooms.contains_key(&room_id));
    }

    #[test]
    fn quick_match_returns_existing_room_with_space() {
        let state = make_state();
        let existing_id = create_room(&state, RoomConfig::default()).expect("create");

        // Add one player to make it non-empty but still has space
        {
            let mut room = state.rooms.get_mut(&existing_id).expect("room");
            let (tx, _rx) = tokio::sync::mpsc::channel(16);
            room.join("Alice".to_string(), tx).expect("join");
        }

        let matched_id = quick_match(&state).expect("quick match");
        assert_eq!(matched_id, existing_id);
    }
}
