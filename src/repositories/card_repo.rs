//! PostgreSQL implementation of [`CardRepository`].

use async_trait::async_trait;
use sqlx::PgPool;
use uuid::Uuid;

use crate::{
    error::AppError,
    models::card::Card,
    repositories::traits::{CardRepository, NewCard, UpdateCard},
};

/// Postgres-backed card repository.
pub struct PgCardRepository {
    pool: PgPool,
}

impl PgCardRepository {
    /// Creates a new repository using the given connection pool.
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }
}

#[async_trait]
impl CardRepository for PgCardRepository {
    async fn create(&self, new_card: NewCard) -> Result<Card, AppError> {
        sqlx::query_as::<_, Card>(
            "INSERT INTO cards (user_id, encrypted_data, iv, auth_tag)
             VALUES ($1, $2, $3, $4)
             RETURNING id, user_id, encrypted_data, iv, auth_tag, created_at",
        )
        .bind(new_card.user_id)
        .bind(&new_card.encrypted_data)
        .bind(&new_card.iv)
        .bind(&new_card.auth_tag)
        .fetch_one(&self.pool)
        .await
        .map_err(|e| AppError::InternalError(e.to_string()))
    }

    async fn find_by_id(&self, id: Uuid) -> Result<Card, AppError> {
        sqlx::query_as::<_, Card>(
            "SELECT id, user_id, encrypted_data, iv, auth_tag, created_at
             FROM cards WHERE id = $1",
        )
        .bind(id)
        .fetch_optional(&self.pool)
        .await
        .map_err(|e| AppError::InternalError(e.to_string()))?
        .ok_or_else(|| AppError::NotFound(format!("card '{id}' not found")))
    }

    async fn find_all_by_user_id(&self, user_id: Uuid) -> Result<Vec<Card>, AppError> {
        sqlx::query_as::<_, Card>(
            "SELECT id, user_id, encrypted_data, iv, auth_tag, created_at
             FROM cards WHERE user_id = $1
             ORDER BY created_at DESC",
        )
        .bind(user_id)
        .fetch_all(&self.pool)
        .await
        .map_err(|e| AppError::InternalError(e.to_string()))
    }

    async fn update(&self, id: Uuid, data: UpdateCard) -> Result<Card, AppError> {
        sqlx::query_as::<_, Card>(
            "UPDATE cards
             SET encrypted_data = $1, iv = $2, auth_tag = $3
             WHERE id = $4
             RETURNING id, user_id, encrypted_data, iv, auth_tag, created_at",
        )
        .bind(&data.encrypted_data)
        .bind(&data.iv)
        .bind(&data.auth_tag)
        .bind(id)
        .fetch_optional(&self.pool)
        .await
        .map_err(|e| AppError::InternalError(e.to_string()))?
        .ok_or_else(|| AppError::NotFound(format!("card '{id}' not found")))
    }

    async fn delete(&self, id: Uuid) -> Result<(), AppError> {
        let result = sqlx::query("DELETE FROM cards WHERE id = $1")
            .bind(id)
            .execute(&self.pool)
            .await
            .map_err(|e| AppError::InternalError(e.to_string()))?;

        if result.rows_affected() == 0 {
            return Err(AppError::NotFound(format!("card '{id}' not found")));
        }

        Ok(())
    }
}
