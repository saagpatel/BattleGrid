# AGENTS.md

<!-- comm-contract:start -->

## Communication Contract

- Inherit global Codex communication and reporting rules from `/Users/d/.codex/AGENTS.override.md` and `/Users/d/.codex/policies/communication/BigPictureReportingV1.md`.
- Repo-specific instructions below add project constraints only; do not restate global voice or status-reporting rules here.
<!-- comm-contract:end -->

## Inherited Operating Rules

- Inherit global git, review/fix, testing, docs, skill-use, and reporting gates from `/Users/d/.codex/AGENTS.md` and active session instructions.
- Use `.codex/verify.commands` and `.codex/scripts/run_verify_commands.sh` as this repo-local verification authority when present.
- Keep the Codex feature policy and portfolio constraints below as repo-local overrides.

## Codex Feature Policy
- Required path (release-critical): stable commands and stable settings only.
- Experimental features (`multi_agent`, `rules`, beta shells) are optional and must not block release gates.
- Default project config lives in `.codex/config.toml` and keeps experimental features disabled for deterministic runs.
- Non-interactive automation should prefer `codex exec --output-schema .codex/schemas/implementation-status.schema.json`.
