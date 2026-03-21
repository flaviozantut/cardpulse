//! Authentication HTTP handlers.
//!
//! # Endpoints
//! - `POST /auth/register` — create a new user account

use axum::{extract::State, http::StatusCode, response::IntoResponse, Json};
use base64::{engine::general_purpose::STANDARD, Engine};
use serde_json::json;

use crate::{
    auth::password::hash_password,
    error::AppError,
    models::user::CreateUser,
    repositories::{
        traits::{NewUser, UserRepository},
        user_repo::PgUserRepository,
    },
    state::AppState,
};

/// `POST /auth/register` — register a new user.
///
/// Hashes the password with Argon2id and stores the wrapped DEK
/// (client-side encrypted with a server-derived KEK). The server
/// never sees the plaintext DEK.
///
/// # Responses
/// - `201 Created` — `{ "data": { "id": "<uuid>" } }`
/// - `409 Conflict` — email already registered
/// - `422 Unprocessable Entity` — missing or malformed fields
pub async fn register(
    State(state): State<AppState>,
    Json(payload): Json<CreateUser>,
) -> Result<impl IntoResponse, AppError> {
    let password_hash = hash_password(&payload.password)?;

    let wrapped_dek = STANDARD
        .decode(&payload.wrapped_dek)
        .map_err(|_| AppError::ValidationError("wrapped_dek is not valid base64".into()))?;

    let dek_salt = STANDARD
        .decode(&payload.dek_salt)
        .map_err(|_| AppError::ValidationError("dek_salt is not valid base64".into()))?;

    let repo = PgUserRepository::new(state.pool);
    let id = repo
        .create(NewUser {
            email: payload.email,
            password_hash,
            wrapped_dek,
            dek_salt,
            dek_params: payload.dek_params,
        })
        .await?;

    Ok((StatusCode::CREATED, Json(json!({ "data": { "id": id } }))))
}
