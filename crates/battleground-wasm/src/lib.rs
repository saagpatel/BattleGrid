use battleground_core::{
    combat,
    grid::Terrain,
    hex::Hex,
    los,
    order::{Action, UnitOrder},
    pathfinding,
    replay::GameReplay,
    simulation::{GamePhase, GameState, SimEvent},
    types::{PlayerId, UnitId},
    unit::UnitType,
};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use wasm_bindgen::prelude::*;

pub const PROTOCOL_VERSION: u8 = 1;

// ---------------------------------------------------------------------------
// Protocol message types (must match the server exactly)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct HexCoord {
    pub q: i32,
    pub r: i32,
}

impl From<Hex> for HexCoord {
    fn from(h: Hex) -> Self {
        Self { q: h.q, r: h.r }
    }
}

impl From<HexCoord> for Hex {
    fn from(h: HexCoord) -> Self {
        Hex::new(h.q, h.r)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct RoomInfo {
    pub room_id: String,
    pub player_count: u8,
    pub max_players: u8,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct RoomConfig {
    pub max_players: u8,
    pub turn_timer_ms: u64,
    pub map_seed: Option<u64>,
}

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
        spawn_zone: Vec<HexCoord>,
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

// ---------------------------------------------------------------------------
// JSON helper types for WASM return values
// ---------------------------------------------------------------------------

#[derive(Debug, Serialize, Deserialize, PartialEq)]
pub struct PathResult {
    pub path: Vec<HexCoord>,
    pub cost: u32,
}

#[derive(Debug, Serialize, Deserialize, PartialEq)]
pub struct ReachableHex {
    pub hex: HexCoord,
    pub cost: u32,
}

#[derive(Debug, Serialize, Deserialize, PartialEq)]
pub struct CombatPreview {
    pub damage_dealt: i32,
    pub counter_damage: i32,
    pub attacker_hp_after: i32,
    pub defender_hp_after: i32,
    pub attacker_dies: bool,
    pub defender_dies: bool,
}

#[derive(Debug, Serialize, Deserialize, PartialEq)]
pub struct PixelCoord {
    pub x: f64,
    pub y: f64,
}

#[derive(Debug, Serialize, Deserialize, PartialEq)]
pub struct ReplaySummary {
    pub total_turns: usize,
    pub grid_radius: i32,
}

#[derive(Debug, Serialize, Deserialize, PartialEq)]
pub struct ClientHexCell {
    pub coord: HexCoord,
    pub terrain: String,
    pub elevation: i32,
}

#[derive(Debug, Serialize, Deserialize, PartialEq)]
pub struct ClientGridData {
    pub width: i32,
    pub height: i32,
    pub cells: Vec<ClientHexCell>,
}

#[derive(Debug, Serialize, Deserialize, PartialEq)]
pub struct ClientUnitData {
    pub id: u16,
    pub owner: u8,
    pub unit_class: String,
    pub hp: i32,
    pub max_hp: i32,
    pub attack: i32,
    pub defense: i32,
    pub move_range: u32,
    pub attack_range: u32,
    pub coord: HexCoord,
}

#[derive(Debug, Serialize, Deserialize, PartialEq)]
pub struct ClientGameState {
    pub turn: u32,
    pub phase: String,
    pub grid: ClientGridData,
    pub units: Vec<ClientUnitData>,
}

#[derive(Debug, Serialize, Deserialize, PartialEq)]
pub struct ClientSimEvent {
    pub kind: String,
    pub unit_id: u16,
    pub target_unit_id: Option<u16>,
    pub from: Option<HexCoord>,
    pub to: Option<HexCoord>,
    pub damage: Option<i32>,
    pub heal_amount: Option<i32>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ClientTurnOrderInput {
    pub unit_id: u16,
    pub order_type: String,
    pub from: Option<HexCoord>,
    pub target: Option<HexCoord>,
    pub target_unit_id: Option<u16>,
}

// ---------------------------------------------------------------------------
// Internal (non-WASM) logic — returns Result<T, String> for testability
// ---------------------------------------------------------------------------

/// Holds the game state and provides query methods.
pub struct GameBridge {
    pub state: GameState,
}

impl GameBridge {
    pub fn from_bytes(state_bytes: &[u8]) -> Result<Self, String> {
        let state: GameState = bincode::deserialize(state_bytes)
            .map_err(|e| format!("Failed to deserialize GameState: {e}"))?;
        Ok(Self { state })
    }

    pub fn update_state(&mut self, state_bytes: &[u8]) -> Result<(), String> {
        self.state = bincode::deserialize(state_bytes)
            .map_err(|e| format!("Failed to deserialize GameState: {e}"))?;
        Ok(())
    }

    pub fn find_path(
        &self,
        unit_id: u16,
        target_q: i32,
        target_r: i32,
    ) -> Result<PathResult, String> {
        let uid = UnitId(unit_id);
        let unit = self
            .state
            .units
            .get(&uid)
            .ok_or_else(|| format!("Unit {unit_id} not found"))?;

        let target = Hex::new(target_q, target_r);
        let (blocked, friendly_occupied) = self.build_occupancy_sets(uid, unit.owner);

        let path = pathfinding::find_path(
            &self.state.grid,
            unit.position,
            target,
            unit.movement(),
            &blocked,
            &friendly_occupied,
        )
        .map_err(|e| format!("Pathfinding failed: {e}"))?;

        let cost = pathfinding::path_cost(&self.state.grid, &path);

        Ok(PathResult {
            path: path.into_iter().map(HexCoord::from).collect(),
            cost,
        })
    }

    pub fn reachable_hexes(&self, unit_id: u16) -> Result<Vec<ReachableHex>, String> {
        let uid = UnitId(unit_id);
        let unit = self
            .state
            .units
            .get(&uid)
            .ok_or_else(|| format!("Unit {unit_id} not found"))?;

        let (blocked, friendly_occupied) = self.build_occupancy_sets(uid, unit.owner);

        let hexes = pathfinding::reachable_hexes(
            &self.state.grid,
            unit.position,
            unit.movement(),
            &blocked,
            &friendly_occupied,
        );

        Ok(hexes
            .into_iter()
            .map(|(hex, cost)| ReachableHex {
                hex: HexCoord::from(hex),
                cost,
            })
            .collect())
    }

    pub fn visible_hexes_for_unit(&self, unit_id: u16) -> Result<Vec<HexCoord>, String> {
        let uid = UnitId(unit_id);
        let unit = self
            .state
            .units
            .get(&uid)
            .ok_or_else(|| format!("Unit {unit_id} not found"))?;

        let visible = los::visible_hexes(
            &self.state.grid,
            unit.position,
            self.state.config.sight_range,
        );

        Ok(visible.into_iter().map(HexCoord::from).collect())
    }

    pub fn visible_hexes_for_player(&self, player_id: u8) -> Result<Vec<HexCoord>, String> {
        let pid = PlayerId(player_id);
        let positions: Vec<Hex> = self
            .state
            .units_for_player(pid)
            .iter()
            .map(|u| u.position)
            .collect();

        let visible = los::visible_hexes_for_positions(
            &self.state.grid,
            &positions,
            self.state.config.sight_range,
        );

        Ok(visible.into_iter().map(HexCoord::from).collect())
    }

    pub fn validate_order(&self, order_bytes: &[u8], player_id: u8) -> Result<bool, String> {
        let order: UnitOrder = bincode::deserialize(order_bytes)
            .map_err(|e| format!("Failed to deserialize order: {e}"))?;

        let pid = PlayerId(player_id);

        let unit = match self.state.units.get(&order.unit_id) {
            Some(u) if u.is_alive() && u.owner == pid => u,
            _ => return Ok(false),
        };

        let valid = match &order.action {
            battleground_core::order::Action::Move { path } => {
                path.first() == Some(&unit.position)
                    && path.len() >= 2
                    && path.iter().all(|h| self.state.grid.contains(h))
            }
            battleground_core::order::Action::Attack { target_id } => {
                match self.state.units.get(target_id) {
                    Some(target) => {
                        target.is_alive()
                            && target.owner != unit.owner
                            && unit.can_attack_at_range(unit.position.distance(&target.position))
                    }
                    None => false,
                }
            }
            battleground_core::order::Action::Ability { target } => {
                unit.stats().ability.is_some() && self.state.grid.contains(target)
            }
            battleground_core::order::Action::Defend | battleground_core::order::Action::Hold => {
                true
            }
            battleground_core::order::Action::Deploy { .. } => {
                matches!(
                    self.state.phase,
                    battleground_core::simulation::GamePhase::Deploying
                )
            }
        };

        Ok(valid)
    }

    pub fn preview_combat(
        &self,
        attacker_id: u16,
        defender_id: u16,
    ) -> Result<CombatPreview, String> {
        let a_uid = UnitId(attacker_id);
        let d_uid = UnitId(defender_id);

        let attacker = self
            .state
            .units
            .get(&a_uid)
            .ok_or_else(|| format!("Attacker unit {attacker_id} not found"))?;
        let defender = self
            .state
            .units
            .get(&d_uid)
            .ok_or_else(|| format!("Defender unit {defender_id} not found"))?;

        let defender_terrain = self.state.terrain_at_unit(d_uid);
        let distance = attacker.position.distance(&defender.position);

        let result = combat::preview_combat(attacker, defender, defender_terrain, distance);

        Ok(CombatPreview {
            damage_dealt: result.damage_dealt,
            counter_damage: result.counter_damage,
            attacker_hp_after: attacker.hp - result.counter_damage,
            defender_hp_after: defender.hp - result.damage_dealt,
            attacker_dies: attacker.hp - result.counter_damage <= 0,
            defender_dies: defender.hp - result.damage_dealt <= 0,
        })
    }

    fn build_occupancy_sets(
        &self,
        requesting_unit: UnitId,
        owner: PlayerId,
    ) -> (HashSet<Hex>, HashSet<Hex>) {
        let mut blocked = HashSet::new();
        let mut friendly_occupied = HashSet::new();

        for unit in self.state.units.values() {
            if unit.id == requesting_unit || !unit.is_alive() {
                continue;
            }
            if unit.owner == owner {
                friendly_occupied.insert(unit.position);
            } else {
                blocked.insert(unit.position);
            }
        }

        (blocked, friendly_occupied)
    }
}

// ---------------------------------------------------------------------------
// Standalone codec functions (non-WASM, testable)
// ---------------------------------------------------------------------------

pub fn decode_server_message_inner(bytes: &[u8]) -> Result<ServerMessage, String> {
    if bytes.is_empty() {
        return Err("Empty message".to_string());
    }

    let version = bytes[0];
    if version != PROTOCOL_VERSION {
        return Err(format!(
            "Protocol version mismatch: expected {PROTOCOL_VERSION}, got {version}"
        ));
    }

    bincode::deserialize(&bytes[1..]).map_err(|e| format!("Failed to decode server message: {e}"))
}

pub fn encode_client_message_inner(message: &ClientMessage) -> Result<Vec<u8>, String> {
    let payload =
        bincode::serialize(message).map_err(|e| format!("Failed to encode client message: {e}"))?;

    let mut bytes = Vec::with_capacity(1 + payload.len());
    bytes.push(PROTOCOL_VERSION);
    bytes.extend_from_slice(&payload);
    Ok(bytes)
}

// ---------------------------------------------------------------------------
// Static hex math (non-WASM, testable)
// ---------------------------------------------------------------------------

pub fn hex_to_pixel_inner(q: i32, r: i32, hex_size: f64) -> PixelCoord {
    let hex = Hex::new(q, r);
    let (x, y) = hex.to_pixel(hex_size);
    PixelCoord { x, y }
}

pub fn pixel_to_hex_inner(x: f64, y: f64, hex_size: f64) -> HexCoord {
    HexCoord::from(Hex::from_pixel(x, y, hex_size))
}

fn terrain_name(terrain: Terrain) -> String {
    match terrain {
        Terrain::Plains => "Plains",
        Terrain::Forest => "Forest",
        Terrain::Mountain => "Mountain",
        Terrain::Water => "Water",
        Terrain::Fortress => "Fortress",
    }
    .to_string()
}

fn client_unit_class(unit_type: UnitType) -> String {
    match unit_type {
        UnitType::Scout => "scout",
        UnitType::Soldier => "infantry",
        UnitType::Archer => "archer",
        UnitType::Knight => "cavalry",
        UnitType::Healer => "healer",
        UnitType::Siege => "siege",
    }
    .to_string()
}

fn game_phase_name(phase: &GamePhase) -> String {
    match phase {
        GamePhase::Deploying => "deploying",
        GamePhase::Planning => "planning",
        GamePhase::Resolving => "resolving",
        GamePhase::Finished(_) => "finished",
    }
    .to_string()
}

fn decode_game_state_inner(bytes: &[u8]) -> Result<ClientGameState, String> {
    let state: GameState =
        bincode::deserialize(bytes).map_err(|e| format!("Failed to decode game state: {e}"))?;

    let radius = state.grid.radius();
    let mut cells = Vec::new();
    for hex in state.grid.all_hexes() {
        let terrain = state.grid.get_terrain(&hex).unwrap_or(Terrain::Plains);
        cells.push(ClientHexCell {
            coord: HexCoord::from(hex),
            terrain: terrain_name(terrain),
            elevation: 0,
        });
    }
    cells.sort_by_key(|c| (c.coord.q, c.coord.r));

    let units = state
        .units
        .values()
        .map(|u| ClientUnitData {
            id: u.id.0,
            owner: u.owner.0,
            unit_class: client_unit_class(u.unit_type),
            hp: u.hp,
            max_hp: u.max_hp,
            attack: u.stats().attack,
            defense: u.stats().defense,
            move_range: u.stats().movement,
            attack_range: u.stats().range,
            coord: HexCoord::from(u.position),
        })
        .collect::<Vec<_>>();

    Ok(ClientGameState {
        turn: state.turn,
        phase: game_phase_name(&state.phase),
        grid: ClientGridData {
            width: radius * 2 + 1,
            height: radius * 2 + 1,
            cells,
        },
        units,
    })
}

fn decode_sim_events_inner(bytes: &[u8]) -> Result<Vec<ClientSimEvent>, String> {
    let events: Vec<SimEvent> =
        bincode::deserialize(bytes).map_err(|e| format!("Failed to decode sim events: {e}"))?;

    let mapped = events
        .into_iter()
        .map(|event| match event {
            SimEvent::UnitMoved { unit_id, path } => ClientSimEvent {
                kind: "move".to_string(),
                unit_id: unit_id.0,
                target_unit_id: None,
                from: path.first().copied().map(HexCoord::from),
                to: path.last().copied().map(HexCoord::from),
                damage: None,
                heal_amount: None,
            },
            SimEvent::UnitAttacked {
                attacker_id,
                defender_id,
                damage,
                ..
            } => ClientSimEvent {
                kind: "attack".to_string(),
                unit_id: attacker_id.0,
                target_unit_id: Some(defender_id.0),
                from: None,
                to: None,
                damage: Some(damage),
                heal_amount: None,
            },
            SimEvent::UnitDestroyed { unit_id } => ClientSimEvent {
                kind: "death".to_string(),
                unit_id: unit_id.0,
                target_unit_id: None,
                from: None,
                to: None,
                damage: None,
                heal_amount: None,
            },
            SimEvent::UnitHealed {
                healer_id,
                target_id,
                amount,
            } => ClientSimEvent {
                kind: "heal".to_string(),
                unit_id: healer_id.0,
                target_unit_id: Some(target_id.0),
                from: None,
                to: None,
                damage: None,
                heal_amount: Some(amount),
            },
            SimEvent::TerrainChanged { hex, .. } => ClientSimEvent {
                kind: "terrain_change".to_string(),
                unit_id: 0,
                target_unit_id: None,
                from: Some(HexCoord::from(hex)),
                to: Some(HexCoord::from(hex)),
                damage: None,
                heal_amount: None,
            },
            SimEvent::MovementConflict { unit_a, unit_b, .. } => ClientSimEvent {
                kind: "move".to_string(),
                unit_id: unit_a.0,
                target_unit_id: Some(unit_b.0),
                from: None,
                to: None,
                damage: None,
                heal_amount: None,
            },
            SimEvent::UnitDefending { unit_id } => ClientSimEvent {
                kind: "ability".to_string(),
                unit_id: unit_id.0,
                target_unit_id: None,
                from: None,
                to: None,
                damage: None,
                heal_amount: None,
            },
            SimEvent::FortressCaptured { .. } => ClientSimEvent {
                kind: "ability".to_string(),
                unit_id: 0,
                target_unit_id: None,
                from: None,
                to: None,
                damage: None,
                heal_amount: None,
            },
            SimEvent::GameOver { .. } => ClientSimEvent {
                kind: "ability".to_string(),
                unit_id: 0,
                target_unit_id: None,
                from: None,
                to: None,
                damage: None,
                heal_amount: None,
            },
        })
        .collect();

    Ok(mapped)
}

fn encode_turn_orders_inner(orders: &[ClientTurnOrderInput]) -> Result<Vec<u8>, String> {
    let mapped: Vec<UnitOrder> = orders
        .iter()
        .map(|order| {
            let action = match order.order_type.as_str() {
                "move" => match (order.from.clone(), order.target.clone()) {
                    (Some(from), Some(target)) => Action::Move {
                        path: vec![from.into(), target.into()],
                    },
                    _ => Action::Hold,
                },
                "attack" => order
                    .target_unit_id
                    .map(|id| Action::Attack {
                        target_id: UnitId(id),
                    })
                    .unwrap_or(Action::Hold),
                "ability" => order
                    .target
                    .clone()
                    .map(|target| Action::Ability {
                        target: target.into(),
                    })
                    .unwrap_or(Action::Hold),
                "defend" => Action::Defend,
                _ => Action::Hold,
            };

            UnitOrder {
                unit_id: UnitId(order.unit_id),
                action,
            }
        })
        .collect();

    bincode::serialize(&mapped).map_err(|e| format!("Failed to encode turn orders: {e}"))
}

// ---------------------------------------------------------------------------
// #[wasm_bindgen] exports — thin wrappers around internal functions
// ---------------------------------------------------------------------------

#[wasm_bindgen]
pub struct WasmGame {
    bridge: GameBridge,
}

#[wasm_bindgen]
impl WasmGame {
    #[wasm_bindgen(constructor)]
    pub fn new(state_bytes: &[u8]) -> Result<WasmGame, JsError> {
        let bridge = GameBridge::from_bytes(state_bytes).map_err(|e| JsError::new(&e))?;
        Ok(WasmGame { bridge })
    }

    pub fn update_state(&mut self, state_bytes: &[u8]) -> Result<(), JsError> {
        self.bridge
            .update_state(state_bytes)
            .map_err(|e| JsError::new(&e))
    }

    pub fn find_path(
        &self,
        unit_id: u16,
        target_q: i32,
        target_r: i32,
    ) -> Result<JsValue, JsError> {
        let result = self
            .bridge
            .find_path(unit_id, target_q, target_r)
            .map_err(|e| JsError::new(&e))?;
        serde_wasm_bindgen::to_value(&result)
            .map_err(|e| JsError::new(&format!("Serialization error: {e}")))
    }

    pub fn reachable_hexes(&self, unit_id: u16) -> Result<JsValue, JsError> {
        let result = self
            .bridge
            .reachable_hexes(unit_id)
            .map_err(|e| JsError::new(&e))?;
        serde_wasm_bindgen::to_value(&result)
            .map_err(|e| JsError::new(&format!("Serialization error: {e}")))
    }

    pub fn visible_hexes_for_unit(&self, unit_id: u16) -> Result<JsValue, JsError> {
        let result = self
            .bridge
            .visible_hexes_for_unit(unit_id)
            .map_err(|e| JsError::new(&e))?;
        serde_wasm_bindgen::to_value(&result)
            .map_err(|e| JsError::new(&format!("Serialization error: {e}")))
    }

    pub fn visible_hexes_for_player(&self, player_id: u8) -> Result<JsValue, JsError> {
        let result = self
            .bridge
            .visible_hexes_for_player(player_id)
            .map_err(|e| JsError::new(&e))?;
        serde_wasm_bindgen::to_value(&result)
            .map_err(|e| JsError::new(&format!("Serialization error: {e}")))
    }

    pub fn validate_order(&self, order_bytes: &[u8], player_id: u8) -> Result<bool, JsError> {
        self.bridge
            .validate_order(order_bytes, player_id)
            .map_err(|e| JsError::new(&e))
    }

    pub fn preview_combat(&self, attacker_id: u16, defender_id: u16) -> Result<JsValue, JsError> {
        let result = self
            .bridge
            .preview_combat(attacker_id, defender_id)
            .map_err(|e| JsError::new(&e))?;
        serde_wasm_bindgen::to_value(&result)
            .map_err(|e| JsError::new(&format!("Serialization error: {e}")))
    }
}

#[wasm_bindgen]
pub fn hex_to_pixel(q: i32, r: i32, hex_size: f64) -> Result<JsValue, JsError> {
    let result = hex_to_pixel_inner(q, r, hex_size);
    serde_wasm_bindgen::to_value(&result)
        .map_err(|e| JsError::new(&format!("Serialization error: {e}")))
}

#[wasm_bindgen]
pub fn pixel_to_hex(x: f64, y: f64, hex_size: f64) -> Result<JsValue, JsError> {
    let result = pixel_to_hex_inner(x, y, hex_size);
    serde_wasm_bindgen::to_value(&result)
        .map_err(|e| JsError::new(&format!("Serialization error: {e}")))
}

#[wasm_bindgen]
pub fn hex_distance(q1: i32, r1: i32, q2: i32, r2: i32) -> u32 {
    Hex::new(q1, r1).distance(&Hex::new(q2, r2))
}

#[wasm_bindgen]
pub fn decode_server_message(bytes: &[u8]) -> Result<JsValue, JsError> {
    let msg = decode_server_message_inner(bytes).map_err(|e| JsError::new(&e))?;
    serde_wasm_bindgen::to_value(&msg)
        .map_err(|e| JsError::new(&format!("Serialization error: {e}")))
}

#[wasm_bindgen]
pub fn encode_client_message(msg: JsValue) -> Result<Vec<u8>, JsError> {
    let message: ClientMessage = serde_wasm_bindgen::from_value(msg)
        .map_err(|e| JsError::new(&format!("Failed to parse client message: {e}")))?;
    encode_client_message_inner(&message).map_err(|e| JsError::new(&e))
}

#[wasm_bindgen]
pub fn decode_replay_summary(bytes: &[u8]) -> Result<JsValue, JsError> {
    let replay: GameReplay = bincode::deserialize(bytes)
        .map_err(|e| JsError::new(&format!("Failed to decode replay data: {e}")))?;
    let summary = ReplaySummary {
        total_turns: replay.turn_count(),
        grid_radius: replay.initial_state.grid.radius(),
    };
    serde_wasm_bindgen::to_value(&summary)
        .map_err(|e| JsError::new(&format!("Serialization error: {e}")))
}

#[wasm_bindgen]
pub fn decode_game_state(bytes: &[u8]) -> Result<JsValue, JsError> {
    let state = decode_game_state_inner(bytes).map_err(|e| JsError::new(&e))?;
    serde_wasm_bindgen::to_value(&state)
        .map_err(|e| JsError::new(&format!("Serialization error: {e}")))
}

#[wasm_bindgen]
pub fn decode_sim_events(bytes: &[u8]) -> Result<JsValue, JsError> {
    let events = decode_sim_events_inner(bytes).map_err(|e| JsError::new(&e))?;
    serde_wasm_bindgen::to_value(&events)
        .map_err(|e| JsError::new(&format!("Serialization error: {e}")))
}

#[wasm_bindgen]
pub fn encode_turn_orders(orders: JsValue) -> Result<Vec<u8>, JsError> {
    let parsed: Vec<ClientTurnOrderInput> = serde_wasm_bindgen::from_value(orders)
        .map_err(|e| JsError::new(&format!("Failed to parse turn orders: {e}")))?;
    encode_turn_orders_inner(&parsed).map_err(|e| JsError::new(&e))
}

// ---------------------------------------------------------------------------
// Tests — call internal (non-WASM) functions only
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use battleground_core::{
        grid::HexGrid,
        simulation::{GameConfig, GameState, PlayerState},
        unit::UnitType,
    };

    fn test_game_state() -> GameState {
        let grid = HexGrid::new(5);
        let players = vec![
            PlayerState {
                id: PlayerId(0),
                name: "Alice".to_string(),
                spawn_center: Hex::new(-3, 0),
            },
            PlayerState {
                id: PlayerId(1),
                name: "Bob".to_string(),
                spawn_center: Hex::new(3, 0),
            },
        ];
        let config = GameConfig::default();
        let mut state = GameState::new(grid, players, config);
        state.place_unit(UnitType::Scout, PlayerId(0), Hex::new(0, 0));
        state.place_unit(UnitType::Soldier, PlayerId(0), Hex::new(-1, 0));
        state.place_unit(UnitType::Archer, PlayerId(1), Hex::new(3, 0));
        state.place_unit(UnitType::Knight, PlayerId(1), Hex::new(2, 0));
        state
    }

    fn serialized_test_state() -> Vec<u8> {
        bincode::serialize(&test_game_state()).expect("serialize test state")
    }

    // --- Hex math tests ---

    #[test]
    fn hex_distance_zero() {
        assert_eq!(hex_distance(0, 0, 0, 0), 0);
    }

    #[test]
    fn hex_distance_neighbor() {
        assert_eq!(hex_distance(0, 0, 1, 0), 1);
        assert_eq!(hex_distance(0, 0, 0, 1), 1);
        assert_eq!(hex_distance(0, 0, 1, -1), 1);
    }

    #[test]
    fn hex_distance_known_values() {
        assert_eq!(hex_distance(0, 0, 3, -3), 3);
        assert_eq!(hex_distance(1, 1, -2, 3), 3);
    }

    #[test]
    fn hex_distance_symmetric() {
        assert_eq!(hex_distance(2, -3, -1, 4), hex_distance(-1, 4, 2, -3));
    }

    #[test]
    fn hex_to_pixel_origin() {
        let coord = hex_to_pixel_inner(0, 0, 32.0);
        assert!((coord.x).abs() < 1e-10);
        assert!((coord.y).abs() < 1e-10);
    }

    #[test]
    fn pixel_to_hex_roundtrip() {
        let hex = Hex::new(2, 1);
        let (px, py) = hex.to_pixel(32.0);
        let result = pixel_to_hex_inner(px, py, 32.0);
        assert_eq!(result.q, 2);
        assert_eq!(result.r, 1);
    }

    #[test]
    fn pixel_hex_roundtrip_range() {
        for hex in Hex::ORIGIN.hexes_in_range(5) {
            let coord = hex_to_pixel_inner(hex.q, hex.r, 32.0);
            let back = pixel_to_hex_inner(coord.x, coord.y, 32.0);
            assert_eq!(back.q, hex.q, "q mismatch for {hex}");
            assert_eq!(back.r, hex.r, "r mismatch for {hex}");
        }
    }

    // --- GameBridge constructor tests ---

    #[test]
    fn game_bridge_constructor() {
        let bytes = serialized_test_state();
        let bridge = GameBridge::from_bytes(&bytes);
        assert!(bridge.is_ok());
    }

    #[test]
    fn game_bridge_constructor_invalid_bytes() {
        let bridge = GameBridge::from_bytes(&[0xFF, 0xFE]);
        assert!(bridge.is_err());
    }

    #[test]
    fn game_bridge_update_state() {
        let bytes = serialized_test_state();
        let mut bridge = GameBridge::from_bytes(&bytes).expect("create bridge");
        let result = bridge.update_state(&bytes);
        assert!(result.is_ok());
    }

    // --- Pathfinding tests ---

    #[test]
    fn find_path_success() {
        let bytes = serialized_test_state();
        let bridge = GameBridge::from_bytes(&bytes).expect("create bridge");
        // Scout (unit 1) at (0,0), move to (1,-1)
        let result = bridge.find_path(1, 1, -1);
        assert!(result.is_ok());
        let path = result.unwrap();
        assert!(!path.path.is_empty());
        assert_eq!(path.path.first().map(|h| (h.q, h.r)), Some((0, 0)));
        assert_eq!(path.path.last().map(|h| (h.q, h.r)), Some((1, -1)));
        assert!(path.cost <= 4); // Scout has 4 movement
    }

    #[test]
    fn find_path_unit_not_found() {
        let bytes = serialized_test_state();
        let bridge = GameBridge::from_bytes(&bytes).expect("create bridge");
        let result = bridge.find_path(999, 1, 0);
        assert!(result.is_err());
    }

    #[test]
    fn find_path_blocked_by_enemy() {
        let bytes = serialized_test_state();
        let bridge = GameBridge::from_bytes(&bytes).expect("create bridge");
        // Scout at (0,0) tries to reach enemy Knight at (2,0) — should fail (blocked)
        let result = bridge.find_path(1, 2, 0);
        assert!(result.is_err());
    }

    #[test]
    fn reachable_hexes_returns_results() {
        let bytes = serialized_test_state();
        let bridge = GameBridge::from_bytes(&bytes).expect("create bridge");
        // Scout has movement 4
        let hexes = bridge.reachable_hexes(1).expect("reachable_hexes");
        assert!(!hexes.is_empty());
        // All costs should be <= 4
        for rh in &hexes {
            assert!(rh.cost <= 4, "cost {} exceeds movement 4", rh.cost);
        }
    }

    #[test]
    fn reachable_hexes_unit_not_found() {
        let bytes = serialized_test_state();
        let bridge = GameBridge::from_bytes(&bytes).expect("create bridge");
        let result = bridge.reachable_hexes(999);
        assert!(result.is_err());
    }

    // --- LOS tests ---

    #[test]
    fn visible_hexes_for_unit_returns_results() {
        let bytes = serialized_test_state();
        let bridge = GameBridge::from_bytes(&bytes).expect("create bridge");
        let hexes = bridge.visible_hexes_for_unit(1).expect("visible_hexes");
        assert!(!hexes.is_empty());
        // Own position always visible
        assert!(hexes.iter().any(|h| h.q == 0 && h.r == 0));
    }

    #[test]
    fn visible_hexes_for_player_returns_results() {
        let bytes = serialized_test_state();
        let bridge = GameBridge::from_bytes(&bytes).expect("create bridge");
        let hexes = bridge.visible_hexes_for_player(0).expect("visible player");
        // Player 0 has 2 units, should see at least their own positions
        assert!(hexes.len() >= 2);
    }

    #[test]
    fn visible_hexes_for_unit_not_found() {
        let bytes = serialized_test_state();
        let bridge = GameBridge::from_bytes(&bytes).expect("create bridge");
        let result = bridge.visible_hexes_for_unit(999);
        assert!(result.is_err());
    }

    #[test]
    fn visible_hexes_player_union_larger() {
        let bytes = serialized_test_state();
        let bridge = GameBridge::from_bytes(&bytes).expect("create bridge");
        let unit1_vis = bridge.visible_hexes_for_unit(1).expect("unit vis");
        let player_vis = bridge.visible_hexes_for_player(0).expect("player vis");
        // Player union should be >= any single unit
        assert!(player_vis.len() >= unit1_vis.len());
    }

    // --- Combat preview tests ---

    #[test]
    fn preview_combat_adjacent_units() {
        let grid = HexGrid::new(5);
        let players = vec![
            PlayerState {
                id: PlayerId(0),
                name: "A".to_string(),
                spawn_center: Hex::new(-3, 0),
            },
            PlayerState {
                id: PlayerId(1),
                name: "B".to_string(),
                spawn_center: Hex::new(3, 0),
            },
        ];
        let mut state = GameState::new(grid, players, GameConfig::default());
        let a = state.place_unit(UnitType::Soldier, PlayerId(0), Hex::new(0, 0));
        let b = state.place_unit(UnitType::Soldier, PlayerId(1), Hex::new(1, 0));

        let bytes = bincode::serialize(&state).expect("serialize");
        let bridge = GameBridge::from_bytes(&bytes).expect("create bridge");

        let preview = bridge.preview_combat(a.0, b.0).expect("preview");

        // Soldier (attack=3) vs Soldier (defense=2 on plains) => damage=1
        assert_eq!(preview.damage_dealt, 1);
        // Counter: effective_attack(1) - 1 = 3 - 1 = 2
        assert_eq!(preview.counter_damage, 2);
        assert_eq!(preview.attacker_hp_after, 2); // 4 - 2
        assert_eq!(preview.defender_hp_after, 3); // 4 - 1
        assert!(!preview.attacker_dies);
        assert!(!preview.defender_dies);
    }

    #[test]
    fn preview_combat_unit_not_found() {
        let bytes = serialized_test_state();
        let bridge = GameBridge::from_bytes(&bytes).expect("create bridge");
        let result = bridge.preview_combat(999, 1);
        assert!(result.is_err());
    }

    #[test]
    fn preview_combat_lethal() {
        // Create a scenario where the attacker kills the defender
        let grid = HexGrid::new(5);
        let players = vec![
            PlayerState {
                id: PlayerId(0),
                name: "A".to_string(),
                spawn_center: Hex::new(-3, 0),
            },
            PlayerState {
                id: PlayerId(1),
                name: "B".to_string(),
                spawn_center: Hex::new(3, 0),
            },
        ];
        let mut state = GameState::new(grid, players, GameConfig::default());
        // Use place_unit for both to keep IDs consistent
        let knight_id = state.place_unit(UnitType::Knight, PlayerId(0), Hex::new(0, 0));
        let scout_id = state.place_unit(UnitType::Scout, PlayerId(1), Hex::new(1, 0));
        // Set charge bonus on the knight
        state
            .units
            .get_mut(&knight_id)
            .expect("knight")
            .charge_bonus = true;

        let bytes = bincode::serialize(&state).expect("serialize");
        let bridge = GameBridge::from_bytes(&bytes).expect("create bridge");

        let preview = bridge
            .preview_combat(knight_id.0, scout_id.0)
            .expect("preview");
        // Knight with charge: attack=6, Scout defense=0, damage=6, Scout HP=2 => dies
        assert_eq!(preview.damage_dealt, 6);
        assert!(preview.defender_dies);
    }

    // --- Order validation tests ---

    #[test]
    fn validate_hold_order() {
        let bytes = serialized_test_state();
        let bridge = GameBridge::from_bytes(&bytes).expect("create bridge");
        let order = UnitOrder::hold(UnitId(1));
        let order_bytes = bincode::serialize(&order).expect("serialize order");
        assert!(bridge.validate_order(&order_bytes, 0).expect("validate"));
    }

    #[test]
    fn validate_order_wrong_player() {
        let bytes = serialized_test_state();
        let bridge = GameBridge::from_bytes(&bytes).expect("create bridge");
        let order = UnitOrder::hold(UnitId(1));
        let order_bytes = bincode::serialize(&order).expect("serialize order");
        assert!(!bridge.validate_order(&order_bytes, 1).expect("validate"));
    }

    #[test]
    fn validate_attack_out_of_range() {
        let bytes = serialized_test_state();
        let bridge = GameBridge::from_bytes(&bytes).expect("create bridge");
        // Unit 2 (Soldier at -1,0) attacks Unit 4 (Knight at 2,0) — distance 3, range 1
        let order = UnitOrder::attack(UnitId(2), UnitId(4));
        let order_bytes = bincode::serialize(&order).expect("serialize order");
        assert!(!bridge.validate_order(&order_bytes, 0).expect("validate"));
    }

    #[test]
    fn validate_defend_order() {
        let bytes = serialized_test_state();
        let bridge = GameBridge::from_bytes(&bytes).expect("create bridge");
        let order = UnitOrder::defend(UnitId(1));
        let order_bytes = bincode::serialize(&order).expect("serialize order");
        assert!(bridge.validate_order(&order_bytes, 0).expect("validate"));
    }

    #[test]
    fn validate_invalid_order_bytes() {
        let bytes = serialized_test_state();
        let bridge = GameBridge::from_bytes(&bytes).expect("create bridge");
        let result = bridge.validate_order(&[0xFF], 0);
        assert!(result.is_err());
    }

    // --- Codec roundtrip tests ---

    #[test]
    fn codec_roundtrip_server_messages() {
        let messages = vec![
            ServerMessage::RoomCreated {
                room_id: "abc123".to_string(),
            },
            ServerMessage::RoomJoined {
                room_id: "abc123".to_string(),
                player_id: 0,
            },
            ServerMessage::PlayerJoined {
                player_name: "Alice".to_string(),
            },
            ServerMessage::PlayerLeft {
                player_name: "Bob".to_string(),
            },
            ServerMessage::PlayerReady {
                player_name: "Alice".to_string(),
            },
            ServerMessage::AllPlayersReady,
            ServerMessage::GameStarted { your_player_id: 0 },
            ServerMessage::DeploymentPhaseStarted {
                spawn_zone: vec![HexCoord { q: 0, r: 0 }, HexCoord { q: 1, r: 0 }],
                time_limit_ms: 30000,
            },
            ServerMessage::PlanningPhaseStarted {
                turn_number: 1,
                time_limit_ms: 30000,
            },
            ServerMessage::ResolutionStarted {
                events: vec![1, 2, 3],
            },
            ServerMessage::TurnCompleted {
                state: vec![4, 5, 6],
            },
            ServerMessage::GameOver {
                winner: Some(0),
                reason: "elimination".to_string(),
            },
            ServerMessage::GameOver {
                winner: None,
                reason: "draw".to_string(),
            },
            ServerMessage::Error {
                message: "something went wrong".to_string(),
            },
            ServerMessage::RoomList {
                rooms: vec![RoomInfo {
                    room_id: "room1".to_string(),
                    player_count: 1,
                    max_players: 2,
                }],
            },
            ServerMessage::Pong,
        ];

        for msg in &messages {
            // Encode: version byte + bincode
            let payload = bincode::serialize(msg).expect("serialize server message");
            let mut wire = Vec::with_capacity(1 + payload.len());
            wire.push(PROTOCOL_VERSION);
            wire.extend_from_slice(&payload);

            // Decode via the inner function
            let decoded = decode_server_message_inner(&wire).expect("decode server message");
            assert_eq!(msg, &decoded, "Round-trip failed for {msg:?}");
        }
    }

    #[test]
    fn codec_roundtrip_client_messages() {
        let messages = vec![
            ClientMessage::CreateRoom {
                player_name: "Alice".to_string(),
                config: RoomConfig {
                    max_players: 2,
                    turn_timer_ms: 30000,
                    map_seed: Some(42),
                },
            },
            ClientMessage::JoinRoom {
                room_id: "abc123".to_string(),
                player_name: "Bob".to_string(),
            },
            ClientMessage::QuickMatch {
                player_name: "Charlie".to_string(),
            },
            ClientMessage::SetReady,
            ClientMessage::SubmitDeployment {
                placements: vec![(1, 0, 0), (2, 1, 0)],
            },
            ClientMessage::SubmitOrders {
                for_turn: 1,
                orders: vec![10, 20, 30],
            },
            ClientMessage::ListRooms,
            ClientMessage::Ping,
            ClientMessage::LeaveRoom,
        ];

        for msg in &messages {
            let wire = encode_client_message_inner(msg).expect("encode client message");

            // Verify version byte
            assert_eq!(wire[0], PROTOCOL_VERSION);

            // Decode the bincode payload
            let decoded: ClientMessage =
                bincode::deserialize(&wire[1..]).expect("decode client message");
            assert_eq!(msg, &decoded, "Round-trip failed for {msg:?}");
        }
    }

    #[test]
    fn decode_server_message_empty() {
        let result = decode_server_message_inner(&[]);
        assert!(result.is_err());
    }

    #[test]
    fn decode_server_message_wrong_version() {
        let result = decode_server_message_inner(&[99, 0, 0]);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("version mismatch"));
    }

    #[test]
    fn decode_server_message_truncated() {
        // Valid version byte but truncated bincode
        let result = decode_server_message_inner(&[PROTOCOL_VERSION, 0xFF]);
        assert!(result.is_err());
    }

    // --- Build occupancy sets test ---

    #[test]
    fn build_occupancy_sets_correct() {
        let bytes = serialized_test_state();
        let bridge = GameBridge::from_bytes(&bytes).expect("create bridge");

        let (blocked, friendly) = bridge.build_occupancy_sets(UnitId(1), PlayerId(0));

        // Friendly should contain unit 2's position
        assert!(friendly.contains(&Hex::new(-1, 0)));
        // Blocked should contain enemy positions
        assert!(blocked.contains(&Hex::new(3, 0)));
        assert!(blocked.contains(&Hex::new(2, 0)));
        // Should NOT contain the requesting unit's own position
        assert!(!friendly.contains(&Hex::new(0, 0)));
        assert!(!blocked.contains(&Hex::new(0, 0)));
    }

    // --- Serialization/deserialization of GameState ---

    #[test]
    fn game_state_bincode_roundtrip() {
        let state = test_game_state();
        let bytes = bincode::serialize(&state).expect("serialize");
        let decoded: GameState = bincode::deserialize(&bytes).expect("deserialize");
        assert_eq!(decoded.turn, state.turn);
        assert_eq!(decoded.units.len(), state.units.len());
    }
}
