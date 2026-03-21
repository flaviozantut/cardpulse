mod common;

use axum::http::StatusCode;
use serde_json::json;

#[tokio::test]
async fn test_post_blob_with_valid_payload_returns_201_with_id() {
    // Arrange
    let pool = common::test_pool().await;
    let server = common::spawn_test_app_with_state(pool).await;

    // Act
    let response = server
        .post("/v1/test")
        .json(&json!({ "data": "aGVsbG8gd29ybGQ=" }))
        .await;

    // Assert
    assert_eq!(
        response.status_code(),
        StatusCode::CREATED,
        "Expected 201 Created"
    );
    let body: serde_json::Value = response.json();
    assert!(
        body["data"]["id"].is_string(),
        "Expected a UUID id in response"
    );
}

#[tokio::test]
async fn test_get_blob_returns_data_matching_what_was_posted() {
    // Arrange
    let pool = common::test_pool().await;
    let server = common::spawn_test_app_with_state(pool).await;
    let payload = json!({ "data": "aGVsbG8gd29ybGQ=" });

    // Act — POST
    let post_response = server.post("/v1/test").json(&payload).await;
    assert_eq!(post_response.status_code(), StatusCode::CREATED);
    let post_body: serde_json::Value = post_response.json();
    let id = post_body["data"]["id"].as_str().unwrap();

    // Act — GET
    let get_response = server.get(&format!("/v1/test/{id}")).await;

    // Assert
    assert_eq!(get_response.status_code(), StatusCode::OK);
    let get_body: serde_json::Value = get_response.json();
    assert_eq!(
        get_body["data"]["data"], "aGVsbG8gd29ybGQ=",
        "Retrieved data must match what was posted"
    );
}

#[tokio::test]
async fn test_post_blob_without_data_field_returns_422() {
    // Arrange
    let pool = common::test_pool().await;
    let server = common::spawn_test_app_with_state(pool).await;

    // Act
    let response = server.post("/v1/test").json(&json!({})).await;

    // Assert
    assert_eq!(response.status_code(), StatusCode::UNPROCESSABLE_ENTITY);
}

#[tokio::test]
async fn test_get_blob_with_unknown_id_returns_404() {
    // Arrange
    let pool = common::test_pool().await;
    let server = common::spawn_test_app_with_state(pool).await;

    // Act
    let response = server
        .get("/v1/test/00000000-0000-0000-0000-000000000000")
        .await;

    // Assert
    assert_eq!(response.status_code(), StatusCode::NOT_FOUND);
    let body: serde_json::Value = response.json();
    assert_eq!(body["error"]["code"], "NOT_FOUND");
}
