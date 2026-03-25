//! Shared application state injected into every handler via axum [`State`].

use sqlx::PgPool;

/// Holds resources shared across all request handlers.
///
/// Cloned cheaply for each handler call — all fields use `Arc` internally.
#[derive(Debug, Clone)]
pub struct AppState {
    /// Database connection pool.
    pub pool: PgPool,
    /// Secret used to sign and verify JWTs.
    pub jwt_secret: String,
    /// JWT lifetime in hours.
    pub jwt_expiration_hours: u64,
    /// Allowed CORS origins for the API.
    pub cors_allowed_origins: Vec<String>,
}

impl AppState {
    /// Creates a new [`AppState`].
    pub fn new(
        pool: PgPool,
        jwt_secret: String,
        jwt_expiration_hours: u64,
        cors_allowed_origins: Vec<String>,
    ) -> Self {
        Self {
            pool,
            jwt_secret,
            jwt_expiration_hours,
            cors_allowed_origins,
        }
    }
}
