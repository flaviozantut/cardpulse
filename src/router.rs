//! Application router assembly.
//!
//! Builds the axum [`Router`] with all routes mounted.
//! Keeping routing separate from `main.rs` allows integration tests
//! to instantiate the full router without binding a real port.

use std::time::Duration;

use axum::Router;

use crate::auth::handler::{login, refresh, register};
use crate::handlers::cards::{create_card, delete_card, list_cards, update_card};
use crate::handlers::health::health_check;
use crate::handlers::me::me;
use crate::handlers::test_blob::{create_blob, get_blob};
use crate::handlers::transactions::{
    create_transaction, delete_transaction, list_transactions, update_transaction,
};
use crate::middleware::rate_limit::{rate_limit, RateLimiter};
use crate::state::AppState;

/// Builds and returns the complete application router with shared state.
pub fn build_router(state: AppState) -> Router {
    let register_limiter = RateLimiter::new(5, Duration::from_secs(60));
    let login_limiter = RateLimiter::new(10, Duration::from_secs(60));

    Router::new()
        .route("/health", axum::routing::get(health_check))
        .route(
            "/auth/register",
            axum::routing::post(register).layer(axum::middleware::from_fn_with_state(
                register_limiter,
                rate_limit,
            )),
        )
        .route(
            "/auth/login",
            axum::routing::post(login).layer(axum::middleware::from_fn_with_state(
                login_limiter,
                rate_limit,
            )),
        )
        .route("/auth/refresh", axum::routing::post(refresh))
        .route("/v1/me", axum::routing::get(me))
        .route(
            "/v1/cards",
            axum::routing::post(create_card).get(list_cards),
        )
        .route(
            "/v1/cards/:id",
            axum::routing::put(update_card).delete(delete_card),
        )
        .route(
            "/v1/transactions",
            axum::routing::post(create_transaction).get(list_transactions),
        )
        .route(
            "/v1/transactions/:id",
            axum::routing::put(update_transaction).delete(delete_transaction),
        )
        .route("/v1/test", axum::routing::post(create_blob))
        .route("/v1/test/:id", axum::routing::get(get_blob))
        .with_state(state)
}
