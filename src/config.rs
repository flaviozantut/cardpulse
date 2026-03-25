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
    /// Comma-separated list of allowed CORS origins (`CORS_ALLOWED_ORIGINS`).
    ///
    /// Defaults to `http://localhost:3000` for local development.
    pub cors_allowed_origins: Vec<String>,
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
            cors_allowed_origins: std::env::var("CORS_ALLOWED_ORIGINS")
                .unwrap_or_else(|_| "http://localhost:3000".to_string())
                .split(',')
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
                .collect(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_cors_origins_splits_comma_separated_values() {
        let input = "https://app.example.com, https://staging.example.com";
        let origins: Vec<String> = input
            .split(',')
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect();

        assert_eq!(origins.len(), 2);
        assert_eq!(origins[0], "https://app.example.com");
        assert_eq!(origins[1], "https://staging.example.com");
    }

    #[test]
    fn test_parse_cors_origins_handles_single_value() {
        let input = "https://app.example.com";
        let origins: Vec<String> = input
            .split(',')
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect();

        assert_eq!(origins.len(), 1);
        assert_eq!(origins[0], "https://app.example.com");
    }

    #[test]
    fn test_parse_cors_origins_filters_empty_entries() {
        let input = "https://app.example.com,,, ";
        let origins: Vec<String> = input
            .split(',')
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect();

        assert_eq!(origins.len(), 1);
        assert_eq!(origins[0], "https://app.example.com");
    }
}
