mod common;

use axum::http::StatusCode;
use serde_json::json;

/// Valid base64-encoded payload for upserting a config blob.
fn config_payload() -> serde_json::Value {
    json!({
        "encrypted_data": "aGVsbG8gd29ybGQ=",
        "iv": "c29tZWl2MTIzNA==",
        "auth_tag": "dGFnMTIzNDU2Nzg="
    })
}

fn updated_config_payload() -> serde_json::Value {
    json!({
        "encrypted_data": "dXBkYXRlZGRhdGE=",
        "iv": "bmV3aXYxMjM0NQ==",
        "auth_tag": "bmV3dGFnMTIzNA=="
    })
}

// ── GET /v1/config/:type ──────────────────────────────────────────────────

#[tokio::test]
async fn test_get_config_when_not_set_returns_404() {
    // Arrange
    let server = common::spawn_test_app().await;
    let token = common::create_test_user_and_login(&server, "cfg-get-404").await;

    // Act
    let response = server
        .get("/v1/config/category_overrides")
        .add_header(axum::http::header::AUTHORIZATION, common::bearer(&token))
        .await;

    // Assert
    assert_eq!(
        response.status_code(),
        StatusCode::NOT_FOUND,
        "Expected 404 when config not set"
    );
    let body: serde_json::Value = response.json();
    assert_eq!(body["error"]["code"], "NOT_FOUND");
}

#[tokio::test]
async fn test_get_config_without_auth_returns_401() {
    // Arrange
    let server = common::spawn_test_app().await;

    // Act
    let response = server.get("/v1/config/category_overrides").await;

    // Assert
    assert_eq!(
        response.status_code(),
        StatusCode::UNAUTHORIZED,
        "Expected 401 for missing auth"
    );
    let body: serde_json::Value = response.json();
    assert_eq!(body["error"]["code"], "UNAUTHORIZED");
}

#[tokio::test]
async fn test_get_config_after_put_returns_200_with_data() {
    // Arrange
    let server = common::spawn_test_app().await;
    let token = common::create_test_user_and_login(&server, "cfg-get-200").await;

    // Seed the config via PUT
    server
        .put("/v1/config/category_overrides")
        .add_header(axum::http::header::AUTHORIZATION, common::bearer(&token))
        .json(&config_payload())
        .await;

    // Act
    let response = server
        .get("/v1/config/category_overrides")
        .add_header(axum::http::header::AUTHORIZATION, common::bearer(&token))
        .await;

    // Assert
    assert_eq!(
        response.status_code(),
        StatusCode::OK,
        "Expected 200 after config was set"
    );
    let body: serde_json::Value = response.json();
    assert!(body["data"]["id"].is_string(), "Response must include id");
    assert_eq!(
        body["data"]["config_type"], "category_overrides",
        "Config type must match"
    );
    assert_eq!(
        body["data"]["encrypted_data"], "aGVsbG8gd29ybGQ=",
        "Encrypted data must be returned"
    );
    assert!(
        body["data"]["updated_at"].is_string(),
        "Must include updated_at"
    );
}

#[tokio::test]
async fn test_get_config_is_isolated_per_user() {
    // Arrange — two separate users
    let server = common::spawn_test_app().await;
    let token_a = common::create_test_user_and_login(&server, "cfg-isolate-a").await;
    let token_b = common::create_test_user_and_login(&server, "cfg-isolate-b").await;

    // User A sets a config
    server
        .put("/v1/config/category_overrides")
        .add_header(axum::http::header::AUTHORIZATION, common::bearer(&token_a))
        .json(&config_payload())
        .await;

    // Act — user B tries to read it
    let response = server
        .get("/v1/config/category_overrides")
        .add_header(axum::http::header::AUTHORIZATION, common::bearer(&token_b))
        .await;

    // Assert — user B sees 404, not user A's data
    assert_eq!(
        response.status_code(),
        StatusCode::NOT_FOUND,
        "User B must not see user A's config"
    );
}

