.PHONY: setup build build-core build-wasm build-server build-client dev-server dev-client dev lean-dev test smoke smoke-docker verify clean clean-heavy clean-local prune

setup:
	@./setup.sh

build: build-core build-wasm build-server build-client

build-core:
	@./scripts/cargo-safe.sh build -p battleground-core

build-wasm:
	@./scripts/build-wasm-safe.sh

build-server:
	@./scripts/cargo-safe.sh build -p battleground-server

build-client:
	@./scripts/pnpm-safe.sh --prefix client install
	@./scripts/client-safe.sh tsc -b
	@./scripts/client-safe.sh vite build

dev-server:
	@./scripts/cargo-safe.sh run -p battleground-server

dev-client:
	@./scripts/client-safe.sh vite

dev:
	@./scripts/dev.sh

lean-dev:
	@./scripts/dev-lean.sh

test:
	@./scripts/cargo-safe.sh test --workspace
	@./scripts/client-safe.sh vitest run

smoke:
	@./scripts/client-safe.sh playwright test --config=playwright.config.ts

smoke-docker:
	@./scripts/smoke-docker.sh

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
