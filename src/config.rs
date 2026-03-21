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
    /// Secret key used to sign and verify JWTs (`JWT_SECRET`).
    pub jwt_secret: String,
    /// Token lifetime in hours (`JWT_EXPIRATION_HOURS`, default `24`).
    pub jwt_expiration_hours: u64,
}

impl AppConfig {
    /// Reads configuration from environment variables.
    ///
    /// # Panics
    /// Panics if `DATABASE_URL` or `JWT_SECRET` are missing, or if `PORT` /
    /// `JWT_EXPIRATION_HOURS` cannot be parsed as numbers.
    pub fn from_env() -> Self {
        Self {
            database_url: std::env::var("DATABASE_URL").expect("DATABASE_URL must be set"),
            host: std::env::var("HOST").unwrap_or_else(|_| "0.0.0.0".to_string()),
            port: std::env::var("PORT")
                .unwrap_or_else(|_| "8080".to_string())
                .parse()
                .expect("PORT must be a valid u16"),
            jwt_secret: std::env::var("JWT_SECRET").expect("JWT_SECRET must be set"),
            jwt_expiration_hours: std::env::var("JWT_EXPIRATION_HOURS")
                .unwrap_or_else(|_| "24".to_string())
                .parse()
                .expect("JWT_EXPIRATION_HOURS must be a valid u64"),
        }
    }
}
