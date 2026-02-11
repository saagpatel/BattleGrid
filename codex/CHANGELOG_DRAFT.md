# Changelog Draft

## Theme: Client transport/lobby hardening
- Routed `connectionStore.send` through `encodeMessage` so outgoing WebSocket payloads use the shared codec abstraction.
- Extended client network message union with `QuickMatch` and relaxed room display fields to be optional for compatibility with minimal room payloads.
- Updated lobby behavior:
  - Quick Match now always sends explicit quick-match request when connected.
  - Room title now falls back to `roomId` when `name` is missing.
- Added regression tests:
  - `connectionStore.send` encoding behavior.
  - lobby quick-match send behavior.
  - lobby room-name fallback rendering.
