//! Application configuration loaded from environment variables.
//!
//! Call [`AppConfig::from_env`] after `dotenvy::dotenv().ok()` to get a
//! validated config struct. Panics at startup if any required variable is
//! missing — fast-fail is preferable to a misconfigured running server.

/// All runtime configuration sourced from environment variables.
#[derive(Debug, Clone)]
pub struct AppConfig {
    /// Full PostgreSQL connection string (`DATABASE_URL`).
    pub database_url: String,
    /// Host address the HTTP server binds to (`HOST`, default `0.0.0.0`).
    pub host: String,
    /// TCP port the HTTP server listens on (`PORT`, default `8080`).
    pub port: u16,
}

impl AppConfig {
    /// Reads configuration from environment variables.
    ///
    /// # Panics
    /// Panics if `DATABASE_URL` is missing or if `PORT` cannot be parsed as
    /// a `u16`.
    pub fn from_env() -> Self {
        Self {
            database_url: std::env::var("DATABASE_URL").expect("DATABASE_URL must be set"),
            host: std::env::var("HOST").unwrap_or_else(|_| "0.0.0.0".to_string()),
            port: std::env::var("PORT")
                .unwrap_or_else(|_| "8080".to_string())
                .parse()
                .expect("PORT must be a valid u16"),
        }
    }
}
