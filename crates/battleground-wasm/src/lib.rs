use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn ping() -> String {
    "BattleGrid WASM — alive".to_string()
}
