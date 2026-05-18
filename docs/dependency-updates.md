# Dependency Updates

## Rand 0.9 and WebAssembly

The `rand` 0.9 update pulls in `getrandom` 0.3 for seeded random-number
generation. Because `battleground-wasm` builds for
`wasm32-unknown-unknown`, the WASM target must opt into getrandom's
`wasm_js` backend through Cargo config and a direct feature-bearing
dependency.

Keep the seeded map-generation coverage in place when touching `rand`,
`getrandom`, or the terrain generation path. It verifies that seeded
generation remains deterministic and that different seeds still produce
different terrain layouts.
