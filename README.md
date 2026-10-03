# BattleGrid

[![Rust](https://img.shields.io/badge/Rust-dea584?style=flat-square&logo=rust&logoColor=white)](#) [![TypeScript](https://img.shields.io/badge/TypeScript-3178c6?style=flat-square&logo=typescript&logoColor=white)](#) [![License](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](#)

> No turn advantage, no peeking at opponent moves — both players plan simultaneously, then every order resolves in a single explosive tick

BattleGrid is a real-time multiplayer hex strategy game where both players plan simultaneously. Two players issue orders to all their units during a timed planning phase. When both players submit or the timer expires, movement resolves first, then abilities, then simultaneous combat. The game engine is Rust compiled to WASM — shared simulation, instant pathfinding previews, and a shared core between server and browser.

## Features

- **Simultaneous resolution** — both players plan in secret; orders resolve in one tick with movement and abilities before simultaneous combat
- **6 unit classes** — Scout (fast), Soldier (fortress specialist), Archer (3-range, melee penalty), Knight (charge bonus), Healer (pre-combat heal), Siege (destroys terrain)
- **Procedural maps** — noise-based hex terrain with rotational symmetry; five presets in the core API, with the server using the default configuration and optional custom seeds
- **WASM game core** — pathfinding, line-of-sight raycasting, and combat preview run in the browser via WASM for instant feedback without server round-trips
- **Terrain-aware visibility** — mountains and outside forests block sight, while fortress and plains lanes stay readable
- **Replay recording** — initial state and turn orders are stored; server recordings currently capture the initial state before deployment, so they cannot reconstruct deployed matches
- **Connection retry** — the client retries dropped WebSockets; active-game disconnects are tracked, but room rejoin and state restoration are not implemented

## Quick Start

### Prerequisites

- Rust stable toolchain (via [rustup](https://rustup.rs)) with `wasm-pack`
  ```bash
  cargo install wasm-pack
  ```
- Node.js 24 with pnpm 9 (the versions used by CI)
- Rust `rustfmt` and `clippy` components and the `wasm32-unknown-unknown` target
  (`rustup component add rustfmt clippy`; `rustup target add wasm32-unknown-unknown`)
- Docker + Docker Compose (optional, for zero-install server)

### Installation

```bash
git clone https://github.com/saagpatel/BattleGrid.git
cd BattleGrid
./setup.sh
```

### Verification

Run commands from the repository root. `./setup.sh` may install Rust, wasm-pack,
global pnpm and Chromium; for an already provisioned toolchain, install the
locked client dependencies explicitly:

```bash
./scripts/pnpm-safe.sh --prefix client install --frozen-lockfile
make build-wasm
```

The WASM build generates ignored `client/src/wasm/pkg`; the app requires it at
runtime and shows an error if it cannot load. The main CI workflow installs
wasm-pack unpinned; the quality-gates workflow and the Dockerfile pin 0.13.1.
Choose the smallest lane for the
change:

```bash
# Focused Rust test (replace the filter with the affected test name)
./scripts/cargo-safe.sh test -p battleground-core test_name
# Focused client test (replace the path with the affected test file)
./scripts/client-safe.sh vitest run src/path/to.test.ts
# Broader Rust workspace and client unit tests
make test
# Format, lint, typecheck and build; all canonical gates are listed here
cat .codex/verify.commands
```

`make verify` runs that [canonical manifest](.codex/verify.commands), including
Rust fmt/clippy/tests, client typecheck/lint/tests/build and Playwright. It writes
`.codex/verify.last.json` (override with `VERIFY_RESULTS_FILE`). This is the
broader integration lane, not needed for a pure documentation edit.

For changed UI, browser behavior or Rust/WASM interaction, install Chromium with
`./scripts/client-safe.sh playwright install chromium` and run `make smoke`.
On Linux, browser system libraries must also be installed (CI uses
`playwright install --with-deps chromium`). Playwright starts `make dev` on
localhost ports 3001/5173 and can reuse an existing server; use an isolated
checkout and ensure those ports are free so the result exercises your source.
`make smoke-docker` additionally requires Docker/Compose and creates containers.
Do not use cleanup targets as verification commands.

### Usage

```bash
# Start server + client together
make dev
# Server: http://localhost:3001
# Client: http://localhost:5173

# Run all tests (Rust workspace + client)
make test

# Browser smoke test (Playwright)
make smoke

# Docker (zero local Rust install)
docker-compose up
```

Open two browser tabs. Create a room in one, join with the room code in the other. Ready up and play.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Game engine | Rust (`battleground-core`, `battleground-wasm`) |
| Server | Axum (async Rust, `battleground-server`) |
| Client | React 19, TypeScript, Tailwind CSS 4 |
| Rendering | HTML5 Canvas 2D |
| Wire protocol | Bincode (binary, versioned) over WebSocket |
| State | Zustand |
| Build | Vite + Makefile |
| Tests | cargo test (Rust) + Vitest (TS) + Playwright |

## Architecture

The Rust monorepo has three crates: `battleground-core` (pure game logic, no I/O), `battleground-wasm` (thin WASM bindings over core), and `battleground-server` (Axum WebSocket server). The browser client loads the WASM module at startup and calls it synchronously for pathfinding previews and combat previews — no server round-trip needed for local feedback. When a player submits orders, the server collects both players' orders, runs the authoritative core simulation, and broadcasts the resolved state. Bincode over WebSocket keeps payloads small and deserialization fast.

## Current State

In maintenance. The core game — 6 unit classes, procedural hex
maps, simultaneous resolution, WASM-side pathfinding/combat previews,
replay recording, and connection retry — is implemented across the `battleground-core`,
`battleground-wasm`, and `battleground-server` crates plus the React client, with
`cargo test` + Vitest + Playwright coverage, Docker packaging, an empty OpenAPI placeholder, and full
CI. Recent work has been dependency and CI hygiene (a `rand` API migration, a
`tokio-tungstenite` bump, Dependabot group updates) rather than new gameplay.

## Known Risks

- **Shared-core version skew** — the browser runs `battleground-wasm` for pathfinding and
  combat previews while the server resolves orders with the same `battleground-core`
  authoritatively. If the WASM build drifts from the server's core version, client
  previews diverge from the resolved state.
- **Determinism is load-bearing** — units and orders use `BTreeMap`, but the grid and
  pathfinding use `HashMap`; fortress enumeration iterates the grid during simulation.
  Identical output ordering is not guaranteed by ordered units and orders alone.
- **Versioned binary wire protocol** — Bincode over WebSocket is compact but
  schema-sensitive; mismatched protocol-version messages are rejected with an error.
- **Server-side room lifetime** — empty waiting rooms are removed, but active-game
  disconnects retain players and rooms without a wired grace-period expiry or state restoration.

## Next Recommended Move

Confirm the recent `rand` and `tokio-tungstenite` migrations did not perturb the
deterministic simulation: run `make test` (Rust workspace + client) and `make smoke`
(Playwright), and spot-check a replay. Then settle disposition — if the game is considered
shipped, cut a tagged release from `main`; if development resumes, the next gameplay
milestone (e.g. spectating) is the natural pickup.

## License

MIT
