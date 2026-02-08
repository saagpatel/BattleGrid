mod config;
mod error;
mod game;
mod lobby;
mod protocol;
mod reconnect;
mod room;
mod state;
mod timer;
mod ws;

use std::sync::Arc;

use axum::{routing::get, Router};
use tokio::net::TcpListener;
use tokio::signal;
use tower_http::cors::CorsLayer;
use tracing::info;

use config::ServerConfig;
use state::AppState;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let config = ServerConfig::from_env();

    // Initialize tracing
    let filter = tracing_subscriber::EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new(&config.log_level));

    tracing_subscriber::fmt().with_env_filter(filter).init();

    let addr = format!("0.0.0.0:{}", config.port);
    info!("BattleGrid server starting on {addr}");
    info!(
        "Config: max_rooms={}, turn_timer={}ms",
        config.max_rooms, config.turn_timer_ms
    );

    let state = Arc::new(AppState::new(config));

    let app = Router::new()
        .route("/ws", get(ws::ws_handler))
        .route("/health", get(health_check))
        .layer(CorsLayer::permissive())
        .with_state(state);

    let listener = TcpListener::bind(&addr).await?;
    info!("Listening on {addr}");

    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await?;

    info!("Server shut down gracefully");
    Ok(())
}

async fn health_check() -> &'static str {
    "ok"
}

async fn shutdown_signal() {
    let ctrl_c = async {
        signal::ctrl_c()
            .await
            .expect("failed to install Ctrl+C handler");
    };

    #[cfg(unix)]
    let terminate = async {
        signal::unix::signal(signal::unix::SignalKind::terminate())
            .expect("failed to install SIGTERM handler")
            .recv()
            .await;
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        () = ctrl_c => { info!("Received Ctrl+C, shutting down..."); }
        () = terminate => { info!("Received SIGTERM, shutting down..."); }
    }
}
