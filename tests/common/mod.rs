//! Shared test helpers for integration tests.

use axum_test::TestServer;
use cardpulse_api::{router::build_router, state::AppState};
use sqlx::PgPool;

/// Returns a [`PgPool`] connected to the test database with all migrations run.
///
/// Reads `DATABASE_URL_TEST` from the environment (set in `.env`).
pub async fn test_pool() -> PgPool {
    dotenvy::dotenv().ok();
    let url = std::env::var("DATABASE_URL_TEST")
        .expect("DATABASE_URL_TEST must be set for integration tests");
    cardpulse_api::db::init_pool(&url)
        .await
        .expect("failed to connect to test database")
}

/// Spawns an in-process test server backed by the given pool.
pub async fn spawn_test_app_with_state(pool: PgPool) -> TestServer {
    let state = AppState::new(pool);
    let app = build_router(state);
    TestServer::new(app).expect("failed to create test server")
}

/// Spawns an in-process test server connected to the test database.
pub async fn spawn_test_app() -> TestServer {
    let pool = test_pool().await;
    spawn_test_app_with_state(pool).await
}
