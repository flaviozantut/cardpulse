//! User configuration blob handlers.
//!
//! Stores encrypted configuration blobs per (user, config_type) without
//! ever inspecting or decrypting the content. The client uses this to sync
//! settings (e.g., category overrides) across devices.
//!
//! # Endpoints
//! - `GET /v1/config/:type` — fetch the authenticated user's encrypted config blob
//! - `PUT /v1/config/:type` — upsert the authenticated user's encrypted config blob

use axum::{
    extract::{Path, State},
    response::IntoResponse,
    Json,
};
use base64::{engine::general_purpose::STANDARD, Engine};
use serde_json::json;

use crate::{
    auth::middleware::AuthUser,
    error::AppError,
    models::user_config::{UpsertUserConfig, UserConfig, UserConfigResponse},
    repositories::{
        traits::{UpsertConfig, UserConfigRepository},
        user_config_repo::PgUserConfigRepository,
    },
    state::AppState,
    validation::validate_base64,
};

/// Converts a domain [`UserConfig`] into a JSON-serializable [`UserConfigResponse`].
fn config_to_response(config: UserConfig) -> UserConfigResponse {
    UserConfigResponse {
        id: config.id,
        config_type: config.config_type,
        encrypted_data: STANDARD.encode(&config.encrypted_data),
        iv: STANDARD.encode(&config.iv),
        auth_tag: STANDARD.encode(&config.auth_tag),
        updated_at: config.updated_at,
    }
}

/// `GET /v1/config/:type` — fetch encrypted config blob.
///
/// Returns the encrypted config blob for the authenticated user and the
/// given config type. The server returns the blob without decrypting it.
///
/// # Responses
/// - `200 OK`    — `{ "data": { id, config_type, encrypted_data, iv, auth_tag, updated_at } }`
/// - `401 Unauthorized` — missing or invalid token
/// - `404 Not Found`    — config type not yet set for this user
pub async fn get_config(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Path(config_type): Path<String>,
) -> Result<impl IntoResponse, AppError> {
    let repo = PgUserConfigRepository::new(state.pool);
    let config = repo.find(user_id.0, &config_type).await?;
    Ok(Json(json!({ "data": config_to_response(config) })))
}

/// `PUT /v1/config/:type` — upsert encrypted config blob.
///
/// Creates or replaces the config blob for the authenticated user and
/// the given config type. Uses an upsert so repeat calls are idempotent.
///
/// # Responses
/// - `200 OK`    — `{ "data": { ... } }`
/// - `401 Unauthorized`       — missing or invalid token
/// - `422 Unprocessable Entity` — invalid or missing base64 fields
pub async fn put_config(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Path(config_type): Path<String>,
    Json(payload): Json<UpsertUserConfig>,
) -> Result<impl IntoResponse, AppError> {
    let encrypted_data = validate_base64(&payload.encrypted_data, "encrypted_data")?;
    let iv = validate_base64(&payload.iv, "iv")?;
    let auth_tag = validate_base64(&payload.auth_tag, "auth_tag")?;

    let repo = PgUserConfigRepository::new(state.pool);
    let config = repo
        .upsert(UpsertConfig {
            user_id: user_id.0,
            config_type,
            encrypted_data,
            iv,
            auth_tag,
        })
        .await?;

    Ok(Json(json!({ "data": config_to_response(config) })))
}
