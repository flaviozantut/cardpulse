//! Handler for the authenticated user identity endpoint.

use axum::{response::IntoResponse, Json};
use serde_json::json;

use crate::auth::middleware::AuthUser;
use crate::error::AppError;

/// Returns the authenticated user's ID.
///
/// **GET /v1/me**
///
/// Requires a valid Bearer token in the `Authorization` header.
///
/// ## Responses
/// - `200 OK` — `{ "data": { "user_id": "<uuid>" } }`
/// - `401 Unauthorized` — missing or invalid token
pub async fn me(AuthUser(user_id): AuthUser) -> Result<impl IntoResponse, AppError> {
    Ok(Json(json!({ "data": { "user_id": user_id } })))
}
