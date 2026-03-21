//! Health check handler.

use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use serde_json::json;

/// `GET /health` — liveness probe.
///
/// Returns `200 OK` with `{ "status": "ok" }` when the server is running.
/// No database connectivity is verified here; this is a pure liveness check.
pub async fn health_check() -> impl IntoResponse {
    (StatusCode::OK, Json(json!({ "status": "ok" })))
}
