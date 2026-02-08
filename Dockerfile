# Multi-stage build for BattleGrid

# Stage 1: Build Rust server and WASM
FROM rust:1.84-slim AS rust-builder

RUN apt-get update && apt-get install -y pkg-config libssl-dev curl && rm -rf /var/lib/apt/lists/*
RUN rustup target add wasm32-unknown-unknown
RUN cargo install wasm-pack

WORKDIR /app
COPY Cargo.toml Cargo.lock ./
COPY crates/ crates/

# Build server (release mode)
RUN cargo build -p battleground-server --release

# Build WASM
RUN mkdir -p client/src/wasm/pkg
RUN wasm-pack build crates/battleground-wasm --target web --out-dir ../../client/src/wasm/pkg

# Stage 2: Build client
FROM node:20-slim AS client-builder

RUN npm install -g pnpm@9

WORKDIR /app/client
COPY client/package.json client/pnpm-lock.yaml* ./

RUN pnpm install --frozen-lockfile || pnpm install

COPY client/ .
COPY --from=rust-builder /app/client/src/wasm/pkg/ src/wasm/pkg/

RUN pnpm build

# Stage 3: Production runtime
FROM debian:bookworm-slim AS runtime

RUN apt-get update && apt-get install -y ca-certificates && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy server binary
COPY --from=rust-builder /app/target/release/battleground-server /app/server

# Copy client build output
COPY --from=client-builder /app/client/dist/ /app/static/

ENV PORT=3001
ENV LOG_LEVEL=info
ENV MAX_ROOMS=100
ENV TURN_TIMER_MS=30000

EXPOSE 3001

CMD ["/app/server"]
