# BattleGrid — Portfolio Disposition

**Status:** Active — working Rust/WASM + TypeScript + Axum multiplayer
hex strategy game on `origin/main`, Phases 7 through 10 + final
polish shipped. No release-readiness doc yet. Disposition is **not**
Release Frozen; the gate is "decide the distribution model for a
multiplayer browser game with server component."

> Disposition uses strict `origin/main` verification.

---

## Verification posture

This repo has both `origin` (`saagpatel/BattleGrid`) and
`legacy-origin` (`saagar210/BattleGrid`) remotes. Local clone's
`main` branch was tracking `legacy-origin/main` (the FreeLanceInvoice
/ PersonalKBDrafter trap) — fixed during this disposition pass.

Specifically verified on `origin/main` (the canonical remote):
- Tip: `eb9f268` chore: add initial CHANGELOG
- Cited substantive commits confirmed via `git merge-base
  --is-ancestor`:
  - `30a262c` feat: Complete replay viewer and help system (Final polish) ✓ on origin/main
  - `eb9f268` ✓ on origin/main
- Substantive feature commits on `origin/main`:
  - `417cc04` fix(game): stabilize wasm bootstrap and turn sync
  - `30a262c` feat: Complete replay viewer and help system (Final polish)
  - `0d2eecf` feat: Add keyboard shortcuts and visual polish (Phase 7 complete)
  - `e28416c` feat: Implement end-to-end replay and toast notifications (Phase 5 & 7 partial)
  - `28ca362` feat: Implement timer enforcement, static file serving, and deployment hex canvas
  - `f3f90b1` feat: Phases 8-10 — map gen enhancement, testing, CI, Docker
  - `03dec77` feat: Phase 7 — WASM integration, combat preview, game over screen, minimap viewport
- Tree on `origin/main`: `client/`, `crates/`, `Dockerfile`,
  `docker-compose.yml`, `docs/adr/` (template only), `Cargo.toml`,
  `Cargo.lock`
- Default branch: `main`

---

## Potential legacy-origin orphan

`legacy-origin/main` has one commit that is **not** on `origin/main`:
- `2a34224` feat(devx): stabilize local readiness and smoke gates (#5)

This is a devx/readiness commit, not a gameplay feature. Operator
decision: either cherry-pick to `origin/main` if the readiness work
is still valuable, or accept the loss. Lower severity than the
FreeLanceInvoice 700-line Stripe orphan from a prior round, but
worth a one-time review.

---

## Current state in one paragraph

BattleGrid is a real-time multiplayer hex strategy game with
simultaneous-resolution mechanics. Both players plan in secret
during a timed phase; when the timer expires, all orders resolve
in parallel — no turn-order advantage. Entire game engine is Rust
compiled to WASM with deterministic simulation (BTreeMap throughout,
no HashMap iteration in game logic), enabling instant pathfinding
preview in the browser and deterministic replay. Axum server with
reconnect support (drops can rejoin mid-game, server replays state).
6 unit classes, noise-based hex terrain with rotational symmetry,
4 procedural map presets + custom seeds, replay viewer, help system.
Dockerized for deployment.

For full detail see `README.md`.

---

## Why "Active" — and why distribution model is the gate

The signing-frozen cluster (10 repos) all distribute via signed
desktop binaries. BattleGrid is fundamentally different:

- **Browser frontend + server backend** — distribution means
  hosting, not signing
- **Multiplayer** — needs a running matchmaking server; not a
  download-and-run product
- **WASM core** — no Apple/Windows signing relevance to the client
- **Dockerfile present** — clearly intended for server deployment

The next move is operator decision-time about **how to host this**,
not about wiring Apple Developer credentials.

---

## Possible next moves (operator choice)

### Option 1 — Self-host on personal infra

Deploy via the existing Dockerfile + docker-compose. Hetzner /
Fly.io / Railway / personal VPS. Write a minimal hosting doc.

Estimated effort: ~3 hours including domain + TLS setup.

### Option 2 — itch.io browser game embed

itch.io supports hosted browser games via HTML5 iframe. Could work
if the matchmaking server is hosted separately and the client
points at it.

Estimated effort: ~2 hours (server hosted elsewhere) + itch.io page.

### Option 3 — Open-source as a self-host project

Polish `README.md` deployment section, no operator-hosted instance.
Audience clones and runs themselves via `docker-compose up`.

Estimated effort: ~30 minutes (docs polish only).

### Option 4 — Mark as personal project, scaffold-stop

Decide multiplayer game hosting is too operationally expensive for
the audience size. Move to `Cold Storage`.

Estimated effort: ~15 minutes.

---

## Recommendation (informational)

**Option 3 (self-host project) is probably right** for BattleGrid
specifically:

- Multiplayer game hosting has real ops cost (server uptime,
  matchmaking, abuse handling) that doesn't amortize across the
  portfolio
- The product is technically interesting (deterministic Rust/WASM
  sim, simultaneous resolution) — that's the audience hook
- "Self-hostable strategy game with deterministic replay" is a
  cleaner story than "hosted multiplayer service" without
  user-acquisition strategy

Option 1 is correct if the operator has spare hosting capacity and
wants to demo a live instance. Option 4 only if discovery shows the
mechanic doesn't survive contact with players.

---

## Portfolio operating system instructions

| Aspect | Posture |
|---|---|
| Portfolio status | `Active` |
| Distribution model | **Different from signing cluster** — server-hosted multiplayer, not signed binaries |
| Next packet shape | "Decide between Option 1 / 2 / 3 / 4" |
| Review cadence | Resume normal cadence — this row needs decision-time |
| Resurface conditions | Once the operator picks an option, surface a packet for the work each option implies |
| Do **not** auto-add to signing cluster | Signing is irrelevant — browser + server architecture |
| Legacy-origin orphan note | `legacy-origin/main:2a34224` (devx/readiness) is not on `origin/main`. Lower-stakes than FreeLanceInvoice's Stripe orphan. Operator should review before considering it lost. |

---

## Reactivation procedure (for the next code session)

1. **Verify local clone tracking.** This repo had the legacy-origin
   trap. Run `git branch -vv` — confirm `main` tracks `origin/main`,
   not `legacy-origin/main`. (Fixed during this disposition pass.)
2. Delete stale `codex/*` branches that pre-date the Final polish
   commit (`30a262c`).
3. Re-run `cargo build && pnpm install` to confirm toolchains.
4. Verify `docker-compose up` boots the server cleanly.
5. Review `legacy-origin/main:2a34224` and decide cherry-pick or
   accept-loss.
6. If picking Option 1 or 2, plan hosting before writing more code.

---

## Last known reference

| Field | Value |
|---|---|
| `origin/main` tip | `eb9f268` chore: add initial CHANGELOG |
| Last substantive commit on `origin/main` | `30a262c` feat: Complete replay viewer and help system (Final polish) |
| Default branch | `main` |
| Build system | Cargo workspace (Rust→WASM) + Axum server + TypeScript client + Docker |
| Phases completed on `origin/main` | 7 (WASM + combat preview), 8-10 (map gen, testing, CI, Docker), final polish |
| Release readiness doc | **None** — and probably not what this product needs |
| Migration state | `legacy-origin` present; local tracking was wrong, fixed |
| Legacy-origin orphan | `2a34224` (devx/readiness) — lower-stakes orphan |
| Distribution shape | Browser client + Axum server (Dockerized), NOT signed desktop binary |
