mod common;

use axum::http::StatusCode;

/// GET /health should return 200 with `{ "status": "ok" }`.
#[tokio::test]
async fn test_health_returns_200_with_status_ok() {
    // Arrange
    let server = common::spawn_test_app().await;

    // Act
    let response = server.get("/health").await;

    // Assert
    assert_eq!(response.status_code(), StatusCode::OK);
    let body: serde_json::Value = response.json();
    assert_eq!(body["status"], "ok", "Expected {{ \"status\": \"ok\" }}");
}
