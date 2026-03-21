//! Shared application state injected into every handler via axum [`State`].

use sqlx::PgPool;

/// Holds resources shared across all request handlers.
///
/// Cloned cheaply for each handler call — all fields use `Arc` internally.
#[derive(Debug, Clone)]
pub struct AppState {
    /// Database connection pool.
    pub pool: PgPool,
}

impl AppState {
    /// Creates a new [`AppState`] wrapping the given pool.
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }
}
