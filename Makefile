.PHONY: setup build build-core build-wasm build-server build-client dev-server dev-client dev test clean

setup:
	@./setup.sh

build: build-core build-wasm build-server build-client

build-core:
	cargo build -p battleground-core

build-wasm:
	wasm-pack build crates/battleground-wasm --target web --out-dir ../../client/src/wasm/pkg

build-server:
	cargo build -p battleground-server

build-client:
	cd client && pnpm install && pnpm build

dev-server:
	cargo run -p battleground-server

dev-client:
	cd client && pnpm dev

dev:
	@make build-wasm
	@cargo run -p battleground-server &
	@cd client && pnpm dev &
	@echo "Server: http://localhost:3001  |  Client: http://localhost:5173"
	@wait

test:
	cargo test --workspace
	cd client && pnpm test

clean:
	cargo clean
	rm -rf client/node_modules client/dist client/src/wasm/pkg
