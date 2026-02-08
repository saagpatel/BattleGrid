use std::sync::Arc;

use axum::{
    extract::{
        ws::{Message, WebSocket},
        State, WebSocketUpgrade,
    },
    response::IntoResponse,
    Router,
};
use tokio::sync::mpsc;
use tracing::{info, warn};

use crate::error::ServerError;
use crate::game::GameInstance;
use crate::lobby;
use crate::protocol::{self, ClientMessage, ServerMessage};
use crate::room::RoomStatus;
use crate::state::AppState;

/// Axum handler for WebSocket upgrade.
pub async fn ws_handler(
    ws: WebSocketUpgrade,
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_socket(socket, state))
}

/// Per-connection state tracking which room and player this socket belongs to.
struct ConnectionState {
    room_id: Option<String>,
    player_name: Option<String>,
    player_id: Option<u8>,
}

async fn handle_socket(socket: WebSocket, state: Arc<AppState>) {
    let (mut ws_sender, mut ws_receiver) = socket.split();
    let (tx, mut rx) = mpsc::channel::<Vec<u8>>(64);

    let mut conn = ConnectionState {
        room_id: None,
        player_name: None,
        player_id: None,
    };

    // Spawn a task to forward messages from the channel to the WebSocket
    use axum::extract::ws::Message as WsMsg;
    use futures_util::{SinkExt, StreamExt};

    let send_task = tokio::spawn(async move {
        while let Some(bytes) = rx.recv().await {
            if ws_sender.send(WsMsg::Binary(bytes.into())).await.is_err() {
                break;
            }
        }
    });

    // Main receive loop — process binary frames only
    while let Some(msg_result) = ws_receiver.next().await {
        let msg = match msg_result {
            Ok(m) => m,
            Err(e) => {
                warn!("WebSocket receive error: {e}");
                break;
            }
        };

        match msg {
            Message::Binary(bytes) => {
                if let Err(e) = handle_binary_message(&bytes, &state, &tx, &mut conn).await {
                    let error_msg = ServerMessage::Error {
                        message: e.to_string(),
                    };
                    if let Ok(encoded) = protocol::encode(&error_msg) {
                        let _ = tx.try_send(encoded);
                    }
                }
            }
            Message::Close(_) => {
                break;
            }
            // Ignore text, ping, pong frames
            _ => {}
        }
    }

    // Cleanup: remove player from room on disconnect
    if let (Some(room_id), Some(player_name)) = (&conn.room_id, &conn.player_name) {
        if let Some(mut room) = state.rooms.get_mut(room_id) {
            // If game is active, track disconnect instead of immediately removing
            if room.status == RoomStatus::Playing {
                if let Some(pid) = conn.player_id {
                    room.disconnect_tracker.player_disconnected(pid);
                    info!("Player {player_name} disconnected from active game in room {room_id}");
                    let msg = ServerMessage::PlayerLeft {
                        player_name: player_name.clone(),
                    };
                    let _ = room.broadcast(&msg).await;
                }
            } else {
                if let Ok(name) = room.leave(player_name) {
                    info!("Player {name} disconnected from room {room_id}");
                    let msg = ServerMessage::PlayerLeft { player_name: name };
                    let _ = room.broadcast(&msg).await;
                }

                // Clean up empty rooms
                if room.players.is_empty() {
                    drop(room);
                    state.rooms.remove(room_id);
                    info!("Removed empty room {room_id}");
                }
            }
        }
    }

    send_task.abort();
}