// ── PUT /v1/config/:type ──────────────────────────────────────────────────

#[tokio::test]
async fn test_put_config_creates_new_config_returns_200() {
    // Arrange
    let server = common::spawn_test_app().await;
    let token = common::create_test_user_and_login(&server, "cfg-put-201").await;

    // Act
    let response = server
        .put("/v1/config/category_overrides")
        .add_header(axum::http::header::AUTHORIZATION, common::bearer(&token))
        .json(&config_payload())
        .await;

    // Assert
    assert_eq!(
        response.status_code(),
        StatusCode::OK,
        "Expected 200 for config upsert"
    );
    let body: serde_json::Value = response.json();
    assert!(body["data"]["id"].is_string(), "Response must include id");
    assert_eq!(body["data"]["config_type"], "category_overrides");
    assert_eq!(body["data"]["encrypted_data"], "aGVsbG8gd29ybGQ=");
}

#[tokio::test]
async fn test_put_config_upserts_existing_config_returns_200() {
    // Arrange — PUT once to create
    let server = common::spawn_test_app().await;
    let token = common::create_test_user_and_login(&server, "cfg-put-upsert").await;

    server
        .put("/v1/config/category_overrides")
        .add_header(axum::http::header::AUTHORIZATION, common::bearer(&token))
        .json(&config_payload())
        .await;

    // Act — PUT again with new data
    let response = server
        .put("/v1/config/category_overrides")
        .add_header(axum::http::header::AUTHORIZATION, common::bearer(&token))
        .json(&updated_config_payload())
        .await;

    // Assert — returns the updated data
    assert_eq!(
        response.status_code(),
        StatusCode::OK,
        "Expected 200 for config upsert update"
    );
    let body: serde_json::Value = response.json();
    assert_eq!(
        body["data"]["encrypted_data"], "dXBkYXRlZGRhdGE=",
        "Must return updated encrypted_data"
    );
}

#[tokio::test]
async fn test_put_config_without_auth_returns_401() {
    // Arrange
    let server = common::spawn_test_app().await;

    // Act
    let response = server
        .put("/v1/config/category_overrides")
        .json(&config_payload())
        .await;

    // Assert
    assert_eq!(
        response.status_code(),
        StatusCode::UNAUTHORIZED,
        "Expected 401 for missing auth"
    );
    let body: serde_json::Value = response.json();
    assert_eq!(body["error"]["code"], "UNAUTHORIZED");
}

#[tokio::test]
async fn test_put_config_with_missing_fields_returns_422() {
    // Arrange
    let server = common::spawn_test_app().await;
    let token = common::create_test_user_and_login(&server, "cfg-put-422").await;

    // Act — payload missing iv and auth_tag
    let response = server
        .put("/v1/config/category_overrides")
        .add_header(axum::http::header::AUTHORIZATION, common::bearer(&token))
        .json(&json!({ "encrypted_data": "aGVsbG8=" }))
        .await;

    // Assert
    assert_eq!(
        response.status_code(),
        StatusCode::UNPROCESSABLE_ENTITY,
        "Expected 422 for missing fields"
    );
}

#[tokio::test]
async fn test_put_config_with_invalid_base64_returns_422() {
    // Arrange
    let server = common::spawn_test_app().await;
    let token = common::create_test_user_and_login(&server, "cfg-put-b64").await;

    // Act — invalid base64 in encrypted_data
    let response = server
        .put("/v1/config/category_overrides")
        .add_header(axum::http::header::AUTHORIZATION, common::bearer(&token))
        .json(&json!({
            "encrypted_data": "not-valid-base64!!!",
            "iv": "c29tZWl2MTIzNA==",
            "auth_tag": "dGFnMTIzNDU2Nzg="
        }))
        .await;

    // Assert
    assert_eq!(
        response.status_code(),
        StatusCode::UNPROCESSABLE_ENTITY,
        "Expected 422 for invalid base64"
    );
}
