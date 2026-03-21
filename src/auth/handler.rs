//! Authentication HTTP handlers.
//!
//! # Endpoints
//! - `POST /auth/register` — create a new user account
//! - `POST /auth/login`    — verify credentials, return JWT + wrapped DEK

use axum::{extract::State, http::StatusCode, response::IntoResponse, Json};
use base64::{engine::general_purpose::STANDARD, Engine};
use serde::Deserialize;
use serde_json::json;

use crate::{
    auth::{
        jwt::create_token,
        password::{hash_password, verify_password},
    },
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

/// Request body for `POST /auth/login`.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct LoginRequest {
    pub email: String,
    pub password: String,
}

/// `POST /auth/login` — authenticate and return a JWT with the wrapped DEK.
///
/// Returns the same 401 for both wrong password and unknown email to avoid
/// leaking whether an address is registered.
///
/// # Responses
/// - `200 OK` — `{ "data": { "token", "wrapped_dek", "dek_salt", "dek_params" } }`
/// - `401 Unauthorized` — invalid credentials
/// - `422 Unprocessable Entity` — missing fields
pub async fn login(
    State(state): State<AppState>,
    Json(payload): Json<LoginRequest>,
) -> Result<impl IntoResponse, AppError> {
    let repo = PgUserRepository::new(state.pool.clone());

    // Map NotFound → Unauthorized to avoid leaking user existence
    let user = repo.find_by_email(&payload.email).await.map_err(|e| {
        if matches!(e, AppError::NotFound(_)) {
            AppError::Unauthorized("invalid credentials".into())
        } else {
            e
        }
    })?;

    if !verify_password(&payload.password, &user.password_hash)? {
        return Err(AppError::Unauthorized("invalid credentials".into()));
    }

    let token = create_token(user.id, &state.jwt_secret, state.jwt_expiration_hours)?;

    Ok(Json(json!({
        "data": {
            "token": token,
            "wrapped_dek": STANDARD.encode(&user.wrapped_dek),
            "dek_salt":    STANDARD.encode(&user.dek_salt),
            "dek_params":  user.dek_params,
        }
    })))
}
