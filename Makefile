.PHONY: setup build build-core build-wasm build-server build-client dev-server dev-client dev lean-dev test verify clean clean-heavy clean-local prune

setup:
	@./setup.sh

build: build-core build-wasm build-server build-client

build-core:
	cargo build -p battleground-core

build-wasm:
	@./scripts/build-wasm-safe.sh

build-server:
	cargo build -p battleground-server

build-client:
	pnpm --prefix client install
	pnpm --prefix client exec tsc -b
	pnpm --prefix client exec vite build

dev-server:
	cargo run -p battleground-server

dev-client:
	pnpm --prefix client exec vite

dev:
	@make build-wasm
	@cargo run -p battleground-server &
	@pnpm --prefix client exec vite &
	@echo "Server: http://localhost:3001  |  Client: http://localhost:5173"
	@wait

lean-dev:
	@./scripts/dev-lean.sh

test:
	cargo test --workspace
	pnpm --prefix client exec vitest run

verify:
	@./.codex/scripts/run_verify_commands.sh

clean:
	cargo clean
	rm -rf client/node_modules client/dist client/src/wasm/pkg

clean-heavy:
	@./scripts/clean-heavy.sh

clean-local:
	@./scripts/clean-local.sh

prune: clean
	rm -rf target
	rm -rf client/.vite client/.cache client/.turbo
	rm -rf client/node_modules/.vite client/node_modules/.cache
	find . -name ".DS_Store" -type f -delete
