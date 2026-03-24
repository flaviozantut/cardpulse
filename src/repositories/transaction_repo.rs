//! PostgreSQL implementation of [`TransactionRepository`].

use async_trait::async_trait;
use sqlx::PgPool;
use uuid::Uuid;

use crate::{
    error::AppError,
    models::transaction::Transaction,
    repositories::traits::{
        NewTransaction, TransactionFilters, TransactionRepository, UpdateTransaction,
    },
};

/// Postgres-backed transaction repository.
pub struct PgTransactionRepository {
    pool: PgPool,
}

impl PgTransactionRepository {
    /// Creates a new repository using the given connection pool.
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }
}

const SELECT_COLS: &str =
    "id, user_id, card_id, encrypted_data, iv, auth_tag, timestamp_bucket, created_at";

#[async_trait]
impl TransactionRepository for PgTransactionRepository {
    async fn create(&self, new_tx: NewTransaction) -> Result<Transaction, AppError> {
        let query = format!(
            "INSERT INTO transactions (user_id, card_id, encrypted_data, iv, auth_tag, timestamp_bucket)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING {SELECT_COLS}"
        );
        sqlx::query_as::<_, Transaction>(&query)
            .bind(new_tx.user_id)
            .bind(new_tx.card_id)
            .bind(&new_tx.encrypted_data)
            .bind(&new_tx.iv)
            .bind(&new_tx.auth_tag)
            .bind(&new_tx.timestamp_bucket)
            .fetch_one(&self.pool)
            .await
            .map_err(|e| AppError::InternalError(e.to_string()))
    }

    async fn find_by_id(&self, id: Uuid) -> Result<Transaction, AppError> {
        let query = format!("SELECT {SELECT_COLS} FROM transactions WHERE id = $1");
        sqlx::query_as::<_, Transaction>(&query)
            .bind(id)
            .fetch_optional(&self.pool)
            .await
            .map_err(|e| AppError::InternalError(e.to_string()))?
            .ok_or_else(|| AppError::NotFound(format!("transaction '{id}' not found")))
    }

    async fn find_all_by_user_id(
        &self,
        user_id: Uuid,
        filters: TransactionFilters,
    ) -> Result<Vec<Transaction>, AppError> {
        let mut sql = format!("SELECT {SELECT_COLS} FROM transactions WHERE user_id = $1");
        let mut param_index = 2u32;

        if filters.card_id.is_some() {
            sql.push_str(&format!(" AND card_id = ${param_index}"));
            param_index += 1;
        }
        if filters.timestamp_bucket.is_some() {
            sql.push_str(&format!(" AND timestamp_bucket = ${param_index}"));
        }
        sql.push_str(" ORDER BY created_at DESC");

        let mut query = sqlx::query_as::<_, Transaction>(&sql).bind(user_id);

        if let Some(card_id) = filters.card_id {
            query = query.bind(card_id);
        }
        if let Some(bucket) = filters.timestamp_bucket {
            query = query.bind(bucket);
        }

        query
            .fetch_all(&self.pool)
            .await
            .map_err(|e| AppError::InternalError(e.to_string()))
    }

    async fn update(&self, id: Uuid, data: UpdateTransaction) -> Result<Transaction, AppError> {
        let query = format!(
            "UPDATE transactions
             SET encrypted_data = $1, iv = $2, auth_tag = $3, timestamp_bucket = $4
             WHERE id = $5
             RETURNING {SELECT_COLS}"
        );
        sqlx::query_as::<_, Transaction>(&query)
            .bind(&data.encrypted_data)
            .bind(&data.iv)
            .bind(&data.auth_tag)
            .bind(&data.timestamp_bucket)
            .bind(id)
            .fetch_optional(&self.pool)
            .await
            .map_err(|e| AppError::InternalError(e.to_string()))?
            .ok_or_else(|| AppError::NotFound(format!("transaction '{id}' not found")))
    }

    async fn delete(&self, id: Uuid) -> Result<(), AppError> {
        let result = sqlx::query("DELETE FROM transactions WHERE id = $1")
            .bind(id)
            .execute(&self.pool)
            .await
            .map_err(|e| AppError::InternalError(e.to_string()))?;

        if result.rows_affected() == 0 {
            return Err(AppError::NotFound(format!("transaction '{id}' not found")));
        }

        Ok(())
    }
}
