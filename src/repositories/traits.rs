//! Repository traits for dependency inversion.
//!
//! Handlers depend on these traits, not on concrete sqlx implementations,
//! making them trivial to test with mock repositories.

use async_trait::async_trait;
use uuid::Uuid;

use crate::{error::AppError, models::user::User};

/// Data needed to create a new user row.
pub struct NewUser {
    pub email: String,
    pub password_hash: String,
    pub wrapped_dek: Vec<u8>,
    pub dek_salt: Vec<u8>,
    pub dek_params: String,
}

/// Persistence operations for the `users` table.
#[async_trait]
pub trait UserRepository: Send + Sync {
    /// Inserts a new user and returns the generated UUID.
    ///
    /// # Errors
    /// - [`AppError::Conflict`] if the email is already taken.
    /// - [`AppError::InternalError`] on any other database error.
    async fn create(&self, new_user: NewUser) -> Result<Uuid, AppError>;

    /// Fetches a user by email.
    ///
    /// # Errors
    /// - [`AppError::NotFound`] if no user with that email exists.
    /// - [`AppError::InternalError`] on database error.
    async fn find_by_email(&self, email: &str) -> Result<User, AppError>;
}
