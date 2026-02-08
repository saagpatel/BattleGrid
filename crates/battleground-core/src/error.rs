use crate::hex::Hex;
use crate::types::{PlayerId, UnitId};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum GameError {
    #[error("invalid hex coordinate ({q}, {r}): {reason}")]
    InvalidHex { q: i32, r: i32, reason: String },

    #[error("hex ({q}, {r}) is out of grid bounds (radius {radius})")]
    OutOfBounds { q: i32, r: i32, radius: i32 },

    #[error("hex ({}, {}) is impassable terrain", .hex.q, .hex.r)]
    ImpassableTerrain { hex: Hex },

    #[error("unit {unit_id} not found")]
    UnitNotFound { unit_id: UnitId },

    #[error("unit {unit_id} does not belong to player {player_id}")]
    NotOwner {
        unit_id: UnitId,
        player_id: PlayerId,
    },

    #[error("unit {unit_id} cannot move to ({}, {}): {reason}", .target.q, .target.r)]
    InvalidMove {
        unit_id: UnitId,
        target: Hex,
        reason: String,
    },

    #[error("no path from ({}, {}) to ({}, {})", .from.q, .from.r, .to.q, .to.r)]
    NoPath { from: Hex, to: Hex },

    #[error("path too long for unit {unit_id}: cost {cost} exceeds movement {max_movement}")]
    PathTooLong {
        unit_id: UnitId,
        cost: u32,
        max_movement: u32,
    },

    #[error("unit {attacker_id} cannot attack unit {target_id}: {reason}")]
    InvalidAttack {
        attacker_id: UnitId,
        target_id: UnitId,
        reason: String,
    },

    #[error("invalid order for unit {unit_id}: {reason}")]
    InvalidOrder { unit_id: UnitId, reason: String },

    #[error("player {player_id} not found")]
    PlayerNotFound { player_id: PlayerId },

    #[error("wrong game phase: expected {expected}, got {actual}")]
    WrongPhase { expected: String, actual: String },

    #[error("deployment error for unit {unit_id}: {reason}")]
    DeploymentError { unit_id: UnitId, reason: String },

    #[error("invalid ability target ({}, {}): {reason}", .target.q, .target.r)]
    InvalidAbilityTarget { target: Hex, reason: String },

    #[error("no line of sight from ({}, {}) to ({}, {})", .from.q, .from.r, .to.q, .to.r)]
    NoLineOfSight { from: Hex, to: Hex },

    #[error("map generation failed: {reason}")]
    MapGenError { reason: String },
}
