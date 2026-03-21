//! Argon2id password hashing and verification.

use argon2::{
    password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};

use crate::error::AppError;

/// Hashes `password` with Argon2id using a random salt.
///
/// # Errors
/// Returns [`AppError::InternalError`] if hashing fails.
pub fn hash_password(password: &str) -> Result<String, AppError> {
    let salt = SaltString::generate(&mut OsRng);
    let hash = Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .map_err(|e| AppError::InternalError(format!("password hashing failed: {e}")))?;
    Ok(hash.to_string())
}

/// Verifies that `password` matches the stored `hash`.
///
/// Returns `true` if they match, `false` otherwise.
///
/// # Errors
/// Returns [`AppError::InternalError`] if the hash string is malformed.
pub fn verify_password(password: &str, hash: &str) -> Result<bool, AppError> {
    let parsed = PasswordHash::new(hash)
        .map_err(|e| AppError::InternalError(format!("invalid hash: {e}")))?;
    Ok(Argon2::default()
        .verify_password(password.as_bytes(), &parsed)
        .is_ok())
}