async fn handle_binary_message(
    bytes: &[u8],
    state: &Arc<AppState>,
    tx: &mpsc::Sender<Vec<u8>>,
    conn: &mut ConnectionState,
) -> Result<(), ServerError> {
    let client_msg = protocol::decode(bytes)?;

    match client_msg {
        ClientMessage::Ping => {
            let resp = protocol::encode(&ServerMessage::Pong)?;
            let _ = tx.try_send(resp);
        }

        ClientMessage::ListRooms => {
            let rooms = lobby::list_rooms(state);
            let resp = protocol::encode(&ServerMessage::RoomList { rooms })?;
            let _ = tx.try_send(resp);
        }

        ClientMessage::CreateRoom {
            player_name,
            config,
        } => {
            let room_id = lobby::create_room(state, config)?;
            let mut room =
                state
                    .rooms
                    .get_mut(&room_id)
                    .ok_or_else(|| ServerError::RoomNotFound {
                        room_id: room_id.clone(),
                    })?;

            let player_id = room.join(player_name.clone(), tx.clone())?;

            conn.room_id = Some(room_id.clone());
            conn.player_name = Some(player_name);
            conn.player_id = Some(player_id);

            let resp = protocol::encode(&ServerMessage::RoomCreated {
                room_id: room_id.clone(),
            })?;
            let _ = tx.try_send(resp);

            let join_resp = protocol::encode(&ServerMessage::RoomJoined { room_id, player_id })?;
            let _ = tx.try_send(join_resp);
        }

        ClientMessage::JoinRoom {
            room_id,
            player_name,
        } => {
            let mut room =
                state
                    .rooms
                    .get_mut(&room_id)
                    .ok_or_else(|| ServerError::RoomNotFound {
                        room_id: room_id.clone(),
                    })?;

            let player_id = room.join(player_name.clone(), tx.clone())?;

            // Notify existing players
            let join_msg = ServerMessage::PlayerJoined {
                player_name: player_name.clone(),
            };
            let _ = room.broadcast(&join_msg).await;

            conn.room_id = Some(room_id.clone());
            conn.player_name = Some(player_name);
            conn.player_id = Some(player_id);

            let resp = protocol::encode(&ServerMessage::RoomJoined { room_id, player_id })?;
            let _ = tx.try_send(resp);
        }

        ClientMessage::QuickMatch { player_name } => {
            let room_id = lobby::quick_match(state)?;
            let mut room =
                state
                    .rooms
                    .get_mut(&room_id)
                    .ok_or_else(|| ServerError::RoomNotFound {
                        room_id: room_id.clone(),
                    })?;

            let player_id = room.join(player_name.clone(), tx.clone())?;

            let join_msg = ServerMessage::PlayerJoined {
                player_name: player_name.clone(),
            };
            let _ = room.broadcast(&join_msg).await;

            conn.room_id = Some(room_id.clone());
            conn.player_name = Some(player_name);
            conn.player_id = Some(player_id);

            let resp = protocol::encode(&ServerMessage::RoomJoined { room_id, player_id })?;
            let _ = tx.try_send(resp);
        }

        ClientMessage::SetReady => {
            let room_id = conn
                .room_id
                .as_ref()
                .ok_or_else(|| ServerError::invalid_message("not in a room"))?;
            let player_name = conn
                .player_name
                .as_ref()
                .ok_or_else(|| ServerError::invalid_message("no player name set"))?;

            let mut room =
                state
                    .rooms
                    .get_mut(room_id)
                    .ok_or_else(|| ServerError::RoomNotFound {
                        room_id: room_id.clone(),
                    })?;

            let name = room.set_ready(player_name)?;

            let ready_msg = ServerMessage::PlayerReady { player_name: name };
            let _ = room.broadcast(&ready_msg).await;

            if room.all_ready() {
                let _ = room.broadcast(&ServerMessage::AllPlayersReady).await;

                // Start the game
                room.start_game()?;

                // Send GameStarted to each player with their ID
                for player in &room.players {
                    let msg = ServerMessage::GameStarted {
                        your_player_id: player.id,
                    };
                    let _ = room.send_to(player.id, &msg).await;
                }

                // Send DeploymentPhaseStarted to each player with their spawn zone
                if let Some(game) = &room.game {
                    for player in &room.players {
                        let spawn_zone = game.spawn_zone_for_player(player.id);
                        let msg = ServerMessage::DeploymentPhaseStarted {
                            spawn_zone,
                            time_limit_ms: game.turn_timer_ms,
                        };
                        let _ = room.send_to(player.id, &msg).await;
                    }
                }
            }
        }

        ClientMessage::LeaveRoom => {
            let room_id = conn
                .room_id
                .take()
                .ok_or_else(|| ServerError::invalid_message("not in a room"))?;
            let player_name = conn
                .player_name
                .take()
                .ok_or_else(|| ServerError::invalid_message("no player name set"))?;
            conn.player_id = None;

            let should_remove = {
                let mut room =
                    state
                        .rooms
                        .get_mut(&room_id)
                        .ok_or_else(|| ServerError::RoomNotFound {
                            room_id: room_id.clone(),
                        })?;

                let name = room.leave(&player_name)?;

                let leave_msg = ServerMessage::PlayerLeft { player_name: name };
                let _ = room.broadcast(&leave_msg).await;

                room.players.is_empty()
            };

            if should_remove {
                state.rooms.remove(&room_id);
                info!("Removed empty room {room_id}");
            }
        }

        ClientMessage::SubmitDeployment { placements } => {
            let room_id = conn
                .room_id
                .as_ref()
                .ok_or_else(|| ServerError::invalid_message("not in a room"))?;
            let player_id = conn
                .player_id
                .ok_or_else(|| ServerError::invalid_message("no player id"))?;

            let mut room =
                state
                    .rooms
                    .get_mut(room_id)
                    .ok_or_else(|| ServerError::RoomNotFound {
                        room_id: room_id.clone(),
                    })?;

            if room.status != RoomStatus::Playing {
                return Err(ServerError::GameNotStarted {
                    room_id: room_id.clone(),
                });
            }

            // Take game out of room to avoid double mutable borrow
            let mut game = room
                .game
                .take()
                .ok_or_else(|| ServerError::internal("game not initialized"))?;

            let all_deployed = game.submit_deployment(player_id, &placements)?;

            if all_deployed {
                // Transition to planning phase — notify all players
                let turn = game.turn();
                let timer_ms = game.turn_timer_ms;

                let msg = ServerMessage::PlanningPhaseStarted {
                    turn_number: turn,
                    time_limit_ms: timer_ms,
                };
                let _ = room.broadcast(&msg).await;
            }

            // Put game back
            room.game = Some(game);
        }

        ClientMessage::SubmitOrders { for_turn, orders } => {
            let room_id = conn
                .room_id
                .as_ref()
                .ok_or_else(|| ServerError::invalid_message("not in a room"))?;
            let player_id = conn
                .player_id
                .ok_or_else(|| ServerError::invalid_message("no player id"))?;

            let mut room =
                state
                    .rooms
                    .get_mut(room_id)
                    .ok_or_else(|| ServerError::RoomNotFound {
                        room_id: room_id.clone(),
                    })?;

            if room.status != RoomStatus::Playing {
                return Err(ServerError::GameNotStarted {
                    room_id: room_id.clone(),
                });
            }

            // Take game out of room to avoid double mutable borrow
            let mut game = room
                .game
                .take()
                .ok_or_else(|| ServerError::internal("game not initialized"))?;

            let all_submitted = game.submit_orders(player_id, for_turn, &orders)?;

            if all_submitted {
                resolve_and_broadcast(&mut room, &mut game).await?;
            }

            // Put game back
            room.game = Some(game);
        }
    }

    Ok(())
}

