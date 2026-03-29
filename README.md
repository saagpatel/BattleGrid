# BattleGrid

[![Rust](https://img.shields.io/badge/Rust-dea584?style=flat-square&logo=rust&logoColor=white)](#) [![TypeScript](https://img.shields.io/badge/TypeScript-3178c6?style=flat-square&logo=typescript&logoColor=white)](#) [![License](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](#)

> No turn advantage, no peeking at opponent moves — both players plan simultaneously, then every order resolves in a single explosive tick

BattleGrid is a real-time multiplayer hex strategy game where every decision happens simultaneously. Two players issue orders to all their units during a timed planning phase. When the timer expires, movement, abilities, and combat resolve in parallel. The entire game engine is Rust compiled to WASM — deterministic simulation, instant pathfinding previews, and a shared core between server and browser.

## Features

- **Simultaneous resolution** — both players plan in secret; all orders execute at the same instant with no turn-order advantage
- **6 unit classes** — Scout (fast, reveals fog), Soldier (fortress specialist), Archer (3-range, no counter), Knight (charge bonus), Healer (pre-combat heal), Siege (destroys terrain)
- **Procedural maps** — noise-based hex terrain with rotational symmetry; four presets or custom seeds
- **WASM game core** — pathfinding, line-of-sight raycasting, and combat preview run in the browser via WASM for instant feedback without server round-trips
- **Deterministic replay** — `BTreeMap` throughout, zero `HashMap` iteration in game logic; same inputs always produce identical output
- **Reconnect support** — drop and rejoin mid-game; the Axum server replays the full state to reconnecting clients

## Quick Start

### Prerequisites

- Rust stable toolchain (via [rustup](https://rustup.rs)) with `wasm-pack`
  ```bash
  cargo install wasm-pack
  ```
- Node.js 18+ with pnpm
- Docker + Docker Compose (optional, for zero-install server)

### Installation

```bash
git clone https://github.com/saagpatel/BattleGrid.git
cd BattleGrid
./setup.sh
```

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

## License

MIT
