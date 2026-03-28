//! PostgreSQL implementation of [`UserRepository`].

use async_trait::async_trait;
use sqlx::PgPool;
use uuid::Uuid;

use crate::{
    error::AppError,
    models::user::User,
    repositories::traits::{NewUser, UpdateDek, UserRepository},
};

/// Postgres-backed user repository.
pub struct PgUserRepository {
    pool: PgPool,
}

impl PgUserRepository {
    /// Creates a new repository using the given connection pool.
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }
}

#[async_trait]
impl UserRepository for PgUserRepository {
    async fn create(&self, new_user: NewUser) -> Result<Uuid, AppError> {
        let id = sqlx::query_scalar::<_, Uuid>(
            "INSERT INTO users (email, password_hash, wrapped_dek, dek_salt, dek_params)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING id",
        )
        .bind(&new_user.email)
        .bind(&new_user.password_hash)
        .bind(&new_user.wrapped_dek)
        .bind(&new_user.dek_salt)
        .bind(&new_user.dek_params)
        .fetch_one(&self.pool)
        .await
        .map_err(|e| match &e {
            sqlx::Error::Database(db) if db.constraint() == Some("users_email_key") => {
                AppError::Conflict(format!("email '{}' is already registered", new_user.email))
            }
            _ => AppError::InternalError(e.to_string()),
        })?;

        Ok(id)
    }

    async fn find_by_email(&self, email: &str) -> Result<User, AppError> {
        sqlx::query_as::<_, User>(
            "SELECT id, email, password_hash, wrapped_dek, dek_salt, dek_params, created_at
             FROM users WHERE email = $1",
        )
        .bind(email)
        .fetch_optional(&self.pool)
        .await
        .map_err(|e| AppError::InternalError(e.to_string()))?
        .ok_or_else(|| AppError::NotFound(format!("user with email '{email}' not found")))
    }

    async fn update_dek(&self, user_id: Uuid, data: UpdateDek) -> Result<(), AppError> {
        let rows = sqlx::query(
            "UPDATE users SET wrapped_dek = $1, dek_salt = $2, dek_params = $3 WHERE id = $4",
        )
        .bind(&data.wrapped_dek)
        .bind(&data.dek_salt)
        .bind(&data.dek_params)
        .bind(user_id)
        .execute(&self.pool)
        .await
        .map_err(|e| AppError::InternalError(e.to_string()))?
        .rows_affected();

        if rows == 0 {
            return Err(AppError::NotFound(format!("user '{user_id}' not found")));
        }

        Ok(())
    }
}
