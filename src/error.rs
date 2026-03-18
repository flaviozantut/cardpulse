//! Error handling for the CardPulse API.
//!
//! Defines `AppError`, the single error type used across all handlers.
//! Each variant maps to a specific HTTP status code and is serialized
//! as `{ "error": { "code": "...", "message": "..." } }`.

use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde_json::json;
use thiserror::Error;

/// All possible errors returned by the API.
#[derive(Debug, Error)]
pub enum AppError {
    /// The requested resource does not exist.
    #[error("{0}")]
    NotFound(String),

    /// The request is missing or has an invalid authentication token.
    #[error("{0}")]
    Unauthorized(String),

    /// The resource already exists (e.g. duplicate email).
    #[error("{0}")]
    Conflict(String),

    /// The request payload failed validation.
    #[error("{0}")]
    ValidationError(String),

    /// An unexpected server-side error occurred.
    #[error("{0}")]
    InternalError(String),
}

impl AppError {
    /// Returns the HTTP status code for this error variant.
    pub fn status_code(&self) -> StatusCode {
        match self {
            AppError::NotFound(_) => StatusCode::NOT_FOUND,
            AppError::Unauthorized(_) => StatusCode::UNAUTHORIZED,
            AppError::Conflict(_) => StatusCode::CONFLICT,
            AppError::ValidationError(_) => StatusCode::UNPROCESSABLE_ENTITY,
            AppError::InternalError(_) => StatusCode::INTERNAL_SERVER_ERROR,
        }
    }

    /// Returns the machine-readable error code string for this variant.
    pub fn error_code(&self) -> &'static str {
        match self {
            AppError::NotFound(_) => "NOT_FOUND",
            AppError::Unauthorized(_) => "UNAUTHORIZED",
            AppError::Conflict(_) => "CONFLICT",
            AppError::ValidationError(_) => "VALIDATION_ERROR",
            AppError::InternalError(_) => "INTERNAL_ERROR",
        }
    }
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let status = self.status_code();
        let body = json!({
            "error": {
                "code": self.error_code(),
                "message": self.to_string()
            }
        });
        (status, Json(body)).into_response()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::body::to_bytes;
    use axum::response::IntoResponse;

    async fn parse_response(err: AppError) -> (StatusCode, serde_json::Value) {
        let response = err.into_response();
        let status = response.status();
        let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
        (status, json)
    }

    #[tokio::test]
    async fn test_not_found_returns_404_with_correct_body() {
        let (status, body) = parse_response(AppError::NotFound("card not found".into())).await;

        assert_eq!(status, StatusCode::NOT_FOUND);
        assert_eq!(body["error"]["code"], "NOT_FOUND");
        assert_eq!(body["error"]["message"], "card not found");
    }

    #[tokio::test]
    async fn test_unauthorized_returns_401_with_correct_body() {
        let (status, body) =
            parse_response(AppError::Unauthorized("invalid token".into())).await;

        assert_eq!(status, StatusCode::UNAUTHORIZED);
        assert_eq!(body["error"]["code"], "UNAUTHORIZED");
        assert_eq!(body["error"]["message"], "invalid token");
    }

    #[tokio::test]
    async fn test_conflict_returns_409_with_correct_body() {
        let (status, body) =
            parse_response(AppError::Conflict("email already in use".into())).await;

        assert_eq!(status, StatusCode::CONFLICT);
        assert_eq!(body["error"]["code"], "CONFLICT");
        assert_eq!(body["error"]["message"], "email already in use");
    }

    #[tokio::test]
    async fn test_validation_error_returns_422_with_correct_body() {
        let (status, body) =
            parse_response(AppError::ValidationError("invalid payload".into())).await;

        assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
        assert_eq!(body["error"]["code"], "VALIDATION_ERROR");
        assert_eq!(body["error"]["message"], "invalid payload");
    }

    #[tokio::test]
    async fn test_internal_error_returns_500_with_correct_body() {
        let (status, body) =
            parse_response(AppError::InternalError("something went wrong".into())).await;

        assert_eq!(status, StatusCode::INTERNAL_SERVER_ERROR);
        assert_eq!(body["error"]["code"], "INTERNAL_ERROR");
        assert_eq!(body["error"]["message"], "something went wrong");
    }
}
