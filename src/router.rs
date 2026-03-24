//! Application router assembly.
//!
//! Builds the axum [`Router`] with all routes mounted.
//! Keeping routing separate from `main.rs` allows integration tests
//! to instantiate the full router without binding a real port.

use axum::Router;

use crate::auth::handler::{login, refresh, register};
use crate::handlers::health::health_check;
use crate::handlers::me::me;
use crate::handlers::test_blob::{create_blob, get_blob};
use crate::state::AppState;

/// Builds and returns the complete application router with shared state.
pub fn build_router(state: AppState) -> Router {
    Router::new()
        .route("/health", axum::routing::get(health_check))
        .route("/auth/register", axum::routing::post(register))
        .route("/auth/login", axum::routing::post(login))
        .route("/auth/refresh", axum::routing::post(refresh))
        .route("/v1/me", axum::routing::get(me))
        .route("/v1/test", axum::routing::post(create_blob))
        .route("/v1/test/:id", axum::routing::get(get_blob))
        .with_state(state)
}
