mod common;

use axum::http::StatusCode;
use serde_json::json;

fn register_payload() -> serde_json::Value {
    json!({
        "email": "alice@example.com",
        "password": "supersecret123",
        "wrapped_dek": "aGVsbG8gd29ybGQ=",
        "dek_salt": "c2FsdHNhbHQ=",
        "dek_params": "{\"m\":65536,\"t\":3,\"p\":1}"
    })
}

#[tokio::test]
async fn test_register_with_valid_payload_returns_201() {
    // Arrange
    let server = common::spawn_test_app().await;

    // Act
    let response = server.post("/auth/register").json(&register_payload()).await;

    // Assert
    assert_eq!(
        response.status_code(),
        StatusCode::CREATED,
        "Expected 201 Created for valid registration"
    );
    let body: serde_json::Value = response.json();
    assert!(
        body["data"]["id"].is_string(),
        "Response must include a user id"
    );
}

#[tokio::test]
async fn test_register_with_duplicate_email_returns_409() {
    // Arrange
    let server = common::spawn_test_app().await;
    let payload = json!({
        "email": "bob@example.com",
        "password": "supersecret123",
        "wrapped_dek": "aGVsbG8gd29ybGQ=",
        "dek_salt": "c2FsdHNhbHQ=",
        "dek_params": "{\"m\":65536,\"t\":3,\"p\":1}"
    });

    // First registration
    server.post("/auth/register").json(&payload).await;

    // Act — second registration with same email
    let response = server.post("/auth/register").json(&payload).await;

    // Assert
    assert_eq!(
        response.status_code(),
        StatusCode::CONFLICT,
        "Expected 409 Conflict for duplicate email"
    );
    let body: serde_json::Value = response.json();
    assert_eq!(body["error"]["code"], "CONFLICT");
}

#[tokio::test]
async fn test_register_with_missing_fields_returns_422() {
    // Arrange
    let server = common::spawn_test_app().await;

    // Act — payload missing required fields
    let response = server
        .post("/auth/register")
        .json(&json!({ "email": "carol@example.com" }))
        .await;

    // Assert
    assert_eq!(
        response.status_code(),
        StatusCode::UNPROCESSABLE_ENTITY,
        "Expected 422 for missing required fields"
    );
}
