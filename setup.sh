#!/bin/bash
set -euo pipefail
echo "Setting up BattleGrid..."

# Rust via rustup
if ! command -v rustup &>/dev/null; then
    echo "Installing Rust via rustup..."
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
    source "$HOME/.cargo/env"
fi

rustup target add wasm32-unknown-unknown 2>/dev/null || true
command -v wasm-pack &>/dev/null || cargo install wasm-pack

# Node.js check
if ! command -v node &>/dev/null; then
    echo "ERROR: Install Node.js from https://nodejs.org"
    exit 1
fi

if ! command -v pnpm &>/dev/null; then
    echo "Installing pnpm..."
    npm install -g pnpm
fi

# Install client deps
pnpm --prefix client install

# Path-delimiter-safe client tool smoke checks
pnpm --prefix client exec tsc --version >/dev/null
pnpm --prefix client exec vite --version >/dev/null

# Build WASM
make build-wasm

echo "Done! Run 'make dev' to start."
