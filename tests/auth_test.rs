mod common;

use axum::http::StatusCode;
use serde_json::json;

// ── Key rotation tests ──────────────────────────────────────────────────────

#[tokio::test]
async fn test_rotate_key_with_valid_payload_returns_200() {
    // Arrange
    let server = common::spawn_test_app().await;
    let token = common::create_test_user_and_login(&server, "rotate").await;

    // Act
    let response = server
        .post("/v1/key/rotate")
        .add_header(axum::http::header::AUTHORIZATION, common::bearer(&token))
        .json(&json!({
            "new_wrapped_dek": "aGVsbG8gd29ybGQ=",
            "new_dek_salt": "c2FsdHNhbHQ=",
            "new_dek_params": "{\"m\":65536}"
        }))
        .await;

    // Assert
    assert_eq!(
        response.status_code(),
        StatusCode::OK,
        "Expected 200 OK for valid key rotation"
    );
}

#[tokio::test]
async fn test_rotate_key_without_auth_returns_401() {
    // Arrange
    let server = common::spawn_test_app().await;

    // Act
    let response = server
        .post("/v1/key/rotate")
        .json(&json!({
            "new_wrapped_dek": "aGVsbG8gd29ybGQ=",
            "new_dek_salt": "c2FsdHNhbHQ=",
            "new_dek_params": "{\"m\":65536}"
        }))
        .await;

    // Assert
    assert_eq!(
        response.status_code(),
        StatusCode::UNAUTHORIZED,
        "Expected 401 for missing auth token"
    );
    let body: serde_json::Value = response.json();
    assert_eq!(body["error"]["code"], "UNAUTHORIZED");
}

#[tokio::test]
async fn test_rotate_key_with_missing_fields_returns_422() {
    // Arrange
    let server = common::spawn_test_app().await;
    let token = common::create_test_user_and_login(&server, "rotate-missing").await;

    // Act — missing new_dek_salt and new_dek_params
    let response = server
        .post("/v1/key/rotate")
        .add_header(axum::http::header::AUTHORIZATION, common::bearer(&token))
        .json(&json!({ "new_wrapped_dek": "aGVsbG8gd29ybGQ=" }))
        .await;

    // Assert
    assert_eq!(
        response.status_code(),
        StatusCode::UNPROCESSABLE_ENTITY,
        "Expected 422 for missing required fields"
    );
}

#[tokio::test]
async fn test_rotate_key_then_login_returns_new_wrapped_dek() {
    // Arrange
    let server = common::spawn_test_app().await;
    let email = common::unique_email("rotate-check");
    server
        .post("/auth/register")
        .json(&common::register_payload(&email))
        .await;

    let login_resp = server
        .post("/auth/login")
        .json(&json!({ "email": email, "password": "testpassword123" }))
        .await;
    let login_body: serde_json::Value = login_resp.json();
    let token = login_body["data"]["token"].as_str().unwrap().to_string();

    let new_wrapped_dek = "bmV3d3JhcHBlZGRlaw==";
    let new_dek_salt = "bmV3c2FsdA==";
    let new_dek_params = "{\"m\":131072}";

    // Act — rotate the key
    let rotate_resp = server
        .post("/v1/key/rotate")
        .add_header(axum::http::header::AUTHORIZATION, common::bearer(&token))
        .json(&json!({
            "new_wrapped_dek": new_wrapped_dek,
            "new_dek_salt": new_dek_salt,
            "new_dek_params": new_dek_params
        }))
        .await;
    assert_eq!(
        rotate_resp.status_code(),
        StatusCode::OK,
        "Rotation must succeed"
    );

    // Assert — login again and verify DEK data was updated
    let login2_resp = server
        .post("/auth/login")
        .json(&json!({ "email": email, "password": "testpassword123" }))
        .await;
    let body: serde_json::Value = login2_resp.json();
    assert_eq!(
        body["data"]["wrapped_dek"].as_str().unwrap(),
        new_wrapped_dek,
        "wrapped_dek must be updated after rotation"
    );
    assert_eq!(
        body["data"]["dek_salt"].as_str().unwrap(),
        new_dek_salt,
        "dek_salt must be updated after rotation"
    );
    assert_eq!(
        body["data"]["dek_params"].as_str().unwrap(),
        new_dek_params,
        "dek_params must be updated after rotation"
    );
}

