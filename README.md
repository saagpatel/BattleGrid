# BattleGrid

**A real-time multiplayer hex strategy game where every decision happens simultaneously.**

Two players. One hex battlefield. Scouts probing the fog, Knights charging through the lines, Archers raining fire from the treeline, Healers keeping the frontline alive, and Siege engines reducing fortresses to rubble — all resolving at the same instant. No turn advantage. No peeking at your opponent's moves. Pure strategy.

---

## How It Works

Both players issue orders to all their units during a timed planning phase. When the timer runs out, every order resolves **simultaneously** — movement, abilities, then combat. Watch the battlefield erupt as your carefully-laid plans collide with your opponent's.

**Win by:**
- Eliminating all enemy units, or
- Holding every fortress on the map for 3 consecutive turns

## The Battlefield

Hex grids with procedurally generated terrain using noise-based algorithms and rotational symmetry for fairness:

| Terrain | Effect |
|---------|--------|
| Plains | Standard movement (cost 1) |
| Forest | Slow movement (cost 2), +1 defense, blocks line of sight |
| Mountain | Impassable wall, blocks LOS |
| Water | Impassable |
| Fortress | Capture objective, +2 defense for Soldiers |

**Map presets:** Open Plains, Dense Forest, Mountain Pass, Island Chain — or plug in a custom seed.

## The Army

Each player deploys **10 units** from 6 classes:

| Unit | HP | ATK | DEF | Move | Range | Ability |
|------|----|-----|-----|------|-------|---------|
| Scout | 2 | 1 | 0 | 4 | 1 | Reveal (extends vision) |
| Soldier | 4 | 3 | 2 | 2 | 1 | Fortress specialist (+2 DEF) |
| Archer | 3 | 3 | 1 | 2 | 3 | Ranged fire (no counter at range) |
| Knight | 5 | 4 | 1 | 3 | 1 | Charge (+2 ATK after 2+ hex move) |
| Healer | 3 | 1 | 1 | 2 | 1 | Heal (restores 2 HP to adjacent ally) |
| Siege | 4 | 5 | 0 | 1 | 2 | Demolish (destroys forest terrain) |

### Combos That Win Games

- **Siege + Archer:** Demolish a forest, open LOS for Archers to fire through the gap — in the same turn
- **Healer + Soldier:** Heal lands before combat damage, keeping your front line standing through hits that should kill them
- **Knight flank:** 3-hex movement + charge bonus lets Knights swing around and hit backline Archers for devastating damage
- **Scout screen:** Cheap, fast scouts reveal the fog so your Archers can find targets

## Tech Stack

The entire game engine is written in **Rust** for deterministic simulation, compiled to **WebAssembly** for the browser client. Zero RNG in combat. Same inputs always produce the same outputs — enabling replays for free.

```
Rust Monorepo                          Browser Client
 +-----------------------+              +-----------------------+
 | battleground-core     |              | React 19 + Vite       |
 | - Hex math            |    WASM      | - Canvas 2D renderer  |
 | - A* pathfinding      |◄────────────►| - Zustand stores      |
 | - LOS raycasting      |   Bridge     | - Tailwind CSS 4      |
 | - Combat simulation   |              | - Animation engine    |
 | - Map generation      |              |                       |
 +-----------------------+              +-----------------------+
 | battleground-server   |  WebSocket   |                       |
 | - Axum (async Rust)   |◄────────────►| Binary protocol       |
 | - Room management     |   (bincode)  | w/ version prefix     |
 | - Turn orchestration  |              |                       |
 | - Reconnect handling  |              |                       |
 +-----------------------+              +-----------------------+
```

### Why Rust + WASM?

- **Deterministic simulation:** `BTreeMap` everywhere, zero `HashMap` iteration in game logic. Same seed + same orders = identical outcome, guaranteed
- **Shared logic:** Pathfinding, LOS, and combat preview run in the browser via WASM — instant feedback, no server round-trips
- **Performance:** Full 40-unit simulation on a 19x19 grid in under 10ms
- **Type safety:** No `unwrap()` in production Rust. No `any` in TypeScript. `thiserror` for core, `anyhow` for server

## Quick Start

```bash
# One-command setup (installs Rust, wasm-pack, Node deps)
./setup.sh

# Start server + client
make dev
# Server: http://localhost:3001
# Client: http://localhost:5173
```

Open two browser tabs. Create a room in one, join with the room code in the other. Ready up and play.

### Docker (zero-install)

```bash
docker compose up
# Open http://localhost:8080
```

## Project Structure

```
BattleGrid/
  crates/
    battleground-core/     # Shared game logic (4,100+ lines, 114 tests)
    battleground-server/   # Axum WebSocket server (2,500+ lines, 70 tests)
    battleground-wasm/     # wasm-bindgen bridge (1,000+ lines, 34 tests)
  client/                  # React + Canvas renderer (5,200+ lines, 110 tests)
  .github/workflows/      # CI pipeline
  Dockerfile               # Multi-stage production build
  docker-compose.yml
  Makefile                 # dev, build, test, clean
  setup.sh                 # Bootstrap script
```

**328 tests** across the full stack. CI runs `cargo clippy --workspace -D warnings`, checks for zero `unwrap()` in production code, and verifies no `HashMap` in the simulation module.

## Game Design Highlights

The simultaneous resolution model creates deep strategic decisions:

- **No turn advantage** — both players plan blind during the same timer
- **Fog of war** — you see enemy positions from the *end of last turn*, not where they're going
- **Counter-attacks use pre-combat HP** — a unit surrounded by 3 attackers counters ALL of them, even if the combined damage would kill it. Damage pools and applies simultaneously
- **Movement evaluates against starting positions** — you can't "dodge" an attack by moving away; your opponent targeted where you *were*
- **Abilities resolve before combat** — this is intentional and creates powerful combos (Healer heals before damage lands, Siege clears forest before Archer LOS check)

## Development

```bash
make test          # Run all 328 tests
make build         # Build everything
make build-wasm    # Rebuild WASM bridge
make dev           # Start dev servers with hot reload
make clean         # Clean all build artifacts
```

## License

MIT

---

*Built with Rust, React, and an unreasonable amount of hex math.*
