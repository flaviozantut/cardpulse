//! Application router assembly.
//!
//! Builds the axum [`Router`] with all routes mounted.
//! Keeping routing separate from `main.rs` allows integration tests
//! to instantiate the full router without binding a real port.

use std::time::Duration;

use axum::http::{header, Method};
use axum::Router;
use tower_http::cors::CorsLayer;

use crate::auth::handler::{login, refresh, register, rotate_key};
use crate::handlers::cards::{create_card, delete_card, list_cards, update_card};
use crate::handlers::health::health_check;
use crate::handlers::me::me;
use crate::handlers::sync::{export, import};
use crate::handlers::test_blob::{create_blob, get_blob};
use crate::handlers::transactions::{
    create_transaction, delete_transaction, list_transactions, update_transaction,
};
use crate::handlers::user_config::{get_config, put_config};
use crate::middleware::rate_limit::{rate_limit, RateLimiter};
use crate::state::AppState;

/// Builds a [`CorsLayer`] from the allowed origins list.
///
/// Allows GET, POST, PUT, DELETE methods and Authorization + Content-Type headers.
fn build_cors_layer(origins: &[String]) -> CorsLayer {
    let allowed_origins: Vec<_> = origins.iter().filter_map(|o| o.parse().ok()).collect();

    CorsLayer::new()
        .allow_origin(allowed_origins)
        .allow_methods([Method::GET, Method::POST, Method::PUT, Method::DELETE])
        .allow_headers([header::AUTHORIZATION, header::CONTENT_TYPE])
}

/// Builds and returns the complete application router with shared state.
pub fn build_router(state: AppState) -> Router {
    let cors = build_cors_layer(&state.cors_allowed_origins);
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
        .route("/v1/key/rotate", axum::routing::post(rotate_key))
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
        .route("/v1/sync/export", axum::routing::get(export))
        .route("/v1/sync/import", axum::routing::post(import))
        .route(
            "/v1/config/:type",
            axum::routing::get(get_config).put(put_config),
        )
        .route("/v1/test", axum::routing::post(create_blob))
        .route("/v1/test/:id", axum::routing::get(get_blob))
        .layer(cors)
        .with_state(state)
}
