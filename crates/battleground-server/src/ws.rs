use std::sync::Arc;

use axum::{
    extract::{
        ws::{Message, WebSocket},
        State, WebSocketUpgrade,
    },
    response::IntoResponse,
};
use tokio::sync::mpsc;
use tracing::{info, warn};

use crate::error::ServerError;
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
}

async fn handle_socket(socket: WebSocket, state: Arc<AppState>) {
    let (mut ws_sender, mut ws_receiver) = socket.split();
    let (tx, mut rx) = mpsc::channel::<Vec<u8>>(64);

    let mut conn = ConnectionState {
        room_id: None,
        player_name: None,
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

        // Phase 3 will handle these game-state messages
        ClientMessage::SubmitDeployment { .. } => {
            let room_id = conn
                .room_id
                .as_ref()
                .ok_or_else(|| ServerError::invalid_message("not in a room"))?;
            let room = state
                .rooms
                .get(room_id)
                .ok_or_else(|| ServerError::RoomNotFound {
                    room_id: room_id.clone(),
                })?;
            if room.status != RoomStatus::Playing {
                return Err(ServerError::GameNotStarted {
                    room_id: room_id.clone(),
                });
            }
            // Placeholder — game logic integration in Phase 3
            return Err(ServerError::invalid_message(
                "deployment not yet implemented (Phase 3)",
            ));
        }

        ClientMessage::SubmitOrders { .. } => {
            let room_id = conn
                .room_id
                .as_ref()
                .ok_or_else(|| ServerError::invalid_message("not in a room"))?;
            let room = state
                .rooms
                .get(room_id)
                .ok_or_else(|| ServerError::RoomNotFound {
                    room_id: room_id.clone(),
                })?;
            if room.status != RoomStatus::Playing {
                return Err(ServerError::GameNotStarted {
                    room_id: room_id.clone(),
                });
            }
            // Placeholder — game logic integration in Phase 3
            return Err(ServerError::invalid_message(
                "orders not yet implemented (Phase 3)",
            ));
        }
    }

    Ok(())
}
