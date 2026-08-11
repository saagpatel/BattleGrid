#![cfg(target_arch = "wasm32")]

use battleground_core::puzzle::{LegalPuzzleOrder, PuzzleOutcome};
use battleground_wasm::{
    PuzzleCommitResponse, PuzzleDigestView, PuzzleValidationResponse, WasmPuzzleSession,
};
use wasm_bindgen_test::*;

const COLLISION: &str = include_str!("../../../client/src/puzzles/collision-course.v1.json");
const OPEN_SHOT: &str = include_str!("../../../client/src/puzzles/open-the-shot.v1.json");

#[wasm_bindgen_test]
fn actual_wasm_runtime_matches_locked_native_trace() {
    let mut session = WasmPuzzleSession::new(COLLISION).expect("load fixture");
    let digests: PuzzleDigestView =
        serde_wasm_bindgen::from_value(session.digests().expect("digests")).expect("decode");
    assert_eq!(
        digests.initial_state,
        "35867d1b38accb0d439d64c1648c17bedb9976ffd27b81814b0ae960d57e7467"
    );

    let legal: Vec<LegalPuzzleOrder> =
        serde_wasm_bindgen::from_value(session.legal_orders(1).expect("legal")).expect("decode");
    let collision = legal
        .into_iter()
        .find(|order| {
            order
                .target
                .is_some_and(|coord| coord.q == 0 && coord.r == 0)
        })
        .expect("center move");
    let queued: PuzzleValidationResponse = serde_wasm_bindgen::from_value(
        session
            .queue_order(serde_wasm_bindgen::to_value(&collision).expect("encode"))
            .expect("queue"),
    )
    .expect("decode queue");
    assert!(queued.valid);
    let validation: PuzzleValidationResponse =
        serde_wasm_bindgen::from_value(session.validate_commit().expect("validate"))
            .expect("decode validation");
    assert!(validation.valid);

    let committed: PuzzleCommitResponse =
        serde_wasm_bindgen::from_value(session.commit().expect("commit")).expect("decode commit");
    assert!(committed.ok);
    let frame = committed.frame.expect("frame");
    assert_eq!(frame.result.outcome, PuzzleOutcome::Success);
    assert!(frame
        .event_explanations
        .iter()
        .any(|line| line.contains("collided")));
    let digests: PuzzleDigestView =
        serde_wasm_bindgen::from_value(session.digests().expect("digests")).expect("decode");
    assert_eq!(
        digests.trace,
        "b142bfecd0e125992c697ed3ffec48678d290813d9cc3226ea3fba0e8d9f323c"
    );

    session.reset().expect("reset");
    assert_eq!(session.replay_frame_count(), 0);
    let reset_digests: PuzzleDigestView =
        serde_wasm_bindgen::from_value(session.digests().expect("reset digests")).expect("decode");
    assert_eq!(reset_digests.initial_state, digests.initial_state);
    assert_ne!(reset_digests.trace, digests.trace);
}

#[wasm_bindgen_test]
fn actual_wasm_runtime_exposes_ability_before_combat_orders() {
    let session = WasmPuzzleSession::new(OPEN_SHOT).expect("load fixture");
    let siege: Vec<LegalPuzzleOrder> =
        serde_wasm_bindgen::from_value(session.legal_orders(1).expect("siege legal"))
            .expect("decode siege");
    assert!(siege.iter().any(|order| {
        order
            .target
            .is_some_and(|coord| coord.q == 1 && coord.r == 0)
            && order.label.contains("Demolish")
    }));
    let archer: Vec<LegalPuzzleOrder> =
        serde_wasm_bindgen::from_value(session.legal_orders(2).expect("archer legal"))
            .expect("decode archer");
    assert!(archer
        .iter()
        .any(|order| order.target_unit_id.is_some_and(|id| id.0 == 3)));
}

#[wasm_bindgen_test]
fn malformed_and_incompatible_definitions_fail_closed_in_wasm() {
    assert!(WasmPuzzleSession::new("{not-json").is_err());
    let incompatible = COLLISION.replace(
        "\"engine_contract_version\": \"puzzle-session-v1\"",
        "\"engine_contract_version\": \"wrong\"",
    );
    assert!(WasmPuzzleSession::new(&incompatible).is_err());
}
