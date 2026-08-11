//! Versioned, deterministic solo-puzzle contracts and session runtime.
//!
//! Puzzle data is intentionally bounded: typed predicates, fixed opponent
//! orders, and explicit terrain/units. There is no script evaluator.

use crate::combat;
use crate::grid::{HexGrid, Terrain};
use crate::hex::Hex;
use crate::order::{Action, UnitOrder};
use crate::pathfinding;
use crate::simulation::{
    simulate_puzzle_turn, validate_unit_order, GameConfig, GamePhase, GameState,
    OrderValidationError, PlayerState, SimEvent,
};
use crate::types::{PlayerId, UnitId};
use crate::unit::{Ability, Unit, UnitType};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet, HashSet};

pub const PUZZLE_FORMAT_VERSION: u16 = 1;
pub const RULESET_ID: &str = "battlegrid-simultaneous";
pub const ENGINE_CONTRACT_VERSION: &str = "puzzle-session-v1";
const RULESET_CANONICAL: &str =
    "battlegrid-core:v1:defend>movement>abilities>combat>deaths>fortress;strict-orders";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct EngineCompatibility {
    pub ruleset_id: String,
    pub engine_contract_version: String,
    pub ruleset_digest: String,
}

pub fn current_engine_compatibility() -> EngineCompatibility {
    EngineCompatibility {
        ruleset_id: RULESET_ID.to_string(),
        engine_contract_version: ENGINE_CONTRACT_VERSION.to_string(),
        ruleset_digest: digest_bytes(RULESET_CANONICAL.as_bytes()),
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PuzzleMetadata {
    pub title: String,
    pub briefing: String,
    pub learning_goal: String,
    pub difficulty: String,
    pub enemy_intent: String,
    pub hints: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PuzzleTerrainCell {
    pub coord: Hex,
    pub terrain: Terrain,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PuzzlePlayer {
    pub id: PlayerId,
    pub name: String,
    pub side: String,
    pub spawn_center: Hex,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PuzzleUnit {
    pub id: UnitId,
    pub owner: PlayerId,
    pub unit_type: UnitType,
    pub coord: Hex,
    pub hp: i32,
}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PuzzleOrderKind {
    Move,
    Attack,
    Defend,
    Ability,
    Hold,
}

impl PuzzleOrderKind {
    fn of(action: &Action) -> Option<Self> {
        match action {
            Action::Move { .. } => Some(Self::Move),
            Action::Attack { .. } => Some(Self::Attack),
            Action::Defend => Some(Self::Defend),
            Action::Ability { .. } => Some(Self::Ability),
            Action::Hold => Some(Self::Hold),
            Action::Deploy { .. } => None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum PuzzleAction {
    Move { path: Vec<Hex> },
    Attack { target_id: UnitId },
    Defend,
    Ability { target: Hex },
    Hold,
}

impl PuzzleAction {
    pub fn into_core(self) -> Action {
        match self {
            Self::Move { path } => Action::Move { path },
            Self::Attack { target_id } => Action::Attack { target_id },
            Self::Defend => Action::Defend,
            Self::Ability { target } => Action::Ability { target },
            Self::Hold => Action::Hold,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PuzzleOrder {
    pub unit_id: UnitId,
    pub action: PuzzleAction,
}

impl PuzzleOrder {
    pub fn into_core(self) -> UnitOrder {
        UnitOrder::new(self.unit_id, self.action.into_core())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum PuzzlePredicate {
    MovementConflictAt { coord: Hex },
    UnitAlive { unit_id: UnitId },
    UnitDestroyed { unit_id: UnitId },
    UnitAt { unit_id: UnitId, coord: Hex },
    TerrainEquals { coord: Hex, terrain: Terrain },
    All { predicates: Vec<PuzzlePredicate> },
    Any { predicates: Vec<PuzzlePredicate> },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum ChallengeCondition {
    UnitUndamaged { unit_id: UnitId },
    CompleteWithin { turns: u32 },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PuzzleConstraints {
    pub permitted_units: Vec<UnitId>,
    pub permitted_order_kinds: Vec<PuzzleOrderKind>,
    pub required_order_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExpectedPuzzleDigests {
    pub gameplay_definition: String,
    pub initial_state: String,
    pub reference_trace: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PuzzleDefinitionV1 {
    pub format_version: u16,
    pub puzzle_id: String,
    pub engine_compatibility: EngineCompatibility,
    pub metadata: PuzzleMetadata,
    pub grid_radius: i32,
    pub terrain: Vec<PuzzleTerrainCell>,
    pub players: Vec<PuzzlePlayer>,
    pub player_side: PlayerId,
    pub units: Vec<PuzzleUnit>,
    pub opponent_orders: BTreeMap<u32, Vec<PuzzleOrder>>,
    pub objective: PuzzlePredicate,
    pub failure_conditions: Vec<PuzzlePredicate>,
    pub turn_limit: u32,
    pub constraints: PuzzleConstraints,
    #[serde(default)]
    pub challenge_conditions: Vec<ChallengeCondition>,
    pub reference_solution: BTreeMap<u32, Vec<PuzzleOrder>>,
    pub expected_digests: ExpectedPuzzleDigests,
    #[serde(default)]
    pub generator_provenance: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PuzzleErrorCode {
    MalformedDefinition,
    FormatVersionMismatch,
    EngineCompatibilityMismatch,
    DigestMismatch,
    DuplicateId,
    MissingId,
    TerrainIncomplete,
    TerrainNotSorted,
    InvalidPlacement,
    InvalidConstraint,
    OwnershipMismatch,
    InvalidOrder,
    InvalidCommit,
    SessionFinished,
    ReplayFrameMissing,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PuzzleError {
    pub code: PuzzleErrorCode,
    pub message: String,
    #[serde(default)]
    pub order_errors: Vec<OrderValidationError>,
}

impl PuzzleError {
    fn new(code: PuzzleErrorCode, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
            order_errors: Vec::new(),
        }
    }

    fn orders(message: impl Into<String>, order_errors: Vec<OrderValidationError>) -> Self {
        Self {
            code: PuzzleErrorCode::InvalidOrder,
            message: message.into(),
            order_errors,
        }
    }
}

impl std::fmt::Display for PuzzleError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.message)
    }
}

impl std::error::Error for PuzzleError {}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PuzzleOutcome {
    InProgress,
    Success,
    Failure,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChallengeResult {
    pub description: String,
    pub passed: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PuzzleResult {
    pub outcome: PuzzleOutcome,
    pub reason: String,
    pub challenge_results: Vec<ChallengeResult>,
}

impl PuzzleResult {
    fn in_progress() -> Self {
        Self {
            outcome: PuzzleOutcome::InProgress,
            reason: "Plan the required orders, then commit.".to_string(),
            challenge_results: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PuzzleUnitView {
    pub id: UnitId,
    pub owner: PlayerId,
    pub unit_type: UnitType,
    pub coord: Hex,
    pub hp: i32,
    pub max_hp: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PuzzleStateView {
    pub turn: u32,
    pub terrain: Vec<PuzzleTerrainCell>,
    pub units: Vec<PuzzleUnitView>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LegalPuzzleOrder {
    pub unit_id: UnitId,
    pub order_kind: PuzzleOrderKind,
    pub path: Option<Vec<Hex>>,
    pub target: Option<Hex>,
    pub target_unit_id: Option<UnitId>,
    pub movement_cost: Option<u32>,
    pub label: String,
}

impl LegalPuzzleOrder {
    pub fn to_core(&self) -> UnitOrder {
        let action = match self.order_kind {
            PuzzleOrderKind::Move => Action::Move {
                path: self.path.clone().unwrap_or_default(),
            },
            PuzzleOrderKind::Attack => Action::Attack {
                target_id: self.target_unit_id.unwrap_or(UnitId(0)),
            },
            PuzzleOrderKind::Defend => Action::Defend,
            PuzzleOrderKind::Ability => Action::Ability {
                target: self.target.unwrap_or(Hex::ORIGIN),
            },
            PuzzleOrderKind::Hold => Action::Hold,
        };
        UnitOrder::new(self.unit_id, action)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PuzzleInteractionPreview {
    pub valid: bool,
    pub summary: String,
    pub damage_dealt: Option<i32>,
    pub counter_damage: Option<i32>,
    pub currently_blocked_by_los: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PuzzleReplayFrame {
    pub turn_index: u32,
    pub state: PuzzleStateView,
    pub events: Vec<SimEvent>,
    pub event_explanations: Vec<String>,
    pub orders: BTreeMap<PlayerId, Vec<UnitOrder>>,
    pub result: PuzzleResult,
    pub state_digest: String,
    pub frame_digest: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PuzzleDigestSet {
    pub gameplay_definition: String,
    pub initial_state: String,
    pub reference_trace: String,
}

#[derive(Debug, Clone)]
pub struct PuzzleSession {
    definition: PuzzleDefinitionV1,
    initial_state: GameState,
    state: GameState,
    queued_orders: BTreeMap<UnitId, UnitOrder>,
    frames: Vec<PuzzleReplayFrame>,
    result: PuzzleResult,
    gameplay_definition_digest: String,
    initial_state_digest: String,
}

impl PuzzleDefinitionV1 {
    pub fn from_json(json: &str) -> Result<Self, PuzzleError> {
        serde_json::from_str(json).map_err(|error| {
            PuzzleError::new(
                PuzzleErrorCode::MalformedDefinition,
                format!("puzzle JSON is malformed: {error}"),
            )
        })
    }

    pub fn validate(&self) -> Result<(), PuzzleError> {
        if self.format_version != PUZZLE_FORMAT_VERSION {
            return Err(PuzzleError::new(
                PuzzleErrorCode::FormatVersionMismatch,
                format!(
                    "format version mismatch: expected {PUZZLE_FORMAT_VERSION}, got {}",
                    self.format_version
                ),
            ));
        }
        if self.engine_compatibility != current_engine_compatibility() {
            return Err(PuzzleError::new(
                PuzzleErrorCode::EngineCompatibilityMismatch,
                "puzzle ruleset, engine contract, or ruleset digest is incompatible",
            ));
        }
        if self.puzzle_id.trim().is_empty()
            || self.metadata.title.trim().is_empty()
            || self.turn_limit == 0
            || self.grid_radius < 1
        {
            return Err(PuzzleError::new(
                PuzzleErrorCode::MalformedDefinition,
                "puzzle id, title, positive radius, and positive turn limit are required",
            ));
        }

        let expected_hexes =
            (3 * self.grid_radius * self.grid_radius + 3 * self.grid_radius + 1) as usize;
        if self.terrain.len() != expected_hexes {
            return Err(PuzzleError::new(
                PuzzleErrorCode::TerrainIncomplete,
                format!("terrain must explicitly define all {expected_hexes} grid cells"),
            ));
        }
        if !self
            .terrain
            .windows(2)
            .all(|cells| cells[0].coord < cells[1].coord)
        {
            return Err(PuzzleError::new(
                PuzzleErrorCode::TerrainNotSorted,
                "terrain must be unique and sorted by (q, r)",
            ));
        }
        if self
            .terrain
            .iter()
            .any(|cell| Hex::ORIGIN.distance(&cell.coord) > self.grid_radius as u32)
        {
            return Err(PuzzleError::new(
                PuzzleErrorCode::TerrainIncomplete,
                "terrain contains a coordinate outside the declared radius",
            ));
        }

        let player_ids: BTreeSet<PlayerId> = self.players.iter().map(|p| p.id).collect();
        if player_ids.len() != self.players.len() {
            return Err(PuzzleError::new(
                PuzzleErrorCode::DuplicateId,
                "player IDs must be unique",
            ));
        }
        if !player_ids.contains(&self.player_side) || self.players.len() < 2 {
            return Err(PuzzleError::new(
                PuzzleErrorCode::MissingId,
                "player_side must name one of at least two players",
            ));
        }

        let unit_ids: BTreeSet<UnitId> = self.units.iter().map(|unit| unit.id).collect();
        if unit_ids.len() != self.units.len() {
            return Err(PuzzleError::new(
                PuzzleErrorCode::DuplicateId,
                "unit IDs must be unique",
            ));
        }
        let coords: BTreeSet<Hex> = self.units.iter().map(|unit| unit.coord).collect();
        if coords.len() != self.units.len() {
            return Err(PuzzleError::new(
                PuzzleErrorCode::InvalidPlacement,
                "units cannot share an initial coordinate",
            ));
        }
        for unit in &self.units {
            let terrain = self
                .terrain
                .iter()
                .find(|cell| cell.coord == unit.coord)
                .map(|cell| cell.terrain);
            if !player_ids.contains(&unit.owner)
                || !terrain.is_some_and(|value| value.is_passable())
                || unit.hp <= 0
                || unit.hp > unit.unit_type.stats().max_hp
            {
                return Err(PuzzleError::new(
                    PuzzleErrorCode::InvalidPlacement,
                    format!("unit {} has invalid owner, position, or HP", unit.id.0),
                ));
            }
        }

        let permitted: BTreeSet<UnitId> =
            self.constraints.permitted_units.iter().copied().collect();
        if permitted.len() != self.constraints.permitted_units.len()
            || permitted.iter().any(|id| {
                !self
                    .units
                    .iter()
                    .any(|unit| unit.id == *id && unit.owner == self.player_side)
            })
            || self.constraints.required_order_count == 0
            || self.constraints.required_order_count > permitted.len()
        {
            return Err(PuzzleError::new(
                PuzzleErrorCode::InvalidConstraint,
                "puzzle order constraints are inconsistent with player units",
            ));
        }
        let kinds: BTreeSet<PuzzleOrderKind> = self
            .constraints
            .permitted_order_kinds
            .iter()
            .cloned()
            .collect();
        if kinds.len() != self.constraints.permitted_order_kinds.len() || kinds.is_empty() {
            return Err(PuzzleError::new(
                PuzzleErrorCode::InvalidConstraint,
                "permitted order kinds must be unique and non-empty",
            ));
        }

        let state = self.build_initial_state()?;
        self.validate_scripted_orders(&state)?;
        Ok(())
    }

    fn validate_scripted_orders(&self, state: &GameState) -> Result<(), PuzzleError> {
        for (turn, orders) in &self.opponent_orders {
            if *turn == 0 || *turn > self.turn_limit {
                return Err(PuzzleError::new(
                    PuzzleErrorCode::InvalidConstraint,
                    "opponent order turn is outside puzzle bounds",
                ));
            }
            for order in orders {
                let core = order.clone().into_core();
                let owner = state.units.get(&core.unit_id).map(|unit| unit.owner);
                if owner.is_none() || owner == Some(self.player_side) {
                    return Err(PuzzleError::new(
                        PuzzleErrorCode::OwnershipMismatch,
                        "opponent script contains a player-owned or missing unit",
                    ));
                }
                validate_unit_order(state, owner, &core)
                    .map_err(|error| PuzzleError::orders("invalid opponent order", vec![error]))?;
            }
        }
        for orders in self.reference_solution.values() {
            for order in orders {
                let core = order.clone().into_core();
                validate_unit_order(state, Some(self.player_side), &core).map_err(|error| {
                    PuzzleError::orders("invalid reference-solution order", vec![error])
                })?;
            }
        }
        Ok(())
    }

    fn build_initial_state(&self) -> Result<GameState, PuzzleError> {
        let mut grid = HexGrid::new(self.grid_radius);
        for cell in &self.terrain {
            grid.set_terrain(cell.coord, cell.terrain);
        }
        let players = self
            .players
            .iter()
            .map(|player| PlayerState {
                id: player.id,
                name: player.name.clone(),
                spawn_center: player.spawn_center,
            })
            .collect();
        let config = GameConfig {
            grid_radius: self.grid_radius,
            turn_timer_secs: 0,
            max_turns: self.turn_limit,
            fog_of_war: false,
            fortress_hold_turns: self.turn_limit.saturating_add(1),
            sight_range: self.grid_radius as u32,
        };
        let mut state = GameState::new(grid, players, config);
        state.phase = GamePhase::Planning;
        state.turn = 1;
        for fixture in &self.units {
            let mut unit = Unit::new(fixture.id, fixture.unit_type, fixture.owner, fixture.coord);
            unit.hp = fixture.hp;
            state
                .place_unit_with_id(unit)
                .map_err(|message| PuzzleError::new(PuzzleErrorCode::DuplicateId, message))?;
        }
        Ok(state)
    }

    pub fn computed_digests(&self) -> Result<PuzzleDigestSet, PuzzleError> {
        self.validate()?;
        let gameplay_definition = self.gameplay_digest()?;
        let mut session = PuzzleSession::new_internal(self.clone())?;
        let initial_state = session.initial_state_digest.clone();
        for turn in 1..=self.turn_limit {
            let Some(orders) = self.reference_solution.get(&turn) else {
                break;
            };
            for order in orders {
                session.queue_order(order.clone().into_core())?;
            }
            session.commit()?;
            if session.result.outcome != PuzzleOutcome::InProgress {
                break;
            }
        }
        Ok(PuzzleDigestSet {
            gameplay_definition,
            initial_state,
            reference_trace: session.trace_digest()?,
        })
    }

    fn gameplay_digest(&self) -> Result<String, PuzzleError> {
        let mut terrain: Vec<_> = self
            .terrain
            .iter()
            .map(|cell| (cell.coord, cell.terrain))
            .collect();
        terrain.sort_by_key(|(coord, _)| *coord);
        let mut players = self.players.clone();
        players.sort_by_key(|player| player.id);
        let mut units = self.units.clone();
        units.sort_by_key(|unit| unit.id);
        let canonical = serde_json::json!({
            "format_version": self.format_version,
            "puzzle_id": self.puzzle_id,
            "engine_compatibility": self.engine_compatibility,
            "grid_radius": self.grid_radius,
            "terrain": terrain,
            "players": players,
            "player_side": self.player_side,
            "units": units,
            "opponent_orders": self.opponent_orders,
            "objective": self.objective,
            "failure_conditions": self.failure_conditions,
            "turn_limit": self.turn_limit,
            "constraints": self.constraints,
            "challenge_conditions": self.challenge_conditions,
        });
        digest_json(&canonical)
    }
}

impl PuzzleSession {
    pub fn from_json(json: &str) -> Result<Self, PuzzleError> {
        Self::new(PuzzleDefinitionV1::from_json(json)?)
    }

    pub fn new(definition: PuzzleDefinitionV1) -> Result<Self, PuzzleError> {
        let computed = definition.computed_digests()?;
        let expected = &definition.expected_digests;
        let mismatches = [
            (
                "gameplay definition",
                &expected.gameplay_definition,
                &computed.gameplay_definition,
            ),
            (
                "initial state",
                &expected.initial_state,
                &computed.initial_state,
            ),
            (
                "reference trace",
                &expected.reference_trace,
                &computed.reference_trace,
            ),
        ]
        .into_iter()
        .filter(|(_, expected, actual)| expected != actual)
        .map(|(name, _, _)| name)
        .collect::<Vec<_>>();
        if !mismatches.is_empty() {
            return Err(PuzzleError::new(
                PuzzleErrorCode::DigestMismatch,
                format!("puzzle digest mismatch: {}", mismatches.join(", ")),
            ));
        }
        Self::new_internal(definition)
    }

    fn new_internal(definition: PuzzleDefinitionV1) -> Result<Self, PuzzleError> {
        definition.validate()?;
        let initial_state = definition.build_initial_state()?;
        let gameplay_definition_digest = definition.gameplay_digest()?;
        let initial_state_digest = state_digest(&initial_state)?;
        Ok(Self {
            definition,
            state: initial_state.clone(),
            initial_state,
            queued_orders: BTreeMap::new(),
            frames: Vec::new(),
            result: PuzzleResult::in_progress(),
            gameplay_definition_digest,
            initial_state_digest,
        })
    }

    pub fn definition(&self) -> &PuzzleDefinitionV1 {
        &self.definition
    }

    pub fn compatibility(&self) -> &EngineCompatibility {
        &self.definition.engine_compatibility
    }

    pub fn current_state(&self) -> PuzzleStateView {
        state_view(&self.state)
    }

    pub fn initial_state_digest(&self) -> &str {
        &self.initial_state_digest
    }

    pub fn gameplay_definition_digest(&self) -> &str {
        &self.gameplay_definition_digest
    }

    pub fn result(&self) -> &PuzzleResult {
        &self.result
    }

    pub fn queued_orders(&self) -> Vec<UnitOrder> {
        self.queued_orders.values().cloned().collect()
    }

    pub fn frames(&self) -> &[PuzzleReplayFrame] {
        &self.frames
    }

    pub fn replay_frame(&self, index: usize) -> Result<&PuzzleReplayFrame, PuzzleError> {
        self.frames.get(index).ok_or_else(|| {
            PuzzleError::new(
                PuzzleErrorCode::ReplayFrameMissing,
                format!("replay frame {index} does not exist"),
            )
        })
    }

    pub fn legal_orders(&self, unit_id: UnitId) -> Result<Vec<LegalPuzzleOrder>, PuzzleError> {
        let unit = self.state.units.get(&unit_id).ok_or_else(|| {
            PuzzleError::new(PuzzleErrorCode::MissingId, "player unit does not exist")
        })?;
        if unit.owner != self.definition.player_side
            || !self
                .definition
                .constraints
                .permitted_units
                .contains(&unit_id)
        {
            return Err(PuzzleError::new(
                PuzzleErrorCode::OwnershipMismatch,
                "unit is not controllable in this puzzle",
            ));
        }
        let allowed: BTreeSet<_> = self
            .definition
            .constraints
            .permitted_order_kinds
            .iter()
            .cloned()
            .collect();
        let mut legal = Vec::new();

        if allowed.contains(&PuzzleOrderKind::Hold) {
            legal.push(LegalPuzzleOrder {
                unit_id,
                order_kind: PuzzleOrderKind::Hold,
                path: None,
                target: None,
                target_unit_id: None,
                movement_cost: None,
                label: "Hold position".to_string(),
            });
        }
        if allowed.contains(&PuzzleOrderKind::Defend) {
            legal.push(LegalPuzzleOrder {
                unit_id,
                order_kind: PuzzleOrderKind::Defend,
                path: None,
                target: None,
                target_unit_id: None,
                movement_cost: None,
                label: "Defend (+2 defense this resolution)".to_string(),
            });
        }
        if allowed.contains(&PuzzleOrderKind::Move) {
            let (blocked, friendly) = occupancy_sets(&self.state, unit_id, unit.owner);
            let mut reachable = pathfinding::reachable_hexes(
                &self.state.grid,
                unit.position,
                unit.movement(),
                &blocked,
                &friendly,
            );
            reachable.sort_by_key(|(coord, cost)| (*cost, *coord));
            for (target, _) in reachable {
                if let Ok(path) = pathfinding::find_path(
                    &self.state.grid,
                    unit.position,
                    target,
                    unit.movement(),
                    &blocked,
                    &friendly,
                ) {
                    let cost = pathfinding::path_cost(&self.state.grid, &path);
                    legal.push(LegalPuzzleOrder {
                        unit_id,
                        order_kind: PuzzleOrderKind::Move,
                        path: Some(path),
                        target: Some(target),
                        target_unit_id: None,
                        movement_cost: Some(cost),
                        label: format!("Move to {target} ({cost} movement)"),
                    });
                }
            }
        }
        if allowed.contains(&PuzzleOrderKind::Attack) {
            for target in self.state.units.values() {
                let order = UnitOrder::attack(unit_id, target.id);
                if validate_unit_order(&self.state, Some(unit.owner), &order).is_ok() {
                    legal.push(LegalPuzzleOrder {
                        unit_id,
                        order_kind: PuzzleOrderKind::Attack,
                        path: None,
                        target: Some(target.position),
                        target_unit_id: Some(target.id),
                        movement_cost: None,
                        label: format!("Attack unit {}", target.id.0),
                    });
                }
            }
        }
        if allowed.contains(&PuzzleOrderKind::Ability) {
            for target in self.state.grid.all_hexes_sorted() {
                let order = UnitOrder::ability(unit_id, target);
                if validate_unit_order(&self.state, Some(unit.owner), &order).is_ok() {
                    legal.push(LegalPuzzleOrder {
                        unit_id,
                        order_kind: PuzzleOrderKind::Ability,
                        path: None,
                        target: Some(target),
                        target_unit_id: self
                            .state
                            .unit_at_hex(&target)
                            .map(|target_unit| target_unit.id),
                        movement_cost: None,
                        label: match unit.stats().ability {
                            Some(Ability::Demolish) => format!("Demolish terrain at {target}"),
                            Some(Ability::Heal) => format!("Heal unit at {target}"),
                            Some(Ability::Reveal) => format!("Reveal around {target}"),
                            _ => format!("Use ability at {target}"),
                        },
                    });
                }
            }
        }
        Ok(legal)
    }

    pub fn preview_order(
        &self,
        order: &UnitOrder,
    ) -> Result<PuzzleInteractionPreview, PuzzleError> {
        validate_unit_order(&self.state, Some(self.definition.player_side), order)
            .map_err(|error| PuzzleError::orders("order is invalid", vec![error]))?;
        if let Action::Attack { target_id } = order.action {
            let attacker = &self.state.units[&order.unit_id];
            let defender = &self.state.units[&target_id];
            let distance = attacker.position.distance(&defender.position);
            let preview = combat::preview_combat(
                attacker,
                defender,
                self.state.terrain_at_unit(target_id),
                distance,
            );
            let blocked = !crate::los::has_line_of_sight(
                &self.state.grid,
                attacker.position,
                defender.position,
            );
            return Ok(PuzzleInteractionPreview {
                valid: true,
                summary: if blocked {
                    "Attack is in range but currently blocked; an earlier ability may open it."
                        .to_string()
                } else {
                    format!(
                        "Deals {} damage and receives {} counter-damage.",
                        preview.damage_dealt, preview.counter_damage
                    )
                },
                damage_dealt: Some(preview.damage_dealt),
                counter_damage: Some(preview.counter_damage),
                currently_blocked_by_los: blocked,
            });
        }
        Ok(PuzzleInteractionPreview {
            valid: true,
            summary: match &order.action {
                Action::Move { path } => format!(
                    "Full path costs {} movement.",
                    pathfinding::path_cost(&self.state.grid, path)
                ),
                Action::Defend => "Adds 2 defense for this resolution.".to_string(),
                Action::Ability { target } => {
                    format!("Ability resolves at {target} before combat.")
                }
                Action::Hold => "Unit will hold position.".to_string(),
                Action::Deploy { .. } | Action::Attack { .. } => String::new(),
            },
            damage_dealt: None,
            counter_damage: None,
            currently_blocked_by_los: false,
        })
    }

    pub fn queue_order(&mut self, order: UnitOrder) -> Result<(), PuzzleError> {
        if self.result.outcome != PuzzleOutcome::InProgress {
            return Err(PuzzleError::new(
                PuzzleErrorCode::SessionFinished,
                "finished puzzle sessions cannot accept orders",
            ));
        }
        if !self
            .definition
            .constraints
            .permitted_units
            .contains(&order.unit_id)
        {
            return Err(PuzzleError::new(
                PuzzleErrorCode::InvalidConstraint,
                "unit is not permitted by this puzzle",
            ));
        }
        let kind = PuzzleOrderKind::of(&order.action).ok_or_else(|| {
            PuzzleError::new(
                PuzzleErrorCode::InvalidConstraint,
                "deploy orders are not supported in puzzles",
            )
        })?;
        if !self
            .definition
            .constraints
            .permitted_order_kinds
            .contains(&kind)
        {
            return Err(PuzzleError::new(
                PuzzleErrorCode::InvalidConstraint,
                "order kind is not permitted by this puzzle",
            ));
        }
        validate_unit_order(&self.state, Some(self.definition.player_side), &order)
            .map_err(|error| PuzzleError::orders("order is invalid", vec![error]))?;
        self.queued_orders.insert(order.unit_id, order);
        Ok(())
    }

    pub fn remove_order(&mut self, unit_id: UnitId) -> bool {
        self.queued_orders.remove(&unit_id).is_some()
    }

    pub fn validate_commit(&self) -> Result<(), PuzzleError> {
        if self.result.outcome != PuzzleOutcome::InProgress {
            return Err(PuzzleError::new(
                PuzzleErrorCode::SessionFinished,
                "puzzle is already finished",
            ));
        }
        if self.queued_orders.len() != self.definition.constraints.required_order_count {
            return Err(PuzzleError::new(
                PuzzleErrorCode::InvalidCommit,
                format!(
                    "queue exactly {} order(s) before committing",
                    self.definition.constraints.required_order_count
                ),
            ));
        }
        let errors = self
            .queued_orders
            .values()
            .filter_map(|order| {
                validate_unit_order(&self.state, Some(self.definition.player_side), order).err()
            })
            .collect::<Vec<_>>();
        if !errors.is_empty() {
            return Err(PuzzleError::orders(
                "one or more queued orders are invalid",
                errors,
            ));
        }
        Ok(())
    }

    pub fn commit(&mut self) -> Result<&PuzzleReplayFrame, PuzzleError> {
        self.validate_commit()?;
        let turn = self.state.turn;
        let mut all_orders: BTreeMap<PlayerId, Vec<UnitOrder>> = BTreeMap::new();
        all_orders.insert(
            self.definition.player_side,
            self.queued_orders.values().cloned().collect(),
        );
        if let Some(scripted) = self.definition.opponent_orders.get(&turn) {
            for order in scripted {
                let core = order.clone().into_core();
                let owner = self
                    .state
                    .units
                    .get(&core.unit_id)
                    .map(|unit| unit.owner)
                    .ok_or_else(|| {
                        PuzzleError::new(
                            PuzzleErrorCode::MissingId,
                            "scripted opponent unit is missing",
                        )
                    })?;
                if owner == self.definition.player_side {
                    return Err(PuzzleError::new(
                        PuzzleErrorCode::OwnershipMismatch,
                        "opponent script attempted to control a player unit",
                    ));
                }
                validate_unit_order(&self.state, Some(owner), &core).map_err(|error| {
                    PuzzleError::orders("opponent order is invalid", vec![error])
                })?;
                all_orders.entry(owner).or_default().push(core);
            }
        }
        for orders in all_orders.values_mut() {
            orders.sort_by_key(|order| order.unit_id);
        }

        let events = simulate_puzzle_turn(&mut self.state, &all_orders);
        self.result = self.evaluate_result(&events);
        let state_view = state_view(&self.state);
        let state_digest = state_digest(&self.state)?;
        let event_explanations = events.iter().map(explain_event).collect::<Vec<_>>();
        let frame_value = serde_json::json!({
            "turn_index": turn,
            "state": state_view,
            "events": events,
            "orders": all_orders,
            "result": self.result,
            "state_digest": state_digest,
        });
        let frame_digest = digest_json(&frame_value)?;
        self.frames.push(PuzzleReplayFrame {
            turn_index: turn,
            state: state_view,
            events,
            event_explanations,
            orders: all_orders,
            result: self.result.clone(),
            state_digest,
            frame_digest,
        });
        self.queued_orders.clear();
        Ok(self.frames.last().expect("frame was just inserted"))
    }

    fn evaluate_result(&self, events: &[SimEvent]) -> PuzzleResult {
        for predicate in &self.definition.failure_conditions {
            if predicate_matches(predicate, &self.state, events) {
                return PuzzleResult {
                    outcome: PuzzleOutcome::Failure,
                    reason: predicate_reason(predicate, false),
                    challenge_results: self.challenge_results(),
                };
            }
        }
        if predicate_matches(&self.definition.objective, &self.state, events) {
            return PuzzleResult {
                outcome: PuzzleOutcome::Success,
                reason: predicate_reason(&self.definition.objective, true),
                challenge_results: self.challenge_results(),
            };
        }
        if self.state.turn.saturating_sub(1) >= self.definition.turn_limit {
            return PuzzleResult {
                outcome: PuzzleOutcome::Failure,
                reason: format!(
                    "The objective was not met within {} resolution(s).",
                    self.definition.turn_limit
                ),
                challenge_results: self.challenge_results(),
            };
        }
        PuzzleResult::in_progress()
    }

    fn challenge_results(&self) -> Vec<ChallengeResult> {
        self.definition
            .challenge_conditions
            .iter()
            .map(|condition| match condition {
                ChallengeCondition::UnitUndamaged { unit_id } => {
                    let initial_hp = self.initial_state.units.get(unit_id).map(|unit| unit.hp);
                    let current_hp = self.state.units.get(unit_id).map(|unit| unit.hp);
                    ChallengeResult {
                        description: format!("Unit {} takes no damage", unit_id.0),
                        passed: initial_hp.is_some() && initial_hp == current_hp,
                    }
                }
                ChallengeCondition::CompleteWithin { turns } => ChallengeResult {
                    description: format!("Complete within {turns} resolution(s)"),
                    passed: self.frames.len() < *turns as usize,
                },
            })
            .collect()
    }

    pub fn trace_digest(&self) -> Result<String, PuzzleError> {
        let frames = self
            .frames
            .iter()
            .map(|frame| frame.frame_digest.as_str())
            .collect::<Vec<_>>();
        digest_json(&serde_json::json!({
            "initial_state_digest": self.initial_state_digest,
            "frames": frames,
        }))
    }

    pub fn recompute_trace_digest(&self) -> Result<String, PuzzleError> {
        let mut replay = PuzzleSession::new_internal(self.definition.clone())?;
        for frame in &self.frames {
            let player_orders = frame
                .orders
                .get(&self.definition.player_side)
                .cloned()
                .unwrap_or_default();
            for order in player_orders {
                replay.queue_order(order)?;
            }
            replay.commit()?;
        }
        replay.trace_digest()
    }

    pub fn reset(&self) -> Result<Self, PuzzleError> {
        Self::new_internal(self.definition.clone())
    }
}

fn predicate_matches(predicate: &PuzzlePredicate, state: &GameState, events: &[SimEvent]) -> bool {
    match predicate {
        PuzzlePredicate::MovementConflictAt { coord } => events
            .iter()
            .any(|event| matches!(event, SimEvent::MovementConflict { hex, .. } if hex == coord)),
        PuzzlePredicate::UnitAlive { unit_id } => state.units.contains_key(unit_id),
        PuzzlePredicate::UnitDestroyed { unit_id } => !state.units.contains_key(unit_id),
        PuzzlePredicate::UnitAt { unit_id, coord } => state
            .units
            .get(unit_id)
            .is_some_and(|unit| unit.position == *coord),
        PuzzlePredicate::TerrainEquals { coord, terrain } => {
            state.grid.get_terrain(coord) == Some(*terrain)
        }
        PuzzlePredicate::All { predicates } => predicates
            .iter()
            .all(|candidate| predicate_matches(candidate, state, events)),
        PuzzlePredicate::Any { predicates } => predicates
            .iter()
            .any(|candidate| predicate_matches(candidate, state, events)),
    }
}

fn predicate_reason(predicate: &PuzzlePredicate, success: bool) -> String {
    match (predicate, success) {
        (PuzzlePredicate::MovementConflictAt { coord }, true) => {
            format!("Success: both sides contested {coord} in the same resolution.")
        }
        (PuzzlePredicate::UnitAlive { unit_id }, true) => {
            format!("Success: marked unit {} survived the assault.", unit_id.0)
        }
        (PuzzlePredicate::UnitDestroyed { unit_id }, true) => {
            format!("Success: target unit {} was destroyed.", unit_id.0)
        }
        (PuzzlePredicate::UnitDestroyed { unit_id }, false) => {
            format!("Failure: marked unit {} was destroyed.", unit_id.0)
        }
        (PuzzlePredicate::UnitAlive { unit_id }, false) => {
            format!("Failure: unit {} remained alive.", unit_id.0)
        }
        (_, true) => "Success: the objective predicate passed.".to_string(),
        (_, false) => "Failure: a failure predicate triggered.".to_string(),
    }
}

fn state_view(state: &GameState) -> PuzzleStateView {
    PuzzleStateView {
        turn: state.turn,
        terrain: state
            .grid
            .all_hexes_sorted()
            .into_iter()
            .filter_map(|coord| {
                state
                    .grid
                    .get_terrain(&coord)
                    .map(|terrain| PuzzleTerrainCell { coord, terrain })
            })
            .collect(),
        units: state
            .units
            .values()
            .map(|unit| PuzzleUnitView {
                id: unit.id,
                owner: unit.owner,
                unit_type: unit.unit_type,
                coord: unit.position,
                hp: unit.hp,
                max_hp: unit.max_hp,
            })
            .collect(),
    }
}

fn state_digest(state: &GameState) -> Result<String, PuzzleError> {
    let mut players = state.players.clone();
    players.sort_by_key(|player| player.id);
    digest_json(&serde_json::json!({
        "turn": state.turn,
        "phase": state.phase,
        "grid_radius": state.grid.radius(),
        "state": state_view(state),
        "players": players,
        "fortress_control_turns": state.fortress_control_turns,
    }))
}

fn occupancy_sets(
    state: &GameState,
    requesting_unit: UnitId,
    owner: PlayerId,
) -> (HashSet<Hex>, HashSet<Hex>) {
    let mut blocked = HashSet::new();
    let mut friendly = HashSet::new();
    for unit in state.units.values() {
        if unit.id == requesting_unit || !unit.is_alive() {
            continue;
        }
        if unit.owner == owner {
            friendly.insert(unit.position);
        } else {
            blocked.insert(unit.position);
        }
    }
    (blocked, friendly)
}

fn explain_event(event: &SimEvent) -> String {
    match event {
        SimEvent::UnitMoved { unit_id, path } => format!(
            "Unit {} moved along {}.",
            unit_id.0,
            path.iter()
                .map(ToString::to_string)
                .collect::<Vec<_>>()
                .join(" → ")
        ),
        SimEvent::UnitAttacked {
            attacker_id,
            defender_id,
            damage,
            counter_damage,
        } => format!(
            "Unit {} attacked unit {} for {} damage; counter-damage was {}.",
            attacker_id.0, defender_id.0, damage, counter_damage
        ),
        SimEvent::UnitDestroyed { unit_id } => format!("Unit {} was destroyed.", unit_id.0),
        SimEvent::UnitHealed {
            healer_id,
            target_id,
            amount,
        } => format!(
            "Unit {} healed unit {} for {} HP.",
            healer_id.0, target_id.0, amount
        ),
        SimEvent::TerrainChanged { hex, from, to } => {
            format!("Terrain at {hex} changed from {from:?} to {to:?}.")
        }
        SimEvent::MovementConflict {
            unit_a,
            unit_b,
            hex,
        } => format!(
            "Units {} and {} collided at {hex}; both stayed in place and took 1 damage.",
            unit_a.0, unit_b.0
        ),
        SimEvent::UnitDefending { unit_id } => {
            format!(
                "Unit {} defended for +2 defense this resolution.",
                unit_id.0
            )
        }
        SimEvent::FortressCaptured { hex, player_id } => {
            format!("Player {} controlled the fortress at {hex}.", player_id.0)
        }
        SimEvent::GameOver { winner, reason } => {
            format!("Multiplayer terminal event {winner:?}: {reason}.")
        }
    }
}

fn digest_json(value: &impl Serialize) -> Result<String, PuzzleError> {
    let bytes = serde_json::to_vec(value).map_err(|error| {
        PuzzleError::new(
            PuzzleErrorCode::MalformedDefinition,
            format!("canonical serialization failed: {error}"),
        )
    })?;
    Ok(digest_bytes(&bytes))
}

fn digest_bytes(bytes: &[u8]) -> String {
    let digest = Sha256::digest(bytes);
    let mut output = String::with_capacity(digest.len() * 2);
    for byte in digest {
        use std::fmt::Write;
        let _ = write!(output, "{byte:02x}");
    }
    output
}

#[cfg(test)]
mod tests {
    use super::*;

    fn terrain(radius: i32) -> Vec<PuzzleTerrainCell> {
        let mut cells = Hex::ORIGIN
            .hexes_in_range(radius as u32)
            .into_iter()
            .map(|coord| PuzzleTerrainCell {
                coord,
                terrain: Terrain::Plains,
            })
            .collect::<Vec<_>>();
        cells.sort_by_key(|cell| cell.coord);
        cells
    }

    fn definition() -> PuzzleDefinitionV1 {
        PuzzleDefinitionV1 {
            format_version: PUZZLE_FORMAT_VERSION,
            puzzle_id: "test-collision".to_string(),
            engine_compatibility: current_engine_compatibility(),
            metadata: PuzzleMetadata {
                title: "Test".to_string(),
                briefing: "Test".to_string(),
                learning_goal: "Test".to_string(),
                difficulty: "Test".to_string(),
                enemy_intent: "Move".to_string(),
                hints: vec![],
            },
            grid_radius: 2,
            terrain: terrain(2),
            players: vec![
                PuzzlePlayer {
                    id: PlayerId(0),
                    name: "Player".to_string(),
                    side: "player".to_string(),
                    spawn_center: Hex::new(-1, 0),
                },
                PuzzlePlayer {
                    id: PlayerId(1),
                    name: "Opponent".to_string(),
                    side: "opponent".to_string(),
                    spawn_center: Hex::new(1, 0),
                },
            ],
            player_side: PlayerId(0),
            units: vec![
                PuzzleUnit {
                    id: UnitId(7),
                    owner: PlayerId(0),
                    unit_type: UnitType::Scout,
                    coord: Hex::new(-1, 0),
                    hp: 2,
                },
                PuzzleUnit {
                    id: UnitId(9),
                    owner: PlayerId(1),
                    unit_type: UnitType::Scout,
                    coord: Hex::new(1, 0),
                    hp: 2,
                },
            ],
            opponent_orders: BTreeMap::from([(
                1,
                vec![PuzzleOrder {
                    unit_id: UnitId(9),
                    action: PuzzleAction::Move {
                        path: vec![Hex::new(1, 0), Hex::ORIGIN],
                    },
                }],
            )]),
            objective: PuzzlePredicate::MovementConflictAt { coord: Hex::ORIGIN },
            failure_conditions: vec![],
            turn_limit: 1,
            constraints: PuzzleConstraints {
                permitted_units: vec![UnitId(7)],
                permitted_order_kinds: vec![PuzzleOrderKind::Move],
                required_order_count: 1,
            },
            challenge_conditions: vec![],
            reference_solution: BTreeMap::from([(
                1,
                vec![PuzzleOrder {
                    unit_id: UnitId(7),
                    action: PuzzleAction::Move {
                        path: vec![Hex::new(-1, 0), Hex::ORIGIN],
                    },
                }],
            )]),
            expected_digests: ExpectedPuzzleDigests {
                gameplay_definition: String::new(),
                initial_state: String::new(),
                reference_trace: String::new(),
            },
            generator_provenance: None,
        }
    }

    #[test]
    fn validates_and_rejects_engine_mismatch() {
        let mut definition = definition();
        assert!(definition.validate().is_ok());
        definition.engine_compatibility.ruleset_id = "wrong".to_string();
        assert_eq!(
            definition.validate().expect_err("must fail").code,
            PuzzleErrorCode::EngineCompatibilityMismatch
        );
    }

    #[test]
    fn rejects_duplicate_ids_and_missing_terrain() {
        let mut duplicate = definition();
        duplicate.units[1].id = duplicate.units[0].id;
        assert_eq!(
            duplicate.validate().expect_err("must fail").code,
            PuzzleErrorCode::DuplicateId
        );
        let mut incomplete = definition();
        incomplete.terrain.pop();
        assert_eq!(
            incomplete.validate().expect_err("must fail").code,
            PuzzleErrorCode::TerrainIncomplete
        );
    }

    #[test]
    fn strict_commit_uses_full_path_and_ownership() {
        let mut session = PuzzleSession::new_internal(definition()).expect("session");
        let short = UnitOrder::move_to(UnitId(7), vec![Hex::ORIGIN]);
        assert_eq!(
            session.queue_order(short).expect_err("short path").code,
            PuzzleErrorCode::InvalidOrder
        );
        let enemy = UnitOrder::move_to(UnitId(9), vec![Hex::new(1, 0), Hex::ORIGIN]);
        assert_eq!(
            session
                .queue_order(enemy)
                .expect_err("enemy ownership")
                .code,
            PuzzleErrorCode::InvalidConstraint
        );
    }

    #[test]
    fn collision_trace_recomputes_and_reset_is_isolated() {
        let definition = definition();
        let mut session = PuzzleSession::new_internal(definition).expect("session");
        session
            .queue_order(UnitOrder::move_to(
                UnitId(7),
                vec![Hex::new(-1, 0), Hex::ORIGIN],
            ))
            .expect("queue");
        let frame = session.commit().expect("commit");
        assert_eq!(frame.result.outcome, PuzzleOutcome::Success);
        assert_eq!(
            session.trace_digest().expect("trace"),
            session.recompute_trace_digest().expect("recompute")
        );
        let reset = session.reset().expect("reset");
        assert!(reset.frames.is_empty());
        assert!(reset.queued_orders.is_empty());
        assert_eq!(reset.result.outcome, PuzzleOutcome::InProgress);
        assert_eq!(reset.initial_state_digest, session.initial_state_digest);
    }

    #[test]
    fn failure_precedes_success() {
        let mut definition = definition();
        definition.failure_conditions =
            vec![PuzzlePredicate::MovementConflictAt { coord: Hex::ORIGIN }];
        let mut session = PuzzleSession::new_internal(definition).expect("session");
        session
            .queue_order(UnitOrder::move_to(
                UnitId(7),
                vec![Hex::new(-1, 0), Hex::ORIGIN],
            ))
            .expect("queue");
        assert_eq!(
            session.commit().expect("commit").result.outcome,
            PuzzleOutcome::Failure
        );
    }

    #[test]
    fn canonical_state_digest_ignores_hashmap_insertion_order() {
        let mut first = HexGrid::new(2);
        let mut second = HexGrid::new(2);
        let sorted = first.all_hexes_sorted();
        for coord in &sorted {
            first.set_terrain(*coord, Terrain::Forest);
        }
        for coord in sorted.iter().rev() {
            second.set_terrain(*coord, Terrain::Forest);
        }
        let players = vec![
            PlayerState {
                id: PlayerId(0),
                name: "A".to_string(),
                spawn_center: Hex::ORIGIN,
            },
            PlayerState {
                id: PlayerId(1),
                name: "B".to_string(),
                spawn_center: Hex::new(1, 0),
            },
        ];
        let first = GameState::new(first, players.clone(), GameConfig::default());
        let second = GameState::new(second, players, GameConfig::default());
        assert_eq!(
            state_digest(&first).expect("first"),
            state_digest(&second).expect("second")
        );
    }

    #[test]
    fn curated_fixtures_lock_expected_digests_and_repeat_1000_times() {
        let fixtures = [
            include_str!("../../../client/src/puzzles/collision-course.v1.json"),
            include_str!("../../../client/src/puzzles/hold-the-line.v1.json"),
            include_str!("../../../client/src/puzzles/open-the-shot.v1.json"),
        ];
        for fixture in fixtures {
            let definition = PuzzleDefinitionV1::from_json(fixture).expect("fixture JSON");
            let expected = definition.expected_digests.clone();
            let computed = definition.computed_digests().expect("fixture digests");
            assert_eq!(computed.gameplay_definition, expected.gameplay_definition);
            assert_eq!(computed.initial_state, expected.initial_state);
            assert_eq!(computed.reference_trace, expected.reference_trace);

            for _ in 0..1_000 {
                let repeated = definition.computed_digests().expect("repeat digests");
                assert_eq!(repeated.reference_trace, expected.reference_trace);
            }
            assert!(PuzzleSession::new(definition).is_ok());
        }
    }

    #[test]
    fn metadata_is_outside_gameplay_digest() {
        let first = definition();
        let first_digest = first.gameplay_digest().expect("digest");
        let mut second = first;
        second.metadata.title = "A completely different human title".to_string();
        second.metadata.hints.push("Different hint".to_string());
        assert_eq!(
            first_digest,
            second.gameplay_digest().expect("metadata-free digest")
        );
    }

    #[test]
    fn rejects_impassable_placement_and_invalid_constraints() {
        let mut impassable = definition();
        let occupied = impassable.units[0].coord;
        impassable
            .terrain
            .iter_mut()
            .find(|cell| cell.coord == occupied)
            .expect("occupied terrain")
            .terrain = Terrain::Water;
        assert_eq!(
            impassable.validate().expect_err("must fail").code,
            PuzzleErrorCode::InvalidPlacement
        );

        let mut constraints = definition();
        constraints.constraints.permitted_units.push(UnitId(99));
        assert_eq!(
            constraints.validate().expect_err("must fail").code,
            PuzzleErrorCode::InvalidConstraint
        );
    }
}
