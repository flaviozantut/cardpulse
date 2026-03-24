mod common;

use axum::http::{header::HeaderValue, StatusCode};
use serde_json::json;
use uuid::Uuid;

/// Generates a unique email for each test run.
fn unique_email(prefix: &str) -> String {
    format!("{prefix}+{}@example.com", Uuid::new_v4())
}

/// Registers a user and logs in, returning the JWT token.
async fn register_and_login(server: &axum_test::TestServer) -> String {
    let email = unique_email("middleware");
    server
        .post("/auth/register")
        .json(&json!({
            "email": email,
            "password": "testpassword123",
            "wrapped_dek": "aGVsbG8gd29ybGQ=",
            "dek_salt": "c2FsdHNhbHQ=",
            "dek_params": "{\"m\":65536}"
        }))
        .await;

    let response = server
        .post("/auth/login")
        .json(&json!({ "email": email, "password": "testpassword123" }))
        .await;

    let body: serde_json::Value = response.json();
    body["data"]["token"]
        .as_str()
        .expect("login must return a token")
        .to_string()
}

// ── Happy path ────────────────────────────────────────────────────────────

#[tokio::test]
async fn test_protected_endpoint_with_valid_token_returns_200() {
    // Arrange
    let server = common::spawn_test_app().await;
    let token = register_and_login(&server).await;

    // Act
    let response = server
        .get("/v1/me")
        .add_header(
            axum::http::header::AUTHORIZATION,
            format!("Bearer {token}").parse::<HeaderValue>().unwrap(),
        )
        .await;

    // Assert
    assert_eq!(
        response.status_code(),
        StatusCode::OK,
        "Expected 200 OK for valid Bearer token"
    );
    let body: serde_json::Value = response.json();
    assert!(
        body["data"]["user_id"].is_string(),
        "Response must include user_id"
    );
}

// ── Missing Authorization header ──────────────────────────────────────────

#[tokio::test]
async fn test_protected_endpoint_without_auth_header_returns_401() {
    // Arrange
    let server = common::spawn_test_app().await;

    // Act — no Authorization header
    let response = server.get("/v1/me").await;

    // Assert
    assert_eq!(
        response.status_code(),
        StatusCode::UNAUTHORIZED,
        "Expected 401 for missing Authorization header"
    );
    let body: serde_json::Value = response.json();
    assert_eq!(body["error"]["code"], "UNAUTHORIZED");
}

// ── Malformed Authorization header ────────────────────────────────────────

#[tokio::test]
async fn test_protected_endpoint_with_malformed_header_returns_401() {
    // Arrange
    let server = common::spawn_test_app().await;

    // Act — header without "Bearer " prefix
    let response = server
        .get("/v1/me")
        .add_header(
            axum::http::header::AUTHORIZATION,
            "NotBearer sometoken".parse::<HeaderValue>().unwrap(),
        )
        .await;

    // Assert
    assert_eq!(
        response.status_code(),
        StatusCode::UNAUTHORIZED,
        "Expected 401 for malformed Authorization header"
    );
    let body: serde_json::Value = response.json();
    assert_eq!(body["error"]["code"], "UNAUTHORIZED");
}

// ── Invalid JWT signature ─────────────────────────────────────────────────

#[tokio::test]
async fn test_protected_endpoint_with_invalid_token_returns_401() {
    // Arrange
    let server = common::spawn_test_app().await;

    // Act — completely bogus token
    let response = server
        .get("/v1/me")
        .add_header(
            axum::http::header::AUTHORIZATION,
            "Bearer this.is.not.a.valid.jwt"
                .parse::<HeaderValue>()
                .unwrap(),
        )
        .await;

    // Assert
    assert_eq!(
        response.status_code(),
        StatusCode::UNAUTHORIZED,
        "Expected 401 for invalid JWT"
    );
    let body: serde_json::Value = response.json();
    assert_eq!(body["error"]["code"], "UNAUTHORIZED");
}

// ── Expired token ─────────────────────────────────────────────────────────

#[tokio::test]
async fn test_protected_endpoint_with_expired_token_returns_401() {
    // Arrange — create a token that already expired (0 hours = already past)
    let user_id = Uuid::new_v4();
    let secret = "ci-secret-minimum-64-chars-long-for-hs256-validation-in-tests-ok";

    // Manually build an expired token using jsonwebtoken
    let claims = serde_json::json!({ "user_id": user_id.to_string(), "exp": 0 });
    let token = jsonwebtoken::encode(
        &jsonwebtoken::Header::default(),
        &claims,
        &jsonwebtoken::EncodingKey::from_secret(secret.as_bytes()),
    )
    .unwrap();

    let server = common::spawn_test_app().await;

    // Act
    let response = server
        .get("/v1/me")
        .add_header(
            axum::http::header::AUTHORIZATION,
            format!("Bearer {token}").parse::<HeaderValue>().unwrap(),
        )
        .await;

    // Assert
    assert_eq!(
        response.status_code(),
        StatusCode::UNAUTHORIZED,
        "Expected 401 for expired JWT"
    );
    let body: serde_json::Value = response.json();
    assert_eq!(body["error"]["code"], "UNAUTHORIZED");
}