/// Build the application router for testing and production use.
pub fn build_app(state: Arc<AppState>) -> Router<()> {
    Router::new()
        .route("/ws", axum::routing::get(ws_handler))
        .route("/health", axum::routing::get(|| async { "ok" }))
        .layer(tower_http::cors::CorsLayer::permissive())
        .with_state(state)
}

/// Resolve the current turn and broadcast results to all players.
async fn resolve_and_broadcast(
    room: &mut crate::room::Room,
    game: &mut GameInstance,
) -> Result<(), ServerError> {
    let events = game.resolve_turn()?;

    // Broadcast resolution events
    let events_bytes = GameInstance::serialize_events(&events)?;
    let resolution_msg = ServerMessage::ResolutionStarted {
        events: events_bytes,
    };
    let _ = room.broadcast(&resolution_msg).await;

    // Broadcast updated state
    let state_bytes = game.serialize_state()?;
    let state_msg = ServerMessage::TurnCompleted { state: state_bytes };
    let _ = room.broadcast(&state_msg).await;

    // Check if game is over
    if game.is_finished() {
        let winner = game.winner().flatten();
        let reason = GameInstance::finish_reason(&events);
        let game_over_msg = ServerMessage::GameOver { winner, reason };
        let _ = room.broadcast(&game_over_msg).await;
        room.status = RoomStatus::Finished;
    } else {
        // Start next planning phase
        let turn = game.turn();
        let timer_ms = game.turn_timer_ms;
        let planning_msg = ServerMessage::PlanningPhaseStarted {
            turn_number: turn,
            time_limit_ms: timer_ms,
        };
        let _ = room.broadcast(&planning_msg).await;
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::ServerConfig;
    use crate::protocol::{ClientMessage, RoomConfig, ServerMessage, PROTOCOL_VERSION};
    use futures_util::{SinkExt, StreamExt};
    use tokio::net::TcpListener;
    use tokio_tungstenite::{connect_async, tungstenite::Message as TsMsg};

    /// Start a test server on an ephemeral port. Returns the WS URL.
    async fn start_test_server() -> String {
        let config = ServerConfig {
            port: 0, // ephemeral
            max_rooms: 10,
            log_level: "error".to_string(),
            turn_timer_ms: 30_000,
        };
        let state = Arc::new(AppState::new(config));
        let app = build_app(state);
        let listener = TcpListener::bind("127.0.0.1:0").await.expect("bind");
        let addr = listener.local_addr().expect("local_addr");
        tokio::spawn(async move {
            axum::serve(listener, app).await.expect("serve");
        });
        format!("ws://127.0.0.1:{}/ws", addr.port())
    }

    fn encode_client(msg: &ClientMessage) -> Vec<u8> {
        let mut bytes = vec![PROTOCOL_VERSION];
        bytes.extend(bincode::serialize(msg).expect("serialize"));
        bytes
    }

    fn decode_server(bytes: &[u8]) -> ServerMessage {
        assert!(!bytes.is_empty(), "empty server message");
        assert_eq!(bytes[0], PROTOCOL_VERSION, "wrong protocol version");
        bincode::deserialize(&bytes[1..]).expect("deserialize server message")
    }

    #[tokio::test]
    async fn ws_ping_pong() {
        let url = start_test_server().await;
        let (mut ws, _) = connect_async(&url).await.expect("connect");

        let ping = encode_client(&ClientMessage::Ping);
        ws.send(TsMsg::Binary(ping.into())).await.expect("send");

        let resp = ws.next().await.expect("response").expect("ok");
        match resp {
            TsMsg::Binary(bytes) => {
                let msg = decode_server(&bytes);
                assert!(matches!(msg, ServerMessage::Pong));
            }
            other => panic!("Expected binary, got: {other:?}"),
        }
    }

    #[tokio::test]
    async fn ws_create_room() {
        let url = start_test_server().await;
        let (mut ws, _) = connect_async(&url).await.expect("connect");

        let create = encode_client(&ClientMessage::CreateRoom {
            player_name: "Alice".to_string(),
            config: RoomConfig::default(),
        });
        ws.send(TsMsg::Binary(create.into())).await.expect("send");

        // Should get RoomCreated and RoomJoined
        let resp1 = ws.next().await.expect("resp1").expect("ok");
        let resp2 = ws.next().await.expect("resp2").expect("ok");

        let msg1 = decode_server(resp1.into_data().as_ref());
        let msg2 = decode_server(resp2.into_data().as_ref());

        assert!(matches!(msg1, ServerMessage::RoomCreated { .. }));
        assert!(matches!(msg2, ServerMessage::RoomJoined { .. }));
    }

    #[tokio::test]
    async fn ws_two_players_join_and_ready() {
        let url = start_test_server().await;

        // Player 1: create room
        let (mut ws1, _) = connect_async(&url).await.expect("connect p1");
        let create = encode_client(&ClientMessage::CreateRoom {
            player_name: "Alice".to_string(),
            config: RoomConfig::default(),
        });
        ws1.send(TsMsg::Binary(create.into())).await.expect("send");

        // Get room ID
        let resp = ws1.next().await.expect("resp").expect("ok");
        let msg = decode_server(resp.into_data().as_ref());
        let room_id = match msg {
            ServerMessage::RoomCreated { room_id } => room_id,
            other => panic!("Expected RoomCreated, got {other:?}"),
        };
        // Consume RoomJoined
        let _ = ws1.next().await;

        // Player 2: join room
        let (mut ws2, _) = connect_async(&url).await.expect("connect p2");
        let join = encode_client(&ClientMessage::JoinRoom {
            room_id: room_id.clone(),
            player_name: "Bob".to_string(),
        });
        ws2.send(TsMsg::Binary(join.into())).await.expect("send");

        // P2 should get RoomJoined
        let p2_resp = ws2.next().await.expect("p2 resp").expect("ok");
        let p2_msg = decode_server(p2_resp.into_data().as_ref());
        let mut got_room_joined = matches!(p2_msg, ServerMessage::RoomJoined { .. });
        if !got_room_joined {
            let p2_resp2 = ws2.next().await.expect("p2 resp2").expect("ok");
            let p2_msg2 = decode_server(p2_resp2.into_data().as_ref());
            got_room_joined = matches!(p2_msg2, ServerMessage::RoomJoined { .. });
        }
        assert!(got_room_joined, "P2 should receive RoomJoined");

        // Both ready up
        let ready = encode_client(&ClientMessage::SetReady);
        ws1.send(TsMsg::Binary(ready.clone().into()))
            .await
            .expect("send ready p1");
        ws2.send(TsMsg::Binary(ready.into()))
            .await
            .expect("send ready p2");

        // Drain messages until we see GameStarted
        let mut got_game_started = false;
        for _ in 0..10 {
            tokio::select! {
                Some(Ok(msg)) = ws1.next() => {
                    if let TsMsg::Binary(bytes) = msg {
                        let decoded = decode_server(&bytes);
                        if matches!(decoded, ServerMessage::GameStarted { .. }) {
                            got_game_started = true;
                            break;
                        }
                    }
                }
                _ = tokio::time::sleep(std::time::Duration::from_secs(2)) => {
                    break;
                }
            }
        }
        assert!(
            got_game_started,
            "Game should start after both players ready"
        );
    }

    #[tokio::test]
    async fn ws_list_rooms() {
        let url = start_test_server().await;
        let (mut ws, _) = connect_async(&url).await.expect("connect");

        // List rooms (should be empty)
        let list = encode_client(&ClientMessage::ListRooms);
        ws.send(TsMsg::Binary(list.into())).await.expect("send");

        let resp = ws.next().await.expect("resp").expect("ok");
        let msg = decode_server(resp.into_data().as_ref());
        match msg {
            ServerMessage::RoomList { rooms } => {
                assert!(rooms.is_empty(), "Should have no rooms initially");
            }
            other => panic!("Expected RoomList, got {other:?}"),
        }
    }

    #[tokio::test]
    async fn ws_protocol_version_mismatch() {
        let url = start_test_server().await;
        let (mut ws, _) = connect_async(&url).await.expect("connect");

        // Send message with wrong protocol version
        let msg = ClientMessage::Ping;
        let mut bytes = vec![99u8]; // wrong version
        bytes.extend(bincode::serialize(&msg).expect("serialize"));
        ws.send(TsMsg::Binary(bytes.into())).await.expect("send");

        let resp = ws.next().await.expect("resp").expect("ok");
        let decoded = decode_server(resp.into_data().as_ref());
        match decoded {
            ServerMessage::Error { message } => {
                assert!(
                    message.contains("protocol version mismatch"),
                    "Expected version mismatch error, got: {message}"
                );
            }
            other => panic!("Expected Error, got {other:?}"),
        }
    }
}
