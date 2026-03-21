//! Database connection pool setup and migration runner.
//!
//! Call [`init_pool`] at startup to get a [`PgPool`] with migrations already
//! applied. The pool is then stored in [`AppState`](crate::AppState) and
//! shared across all handlers via axum's `State` extractor.

use sqlx::postgres::PgPoolOptions;
use sqlx::PgPool;

/// Creates a [`PgPool`] connected to `database_url` and runs all pending
/// migrations from the `migrations/` directory.
///
/// # Errors
/// Returns an error if the connection cannot be established or any migration
/// fails to apply.
pub async fn init_pool(database_url: &str) -> Result<PgPool, sqlx::Error> {
    let pool = PgPoolOptions::new()
        .max_connections(10)
        .connect(database_url)
        .await?;

    sqlx::migrate!("./migrations").run(&pool).await?;

    Ok(pool)
}
