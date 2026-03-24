//! JWT authentication extractor.
//!
//! Provides [`AuthUser`], an axum extractor that validates the Bearer token
//! from the `Authorization` header and extracts the authenticated user's ID.

use async_trait::async_trait;
use axum::{
    extract::FromRequestParts,
    http::{header::AUTHORIZATION, request::Parts},
};

use crate::auth::jwt::validate_token;
use crate::error::AppError;
use crate::models::user::UserId;
use crate::state::AppState;

/// Extractor that validates the JWT Bearer token and yields the caller's [`UserId`].
///
/// Use this in any handler that requires authentication:
///
/// ```ignore
/// async fn protected(AuthUser(user_id): AuthUser) -> impl IntoResponse { ... }
/// ```
///
/// # Errors
/// Returns [`AppError::Unauthorized`] when:
/// - The `Authorization` header is missing
/// - The header value is not a valid `Bearer <token>` format
/// - The JWT signature is invalid or the token has expired
#[derive(Debug, Clone)]
pub struct AuthUser(pub UserId);

#[async_trait]
impl FromRequestParts<AppState> for AuthUser {
    type Rejection = AppError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        let header_value = parts
            .headers
            .get(AUTHORIZATION)
            .ok_or_else(|| AppError::Unauthorized("missing Authorization header".into()))?;

        let header_str = header_value
            .to_str()
            .map_err(|_| AppError::Unauthorized("invalid Authorization header".into()))?;

        let token = header_str
            .strip_prefix("Bearer ")
            .ok_or_else(|| AppError::Unauthorized("invalid Authorization header format".into()))?;

        let claims = validate_token(token, &state.jwt_secret)?;

        Ok(AuthUser(UserId(claims.user_id)))
    }
}
