//! PostgreSQL-backed implementation of [`UserConfigRepository`].

use async_trait::async_trait;
use sqlx::PgPool;
use uuid::Uuid;

use crate::{
    error::AppError,
    models::user_config::UserConfig,
    repositories::traits::{UpsertConfig, UserConfigRepository},
};

/// PostgreSQL implementation of [`UserConfigRepository`].
///
/// Stores one encrypted config blob per (user_id, config_type) using
/// an `ON CONFLICT DO UPDATE` upsert pattern.
pub struct PgUserConfigRepository {
    pool: PgPool,
}

impl PgUserConfigRepository {
    /// Creates a new repository backed by the given connection pool.
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }
}

const SELECT_COLS: &str = "id, user_id, config_type, encrypted_data, iv, auth_tag, updated_at";

#[async_trait]
impl UserConfigRepository for PgUserConfigRepository {
    async fn find(&self, user_id: Uuid, config_type: &str) -> Result<UserConfig, AppError> {
        let query = format!(
            "SELECT {SELECT_COLS} FROM user_config WHERE user_id = $1 AND config_type = $2"
        );
        sqlx::query_as::<_, UserConfig>(&query)
            .bind(user_id)
            .bind(config_type)
            .fetch_optional(&self.pool)
            .await
            .map_err(|e| AppError::InternalError(e.to_string()))?
            .ok_or_else(|| AppError::NotFound(format!("config '{config_type}' not found")))
    }

    async fn upsert(&self, data: UpsertConfig) -> Result<UserConfig, AppError> {
        let query = format!(
            "INSERT INTO user_config (user_id, config_type, encrypted_data, iv, auth_tag, updated_at)
             VALUES ($1, $2, $3, $4, $5, NOW())
             ON CONFLICT (user_id, config_type) DO UPDATE SET
                 encrypted_data = EXCLUDED.encrypted_data,
                 iv             = EXCLUDED.iv,
                 auth_tag       = EXCLUDED.auth_tag,
                 updated_at     = NOW()
             RETURNING {SELECT_COLS}"
        );
        sqlx::query_as::<_, UserConfig>(&query)
            .bind(data.user_id)
            .bind(&data.config_type)
            .bind(&data.encrypted_data)
            .bind(&data.iv)
            .bind(&data.auth_tag)
            .fetch_one(&self.pool)
            .await
            .map_err(|e| AppError::InternalError(e.to_string()))
    }
}
