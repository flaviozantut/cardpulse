//! Temporary scaffolding handler for `POST /v1/test` and `GET /v1/test/:id`.
//!
//! Validates the full request → handler → sqlx → response pipeline.
//! **Remove this module before Phase 1.**

use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use serde::Deserialize;
use serde_json::json;
use uuid::Uuid;

use crate::{error::AppError, state::AppState};

/// Request body for `POST /v1/test`.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct CreateBlobRequest {
    pub data: String,
}

#[derive(Debug, sqlx::FromRow)]
struct BlobRow {
    id: Uuid,
    data: String,
}

/// `POST /v1/test` — persist a base64 blob and return its generated UUID.
///
/// # Responses
/// - `201 Created` — `{ "data": { "id": "<uuid>" } }`
/// - `422 Unprocessable Entity` — missing or invalid `data` field
/// - `500 Internal Server Error` — database failure
pub async fn create_blob(
    State(state): State<AppState>,
    Json(payload): Json<CreateBlobRequest>,
) -> Result<impl IntoResponse, AppError> {
    let row = sqlx::query_as::<_, BlobRow>(
        "INSERT INTO test_blobs (data) VALUES ($1) RETURNING id, data",
    )
    .bind(&payload.data)
    .fetch_one(&state.pool)
    .await
    .map_err(|e| AppError::InternalError(e.to_string()))?;

    Ok((
        StatusCode::CREATED,
        Json(json!({ "data": { "id": row.id } })),
    ))
}

/// `GET /v1/test/:id` — retrieve a previously stored blob by UUID.
///
/// # Responses
/// - `200 OK` — `{ "data": { "id": "<uuid>", "data": "<base64>" } }`
/// - `404 Not Found` — no blob with the given id
/// - `500 Internal Server Error` — database failure
pub async fn get_blob(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, AppError> {
    let row = sqlx::query_as::<_, BlobRow>("SELECT id, data FROM test_blobs WHERE id = $1")
        .bind(id)
        .fetch_optional(&state.pool)
        .await
        .map_err(|e| AppError::InternalError(e.to_string()))?
        .ok_or_else(|| AppError::NotFound(format!("blob {id} not found")))?;

    Ok(Json(json!({
        "data": {
            "id": row.id,
            "data": row.data
        }
    })))
}
