mod common;

use axum::http::StatusCode;
use serde_json::json;
use uuid::Uuid;

// ── POST /v1/cards ────────────────────────────────────────────────────────

#[tokio::test]
async fn test_create_card_with_valid_payload_returns_201() {
    // Arrange
    let server = common::spawn_test_app().await;
    let token = common::create_test_user_and_login(&server, "create").await;

    // Act
    let response = server
        .post("/v1/cards")
        .add_header(axum::http::header::AUTHORIZATION, common::bearer(&token))
        .json(&common::card_payload())
        .await;

    // Assert
    assert_eq!(
        response.status_code(),
        StatusCode::CREATED,
        "Expected 201 Created for valid card"
    );
    let body: serde_json::Value = response.json();
    assert!(body["data"]["id"].is_string(), "Response must include id");
    assert!(
        body["data"]["encrypted_data"].is_string(),
        "Response must include encrypted_data"
    );
}

#[tokio::test]
async fn test_create_card_without_auth_returns_401() {
    // Arrange
    let server = common::spawn_test_app().await;

    // Act
    let response = server.post("/v1/cards").json(&common::card_payload()).await;

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
async fn test_create_card_with_missing_fields_returns_422() {
    // Arrange
    let server = common::spawn_test_app().await;
    let token = common::create_test_user_and_login(&server, "create-invalid").await;

    // Act — payload missing required fields
    let response = server
        .post("/v1/cards")
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

// ── GET /v1/cards ─────────────────────────────────────────────────────────

#[tokio::test]
async fn test_list_cards_returns_200_with_array() {
    // Arrange
    let server = common::spawn_test_app().await;
    let token = common::create_test_user_and_login(&server, "list").await;

    // Create two cards
    common::create_test_card(&server, &token).await;
    common::create_test_card(&server, &token).await;

    // Act
    let response = server
        .get("/v1/cards")
        .add_header(axum::http::header::AUTHORIZATION, common::bearer(&token))
        .await;

    // Assert
    assert_eq!(
        response.status_code(),
        StatusCode::OK,
        "Expected 200 OK for card listing"
    );
    let body: serde_json::Value = response.json();
    assert!(body["data"].is_array(), "Response must be an array");
    assert_eq!(
        body["data"].as_array().unwrap().len(),
        2,
        "Expected 2 cards"
    );
}

#[tokio::test]
async fn test_list_cards_without_auth_returns_401() {
    // Arrange
    let server = common::spawn_test_app().await;

    // Act
    let response = server.get("/v1/cards").await;

    // Assert
    assert_eq!(
        response.status_code(),
        StatusCode::UNAUTHORIZED,
        "Expected 401 for missing auth"
    );
}

#[tokio::test]
async fn test_list_cards_returns_only_own_cards() {
    // Arrange — two different users
    let server = common::spawn_test_app().await;
    let token_a = common::create_test_user_and_login(&server, "list-a").await;
    let token_b = common::create_test_user_and_login(&server, "list-b").await;

    // User A creates 2 cards, User B creates 1
    common::create_test_card(&server, &token_a).await;
    common::create_test_card(&server, &token_a).await;
    common::create_test_card(&server, &token_b).await;

    // Act — User A lists cards
    let response = server
        .get("/v1/cards")
        .add_header(axum::http::header::AUTHORIZATION, common::bearer(&token_a))
        .await;

    // Assert
    let body: serde_json::Value = response.json();
    assert_eq!(
        body["data"].as_array().unwrap().len(),
        2,
        "User A should only see their own 2 cards"
    );
}

// ── PUT /v1/cards/:id ─────────────────────────────────────────────────────

#[tokio::test]
async fn test_update_card_with_valid_payload_returns_200() {
    // Arrange
    let server = common::spawn_test_app().await;
    let token = common::create_test_user_and_login(&server, "update").await;
    let card_id = common::create_test_card(&server, &token).await;

    let updated_payload = json!({
        "encrypted_data": "dXBkYXRlZA==",
        "iv": "bmV3aXYxMjM0NTY=",
        "auth_tag": "bmV3dGFnMTIzNDU2"
    });

    // Act
    let response = server
        .put(&format!("/v1/cards/{card_id}"))
        .add_header(axum::http::header::AUTHORIZATION, common::bearer(&token))
        .json(&updated_payload)
        .await;

    // Assert
    assert_eq!(
        response.status_code(),
        StatusCode::OK,
        "Expected 200 OK for valid update"
    );
    let body: serde_json::Value = response.json();
    assert_eq!(body["data"]["encrypted_data"], "dXBkYXRlZA==");
}

#[tokio::test]
async fn test_update_card_without_auth_returns_401() {
    // Arrange
    let server = common::spawn_test_app().await;
    let token = common::create_test_user_and_login(&server, "update-noauth").await;
    let card_id = common::create_test_card(&server, &token).await;

    // Act
    let response = server
        .put(&format!("/v1/cards/{card_id}"))
        .json(&common::card_payload())
        .await;

    // Assert
    assert_eq!(
        response.status_code(),
        StatusCode::UNAUTHORIZED,
        "Expected 401 for missing auth"
    );
}

#[tokio::test]
async fn test_update_card_not_found_returns_404() {
    // Arrange
    let server = common::spawn_test_app().await;
    let token = common::create_test_user_and_login(&server, "update-404").await;
    let fake_id = Uuid::new_v4();

    // Act
    let response = server
        .put(&format!("/v1/cards/{fake_id}"))
        .add_header(axum::http::header::AUTHORIZATION, common::bearer(&token))
        .json(&common::card_payload())
        .await;

    // Assert
    assert_eq!(
        response.status_code(),
        StatusCode::NOT_FOUND,
        "Expected 404 for nonexistent card"
    );
}

#[tokio::test]
async fn test_update_card_owned_by_another_user_returns_403() {
    // Arrange — User A creates a card, User B tries to update it
    let server = common::spawn_test_app().await;
    let token_a = common::create_test_user_and_login(&server, "update-a").await;
    let token_b = common::create_test_user_and_login(&server, "update-b").await;
    let card_id = common::create_test_card(&server, &token_a).await;

    // Act
    let response = server
        .put(&format!("/v1/cards/{card_id}"))
        .add_header(axum::http::header::AUTHORIZATION, common::bearer(&token_b))
        .json(&common::card_payload())
        .await;

    // Assert
    assert_eq!(
        response.status_code(),
        StatusCode::FORBIDDEN,
        "Expected 403 for ownership violation"
    );
    let body: serde_json::Value = response.json();
    assert_eq!(body["error"]["code"], "FORBIDDEN");
}

// ── DELETE /v1/cards/:id ──────────────────────────────────────────────────

#[tokio::test]
async fn test_delete_card_returns_204() {
    // Arrange
    let server = common::spawn_test_app().await;
    let token = common::create_test_user_and_login(&server, "delete").await;
    let card_id = common::create_test_card(&server, &token).await;

    // Act
    let response = server
        .delete(&format!("/v1/cards/{card_id}"))
        .add_header(axum::http::header::AUTHORIZATION, common::bearer(&token))
        .await;

    // Assert
    assert_eq!(
        response.status_code(),
        StatusCode::NO_CONTENT,
        "Expected 204 No Content for successful delete"
    );

    // Verify card is gone
    let list_response = server
        .get("/v1/cards")
        .add_header(axum::http::header::AUTHORIZATION, common::bearer(&token))
        .await;
    let body: serde_json::Value = list_response.json();
    assert_eq!(body["data"].as_array().unwrap().len(), 0);
}

#[tokio::test]
async fn test_delete_card_without_auth_returns_401() {
    // Arrange
    let server = common::spawn_test_app().await;
    let token = common::create_test_user_and_login(&server, "delete-noauth").await;
    let card_id = common::create_test_card(&server, &token).await;

    // Act
    let response = server.delete(&format!("/v1/cards/{card_id}")).await;

    // Assert
    assert_eq!(
        response.status_code(),
        StatusCode::UNAUTHORIZED,
        "Expected 401 for missing auth"
    );
}

#[tokio::test]
async fn test_delete_card_not_found_returns_404() {
    // Arrange
    let server = common::spawn_test_app().await;
    let token = common::create_test_user_and_login(&server, "delete-404").await;
    let fake_id = Uuid::new_v4();

    // Act
    let response = server
        .delete(&format!("/v1/cards/{fake_id}"))
        .add_header(axum::http::header::AUTHORIZATION, common::bearer(&token))
        .await;

    // Assert
    assert_eq!(
        response.status_code(),
        StatusCode::NOT_FOUND,
        "Expected 404 for nonexistent card"
    );
}

#[tokio::test]
async fn test_delete_card_owned_by_another_user_returns_403() {
    // Arrange — User A creates a card, User B tries to delete it
    let server = common::spawn_test_app().await;
    let token_a = common::create_test_user_and_login(&server, "delete-a").await;
    let token_b = common::create_test_user_and_login(&server, "delete-b").await;
    let card_id = common::create_test_card(&server, &token_a).await;

    // Act
    let response = server
        .delete(&format!("/v1/cards/{card_id}"))
        .add_header(axum::http::header::AUTHORIZATION, common::bearer(&token_b))
        .await;

    // Assert
    assert_eq!(
        response.status_code(),
        StatusCode::FORBIDDEN,
        "Expected 403 for ownership violation"
    );
    let body: serde_json::Value = response.json();
    assert_eq!(body["error"]["code"], "FORBIDDEN");
}
