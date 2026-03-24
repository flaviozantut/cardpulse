use cardpulse_api::{config::AppConfig, db::init_pool, router::build_router, state::AppState};
use dotenvy::dotenv;
use tokio::net::TcpListener;
use tokio::signal;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};

#[tokio::main]
async fn main() {
    // Load .env before reading any env vars
    dotenv().ok();

    // Initialise tracing with RUST_LOG filter
    tracing_subscriber::registry()
        .with(EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()))
        .with(tracing_subscriber::fmt::layer())
        .init();

    let config = AppConfig::from_env();
    let addr = format!("{}:{}", config.host, config.port);

    let pool = init_pool(&config.database_url)
        .await
        .expect("failed to connect to database");

    let state = AppState::new(pool, config.jwt_secret, config.jwt_expiration_hours);
    let app = build_router(state);

    let listener = TcpListener::bind(&addr)
        .await
        .expect("failed to bind address");
    tracing::info!("listening on {addr}");

    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await
        .expect("server error");
}

/// Waits for SIGTERM or Ctrl-C and resolves, triggering graceful shutdown.
async fn shutdown_signal() {
    let ctrl_c = async {
        signal::ctrl_c()
            .await
            .expect("failed to install Ctrl-C handler");
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
        _ = ctrl_c => {},
        _ = terminate => {},
    }

    tracing::info!("shutdown signal received");
}