// ── Register tests ─────────────────────────────────────────────────────────

#[tokio::test]
async fn test_register_with_valid_payload_returns_201() {
    // Arrange
    let server = common::spawn_test_app().await;
    let email = common::unique_email("alice");

    // Act
    let response = server
        .post("/auth/register")
        .json(&common::register_payload(&email))
        .await;

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
    let email = common::unique_email("bob");
    let payload = common::register_payload(&email);

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
        .json(&json!({ "email": common::unique_email("carol") }))
        .await;

    // Assert
    assert_eq!(
        response.status_code(),
        StatusCode::UNPROCESSABLE_ENTITY,
        "Expected 422 for missing required fields"
    );
}

// ── Login tests ────────────────────────────────────────────────────────────

#[tokio::test]
async fn test_login_with_valid_credentials_returns_200_with_token_and_dek() {
    // Arrange — register first, then login
    let server = common::spawn_test_app().await;
    let email = common::unique_email("dave");
    server
        .post("/auth/register")
        .json(&json!({
            "email": email,
            "password": "mypassword",
            "wrapped_dek": "aGVsbG8gd29ybGQ=",
            "dek_salt": "c2FsdHNhbHQ=",
            "dek_params": "{\"m\":65536}"
        }))
        .await;

    // Act
    let response = server
        .post("/auth/login")
        .json(&json!({ "email": email, "password": "mypassword" }))
        .await;

    // Assert
    assert_eq!(
        response.status_code(),
        StatusCode::OK,
        "Expected 200 OK for valid credentials"
    );
    let body: serde_json::Value = response.json();
    assert!(
        body["data"]["token"].is_string(),
        "Response must include a JWT token"
    );
    assert!(
        body["data"]["wrapped_dek"].is_string(),
        "Response must include wrapped_dek"
    );
    assert!(
        body["data"]["dek_salt"].is_string(),
        "Response must include dek_salt"
    );
    assert!(
        body["data"]["dek_params"].is_string(),
        "Response must include dek_params"
    );
}

#[tokio::test]
async fn test_login_with_wrong_password_returns_401() {
    // Arrange
    let server = common::spawn_test_app().await;
    let email = common::unique_email("eve");
    server
        .post("/auth/register")
        .json(&json!({
            "email": email,
            "password": "correctpassword",
            "wrapped_dek": "aGVsbG8gd29ybGQ=",
            "dek_salt": "c2FsdHNhbHQ=",
            "dek_params": "{\"m\":65536}"
        }))
        .await;

    // Act
    let response = server
        .post("/auth/login")
        .json(&json!({ "email": email, "password": "wrongpassword" }))
        .await;

    // Assert
    assert_eq!(
        response.status_code(),
        StatusCode::UNAUTHORIZED,
        "Expected 401 for wrong password"
    );
    let body: serde_json::Value = response.json();
    assert_eq!(body["error"]["code"], "UNAUTHORIZED");
}

#[tokio::test]
async fn test_login_with_nonexistent_user_returns_401() {
    // Arrange
    let server = common::spawn_test_app().await;

    // Act
    let response = server
        .post("/auth/login")
        .json(&json!({ "email": common::unique_email("ghost"), "password": "whatever" }))
        .await;

    // Assert
    assert_eq!(
        response.status_code(),
        StatusCode::UNAUTHORIZED,
        "Expected 401 for nonexistent user (must not leak existence)"
    );
    let body: serde_json::Value = response.json();
    assert_eq!(body["error"]["code"], "UNAUTHORIZED");
}
