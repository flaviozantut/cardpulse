//! JWT creation and validation.
//!
//! Tokens are signed with HMAC-SHA256. The only claim stored is `user_id`;
//! expiry is enforced by the `exp` standard claim.

use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::error::AppError;

/// Claims embedded in every JWT.
#[derive(Debug, Serialize, Deserialize)]
pub struct Claims {
    /// Subject — the authenticated user's UUID.
    pub user_id: Uuid,
    /// Expiry timestamp (Unix seconds).
    pub exp: u64,
}

/// Creates a signed JWT for `user_id` that expires after `expiration_hours`.
///
/// # Errors
/// Returns [`AppError::InternalError`] if encoding fails.
pub fn create_token(
    user_id: Uuid,
    secret: &str,
    expiration_hours: u64,
) -> Result<String, AppError> {
    let exp = jsonwebtoken::get_current_timestamp() + expiration_hours * 3600;
    let claims = Claims { user_id, exp };
    encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(secret.as_bytes()),
    )
    .map_err(|e| AppError::InternalError(format!("JWT encoding failed: {e}")))
}

/// Validates `token` and returns the embedded [`Claims`].
///
/// # Errors
/// Returns [`AppError::Unauthorized`] if the token is invalid or expired.
pub fn validate_token(token: &str, secret: &str) -> Result<Claims, AppError> {
    decode::<Claims>(
        token,
        &DecodingKey::from_secret(secret.as_bytes()),
        &Validation::default(),
    )
    .map(|data| data.claims)
    .map_err(|_| AppError::Unauthorized("invalid or expired token".into()))
}
