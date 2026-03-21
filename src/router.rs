//! Application router assembly.
//!
//! Builds the axum [`Router`] with all routes mounted.
//! Keeping routing separate from `main.rs` allows integration tests
//! to instantiate the full router without binding a real port.

use axum::Router;

use crate::handlers::health::health_check;

/// Builds and returns the complete application router.
pub fn build_router() -> Router {
    Router::new().route("/health", axum::routing::get(health_check))
}
