//! Repository traits for dependency inversion.
//!
//! Handlers depend on these traits, not on concrete sqlx implementations,
//! making them trivial to test with mock repositories.

use async_trait::async_trait;
use uuid::Uuid;

use crate::{
    error::AppError,
    models::{card::Card, transaction::Transaction, user::User, user_config::UserConfig},
};

/// Data needed to create a new user row.
pub struct NewUser {
    pub email: String,
    pub password_hash: String,
    pub wrapped_dek: Vec<u8>,
    pub dek_salt: Vec<u8>,
    pub dek_params: String,
}

/// Data needed to rotate a user's wrapped DEK.
pub struct UpdateDek {
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

    /// Replaces the wrapped DEK, salt, and params for the given user.
    ///
    /// The server never decrypts these values; it only stores them as-is
    /// so the client can retrieve and unwrap them on next login.
    ///
    /// # Errors
    /// - [`AppError::NotFound`] if no user with that ID exists.
    /// - [`AppError::InternalError`] on database error.
    async fn update_dek(&self, user_id: Uuid, data: UpdateDek) -> Result<(), AppError>;
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

/// Data needed to create a new transaction row.
pub struct NewTransaction {
    pub user_id: Uuid,
    pub card_id: Uuid,
    pub encrypted_data: Vec<u8>,
    pub iv: Vec<u8>,
    pub auth_tag: Vec<u8>,
    pub timestamp_bucket: String,
}

/// Data needed to update an existing transaction row.
pub struct UpdateTransaction {
    pub encrypted_data: Vec<u8>,
    pub iv: Vec<u8>,
    pub auth_tag: Vec<u8>,
    pub timestamp_bucket: String,
}

/// Optional filters for listing transactions.
pub struct TransactionFilters {
    pub card_id: Option<Uuid>,
    pub timestamp_bucket: Option<String>,
}

/// Persistence operations for the `transactions` table.
#[async_trait]
pub trait TransactionRepository: Send + Sync {
    /// Inserts a new transaction and returns the full [`Transaction`].
    ///
    /// # Errors
    /// - [`AppError::InternalError`] on database error.
    async fn create(&self, new_tx: NewTransaction) -> Result<Transaction, AppError>;

    /// Fetches a single transaction by its ID.
    ///
    /// # Errors
    /// - [`AppError::NotFound`] if no transaction with that ID exists.
    /// - [`AppError::InternalError`] on database error.
    async fn find_by_id(&self, id: Uuid) -> Result<Transaction, AppError>;

    /// Lists transactions belonging to a user with optional filters.
    ///
    /// # Errors
    /// - [`AppError::InternalError`] on database error.
    async fn find_all_by_user_id(
        &self,
        user_id: Uuid,
        filters: TransactionFilters,
    ) -> Result<Vec<Transaction>, AppError>;

    /// Updates a transaction and returns the updated [`Transaction`].
    ///
    /// # Errors
    /// - [`AppError::NotFound`] if no transaction with that ID exists.
    /// - [`AppError::InternalError`] on database error.
    async fn update(&self, id: Uuid, data: UpdateTransaction) -> Result<Transaction, AppError>;

    /// Deletes a transaction by its ID.
    ///
    /// # Errors
    /// - [`AppError::NotFound`] if no transaction with that ID exists.
    /// - [`AppError::InternalError`] on database error.
    async fn delete(&self, id: Uuid) -> Result<(), AppError>;
}

/// Data needed to upsert a user config blob.
pub struct UpsertConfig {
    pub user_id: Uuid,
    pub config_type: String,
    pub encrypted_data: Vec<u8>,
    pub iv: Vec<u8>,
    pub auth_tag: Vec<u8>,
}

/// Persistence operations for the `user_config` table.
#[async_trait]
pub trait UserConfigRepository: Send + Sync {
    /// Fetches the config blob for a user and config type.
    ///
    /// # Errors
    /// - [`AppError::NotFound`] if no config exists for that type.
    /// - [`AppError::InternalError`] on database error.
    async fn find(&self, user_id: Uuid, config_type: &str) -> Result<UserConfig, AppError>;

    /// Inserts or replaces the config blob for a user and config type.
    ///
    /// Uses `ON CONFLICT (user_id, config_type) DO UPDATE` so the same
    /// config type is always a single row per user.
    ///
    /// # Errors
    /// - [`AppError::InternalError`] on database error.
    async fn upsert(&self, data: UpsertConfig) -> Result<UserConfig, AppError>;
}
