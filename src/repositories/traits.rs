//! Repository traits for dependency inversion.
//!
//! Handlers depend on these traits, not on concrete sqlx implementations,
//! making them trivial to test with mock repositories.

use async_trait::async_trait;
use uuid::Uuid;

use crate::{
    error::AppError,
    models::{card::Card, user::User},
};

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

/// Data needed to create a new card row.
pub struct NewCard {
    pub user_id: Uuid,
    pub encrypted_data: Vec<u8>,
    pub iv: Vec<u8>,
    pub auth_tag: Vec<u8>,
}

/// Data needed to update an existing card row.
pub struct UpdateCard {
    pub encrypted_data: Vec<u8>,
    pub iv: Vec<u8>,
    pub auth_tag: Vec<u8>,
}

/// Persistence operations for the `cards` table.
#[async_trait]
pub trait CardRepository: Send + Sync {
    /// Inserts a new card and returns the full [`Card`].
    ///
    /// # Errors
    /// - [`AppError::InternalError`] on database error.
    async fn create(&self, new_card: NewCard) -> Result<Card, AppError>;

    /// Fetches a single card by its ID.
    ///
    /// # Errors
    /// - [`AppError::NotFound`] if no card with that ID exists.
    /// - [`AppError::InternalError`] on database error.
    async fn find_by_id(&self, id: Uuid) -> Result<Card, AppError>;

    /// Lists all cards belonging to a user.
    ///
    /// # Errors
    /// - [`AppError::InternalError`] on database error.
    async fn find_all_by_user_id(&self, user_id: Uuid) -> Result<Vec<Card>, AppError>;

    /// Updates a card's encrypted data and returns the updated [`Card`].
    ///
    /// # Errors
    /// - [`AppError::NotFound`] if no card with that ID exists.
    /// - [`AppError::InternalError`] on database error.
    async fn update(&self, id: Uuid, data: UpdateCard) -> Result<Card, AppError>;

    /// Deletes a card by its ID.
    ///
    /// # Errors
    /// - [`AppError::NotFound`] if no card with that ID exists.
    /// - [`AppError::InternalError`] on database error.
    async fn delete(&self, id: Uuid) -> Result<(), AppError>;
}
