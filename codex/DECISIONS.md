# Decisions

## 2026-02-10: Use incremental client-side fixes instead of full protocol rewrite
- Context: Server/WASM/client message contracts are materially divergent.
- Decision: Limit this run to small, high-impact client fixes (codec send path + lobby quick match/render fallback + tests).
- Why: Preserves repo stability and keeps changes reviewable while improving practical usability.
- Alternative rejected: Full protocol alignment in one session (high risk/scope for a single iteration).

## 2026-02-10: Do not address unrelated lint debt in this delta
- Context: Full client lint run reports pre-existing React lint violations in files outside the scoped changes.
- Decision: Record as known baseline limitation and keep delta focused on transport/lobby fixes.
- Why: Avoid mixing unrelated refactor work into a targeted stabilization patch.
- Follow-up: open dedicated lint remediation pass.
