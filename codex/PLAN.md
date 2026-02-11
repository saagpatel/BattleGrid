# Delta Plan

## A) Executive Summary
### Current state (repo-grounded)
- Rust workspace with 3 crates: `battleground-core`, `battleground-server`, `battleground-wasm`. (`Cargo.toml`, `crates/*`)
- Core simulation uses deterministic structures (`BTreeMap`) and explicit turn pipeline. (`crates/battleground-core/src/simulation.rs`)
- Server exposes WebSocket-only multiplayer flow with room management and binary protocol framing. (`crates/battleground-server/src/ws.rs`, `protocol.rs`)
- WASM crate implements codec and gameplay helpers and claims protocol parity with server. (`crates/battleground-wasm/src/lib.rs`)
- Client React app has screen/state architecture and tests, but message contracts differ from server/WASM contracts. (`client/src/types/network.ts`, `client/src/network/client.ts`)
- Baseline verification is green for both Rust and client unit tests. (`codex/VERIFICATION.md`)

### Key risks
- Protocol drift across server/WASM/client (field names and variants differ), creating integration fragility.
- Connection store sends raw JSON directly, bypassing binary codec path.
- Lobby UI expects fields not present in server `RoomInfo` (`name`, `status`).
- Quick Match UI does not call server quick-match API.

### Improvement themes (prioritized)
1. Stabilize client send path to use shared codec plumbing.
2. Fix lobby behavior inconsistencies (room rendering + quick match request semantics).
3. Add regression tests around network send and lobby quick match flow.

## B) Constraints & Invariants (Repo-derived)
### Explicit invariants
- Protocol version prefix and bincode framing are authoritative for server traffic. (`crates/battleground-server/src/protocol.rs`)
- Deterministic simulation must preserve `BTreeMap`-based behavior.
- Existing test suites must remain green.

### Inferred invariants
- Client should degrade gracefully when disconnected (no throw on send).
- Lobby should remain operable with only room id/count data.

### Non-goals
- Full protocol redesign across all game phases.
- Persistence/auth infrastructure.
- Renderer/gameplay UX redesign.

## C) Proposed Changes by Theme (Prioritized)
### Theme 1: Client send path uses codec
- Current: `connectionStore.send` always JSON-stringifies payload.
- Proposed: route all outgoing messages through `encodeMessage` helper.
- Why: aligns transport with existing codec abstraction and WASM binary path.
- Tradeoff: does not fully solve schema drift by itself.
- Scope: client store + tests only.

### Theme 2: Lobby contract resilience
- Current: lobby list assumes room `name/status`; quick match only joins local waiting room.
- Proposed:
  - Render room label from `room.name ?? room.roomId`.
  - Enable quick match to always send server quick-match request when connected.
- Why: fixes user-visible dead-end behavior without broad rewrite.
- Scope: lobby screen and network type definitions.

### Theme 3: Regression coverage
- Add tests verifying:
  - send path uses codec output type.
  - quick match emits expected command.
  - lobby renders fallback room id.

## D) File/Module Delta (Exact)
### ADD
- `codex/*` session artifacts.
- `client/src/__tests__/connectionStore.test.ts` (new regression coverage).

### MODIFY
- `client/src/stores/connectionStore.ts` — send through codec.
- `client/src/types/network.ts` — include quick-match client message, optional room display fields.
- `client/src/screens/LobbyScreen.tsx` — fallback rendering + quick match request.
- `client/src/__tests__/LobbyScreen.test.tsx` — align tests with fallback behavior and quick-match command.

### REMOVE/DEPRECATE
- None.

### Boundary rules
- No server/core protocol changes in this delta.
- No gameplay algorithm changes.

## E) Data Models & API Contracts (Delta)
- Current contracts are split:
  - Server: Rust enums (`ClientMessage`/`ServerMessage`).
  - Client: TS discriminated unions with differing schema.
- Delta:
  - Extend client `ClientMessage` union with `QuickMatch` to match existing server capability.
  - Relax `RoomInfo` UI assumptions by making room display fields optional.
- Compatibility:
  - Backward-compatible within client tests.
  - Does not claim full server/client contract convergence.

## F) Implementation Sequence (Dependency-Explicit)
1. **Step 1**: Create codex artifacts and discovery logs.
   - Verify: none beyond file sanity.
   - Rollback: delete `codex/` directory.
2. **Step 2**: Update client network types + connection send path.
   - Verify: `cd client && pnpm test -- connectionStore` (or full test if needed).
   - Rollback: revert modified files.
3. **Step 3**: Update lobby quick-match/rendering behavior + tests.
   - Verify: `cd client && pnpm test -- LobbyScreen`.
   - Rollback: revert lobby and test files.
4. **Step 4**: Full verification.
   - Verify: `cargo test --workspace`, `cd client && pnpm test`.
   - Rollback: revert last step if failures are introduced.

## G) Error Handling & Edge Cases
- Preserve current `send()` behavior when disconnected (warn and no throw).
- Quick match should no-op when not connected (button already disabled).
- Room rendering should handle minimal room payload gracefully.

## H) Integration & Testing Strategy
- Unit tests only in this delta; integration protocol mismatch remains a known follow-up theme.
- Definition of done:
  - All baseline tests pass.
  - New tests cover changed behaviors.

## I) Assumptions & Judgment Calls
- Assumption: Incremental fixes are preferred over broad protocol rewrite in one run.
- Judgment call: focus on high-impact lobby/network usability fixes with small reversible changes.
- Rejected alternative: full client contract rewrite to Rust parity in this session (too risky for single delta).
