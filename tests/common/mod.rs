//! Shared test helpers for integration tests.

use axum::Router;
use axum_test::TestServer;
use cardpulse_api::router::build_router;

/// Spawns an in-process test server with the full application router.
///
/// Uses `axum-test` so no real port binding is required.
pub fn spawn_test_app() -> TestServer {
    let app: Router = build_router();
    TestServer::new(app).expect("failed to create test server")
}
