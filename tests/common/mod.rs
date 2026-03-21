//! Shared test helpers for integration tests.

use axum::Router;
use axum_test::TestServer;
use cardpulse_api::router::build_router;
use sqlx::PgPool;

/// Spawns an in-process test server with the full application router.
///
/// Uses `axum-test` so no real port binding is required.
pub fn spawn_test_app() -> TestServer {
    let app: Router = build_router();
    TestServer::new(app).expect("failed to create test server")
}

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
