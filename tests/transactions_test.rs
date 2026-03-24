mod common;

use axum::http::{header::HeaderValue, StatusCode};
use serde_json::json;
use uuid::Uuid;

/// Generates a unique email for each test run.
fn unique_email(prefix: &str) -> String {
    format!("{prefix}+{}@example.com", Uuid::new_v4())
}

/// Registers a user and logs in, returning the JWT token.
async fn register_and_login(server: &axum_test::TestServer, prefix: &str) -> String {
    let email = unique_email(prefix);
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

fn bearer(token: &str) -> HeaderValue {
    format!("Bearer {token}").parse().unwrap()
}

/// Creates a card and returns its ID.
async fn create_test_card(server: &axum_test::TestServer, token: &str) -> Uuid {
    let response = server
        .post("/v1/cards")
        .add_header(axum::http::header::AUTHORIZATION, bearer(token))
        .json(&json!({
            "encrypted_data": "aGVsbG8gd29ybGQ=",
            "iv": "c29tZWl2MTIzNA==",
            "auth_tag": "dGFnMTIzNDU2Nzg="
        }))
        .await;

    let body: serde_json::Value = response.json();
    Uuid::parse_str(body["data"]["id"].as_str().unwrap()).unwrap()
}

fn tx_payload(card_id: Uuid, bucket: &str) -> serde_json::Value {
    json!({
        "card_id": card_id,
        "encrypted_data": "dHhkYXRh",
        "iv": "dHhpdjEyMzQ=",
        "auth_tag": "dHh0YWcxMjM0",
        "timestamp_bucket": bucket
    })
}

/// Creates a transaction and returns its ID.
async fn create_test_tx(
    server: &axum_test::TestServer,
    token: &str,
    card_id: Uuid,
    bucket: &str,
) -> Uuid {
    let response = server
        .post("/v1/transactions")
        .add_header(axum::http::header::AUTHORIZATION, bearer(token))
        .json(&tx_payload(card_id, bucket))
        .await;

    let body: serde_json::Value = response.json();
    Uuid::parse_str(body["data"]["id"].as_str().unwrap()).unwrap()
}

// ── POST /v1/transactions ─────────────────────────────────────────────────

#[tokio::test]
async fn test_create_transaction_with_valid_payload_returns_201() {
    // Arrange
    let server = common::spawn_test_app().await;
    let token = register_and_login(&server, "tx-create").await;
    let card_id = create_test_card(&server, &token).await;

    // Act
    let response = server
        .post("/v1/transactions")
        .add_header(axum::http::header::AUTHORIZATION, bearer(&token))
        .json(&tx_payload(card_id, "2025-03"))
        .await;

    // Assert
    assert_eq!(
        response.status_code(),
        StatusCode::CREATED,
        "Expected 201 Created for valid transaction"
    );
    let body: serde_json::Value = response.json();
    assert!(body["data"]["id"].is_string(), "Response must include id");
    assert_eq!(body["data"]["card_id"], card_id.to_string());
    assert_eq!(body["data"]["timestamp_bucket"], "2025-03");
}

#[tokio::test]
async fn test_create_transaction_bulk_returns_201_with_array() {
    // Arrange
    let server = common::spawn_test_app().await;
    let token = register_and_login(&server, "tx-bulk").await;
    let card_id = create_test_card(&server, &token).await;

    let bulk = json!([
        tx_payload(card_id, "2025-01"),
        tx_payload(card_id, "2025-02"),
    ]);

    // Act
    let response = server
        .post("/v1/transactions")
        .add_header(axum::http::header::AUTHORIZATION, bearer(&token))
        .json(&bulk)
        .await;

    // Assert
    assert_eq!(
        response.status_code(),
        StatusCode::CREATED,
        "Expected 201 for bulk create"
    );
    let body: serde_json::Value = response.json();
    assert!(body["data"].is_array(), "Bulk response must be an array");
    assert_eq!(body["data"].as_array().unwrap().len(), 2);
}

#[tokio::test]
async fn test_create_transaction_without_auth_returns_401() {
    // Arrange
    let server = common::spawn_test_app().await;

    // Act
    let response = server
        .post("/v1/transactions")
        .json(&json!({
            "card_id": Uuid::new_v4(),
            "encrypted_data": "dHhkYXRh",
            "iv": "dHhpdjEyMzQ=",
            "auth_tag": "dHh0YWcxMjM0",
            "timestamp_bucket": "2025-03"
        }))
        .await;

    // Assert
    assert_eq!(
        response.status_code(),
        StatusCode::UNAUTHORIZED,
        "Expected 401 for missing auth"
    );
}

#[tokio::test]
async fn test_create_transaction_with_invalid_bucket_returns_422() {
    // Arrange
    let server = common::spawn_test_app().await;
    let token = register_and_login(&server, "tx-bad-bucket").await;
    let card_id = create_test_card(&server, &token).await;

    // Act
    let response = server
        .post("/v1/transactions")
        .add_header(axum::http::header::AUTHORIZATION, bearer(&token))
        .json(&tx_payload(card_id, "not-valid"))
        .await;

    // Assert
    assert_eq!(
        response.status_code(),
        StatusCode::UNPROCESSABLE_ENTITY,
        "Expected 422 for invalid timestamp_bucket"
    );
}

#[tokio::test]
async fn test_create_transaction_with_nonexistent_card_returns_404() {
    // Arrange
    let server = common::spawn_test_app().await;
    let token = register_and_login(&server, "tx-no-card").await;

    // Act
    let response = server
        .post("/v1/transactions")
        .add_header(axum::http::header::AUTHORIZATION, bearer(&token))
        .json(&tx_payload(Uuid::new_v4(), "2025-03"))
        .await;

    // Assert
    assert_eq!(
        response.status_code(),
        StatusCode::NOT_FOUND,
        "Expected 404 for nonexistent card"
    );
}

#[tokio::test]
async fn test_create_transaction_with_other_users_card_returns_403() {
    // Arrange — User A's card, User B tries to create tx
    let server = common::spawn_test_app().await;
    let token_a = register_and_login(&server, "tx-card-a").await;
    let token_b = register_and_login(&server, "tx-card-b").await;
    let card_id = create_test_card(&server, &token_a).await;

    // Act
    let response = server
        .post("/v1/transactions")
        .add_header(axum::http::header::AUTHORIZATION, bearer(&token_b))
        .json(&tx_payload(card_id, "2025-03"))
        .await;

    // Assert
    assert_eq!(
        response.status_code(),
        StatusCode::FORBIDDEN,
        "Expected 403 for using another user's card"
    );
}

// ── GET /v1/transactions ──────────────────────────────────────────────────

#[tokio::test]
async fn test_list_transactions_returns_200_with_array() {
    // Arrange
    let server = common::spawn_test_app().await;
    let token = register_and_login(&server, "tx-list").await;
    let card_id = create_test_card(&server, &token).await;
    create_test_tx(&server, &token, card_id, "2025-01").await;
    create_test_tx(&server, &token, card_id, "2025-02").await;

    // Act
    let response = server
        .get("/v1/transactions")
        .add_header(axum::http::header::AUTHORIZATION, bearer(&token))
        .await;

    // Assert
    assert_eq!(response.status_code(), StatusCode::OK);
    let body: serde_json::Value = response.json();
    assert_eq!(body["data"].as_array().unwrap().len(), 2);
}

#[tokio::test]
async fn test_list_transactions_without_auth_returns_401() {
    let server = common::spawn_test_app().await;
    let response = server.get("/v1/transactions").await;
    assert_eq!(response.status_code(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn test_list_transactions_filters_by_card_id() {
    // Arrange
    let server = common::spawn_test_app().await;
    let token = register_and_login(&server, "tx-filter-card").await;
    let card_a = create_test_card(&server, &token).await;
    let card_b = create_test_card(&server, &token).await;
    create_test_tx(&server, &token, card_a, "2025-03").await;
    create_test_tx(&server, &token, card_a, "2025-03").await;
    create_test_tx(&server, &token, card_b, "2025-03").await;

    // Act
    let response = server
        .get(&format!("/v1/transactions?card_id={card_a}"))
        .add_header(axum::http::header::AUTHORIZATION, bearer(&token))
        .await;

    // Assert
    let body: serde_json::Value = response.json();
    assert_eq!(
        body["data"].as_array().unwrap().len(),
        2,
        "Should only return transactions for card_a"
    );
}

#[tokio::test]
async fn test_list_transactions_filters_by_timestamp_bucket() {
    // Arrange
    let server = common::spawn_test_app().await;
    let token = register_and_login(&server, "tx-filter-bucket").await;
    let card_id = create_test_card(&server, &token).await;
    create_test_tx(&server, &token, card_id, "2025-01").await;
    create_test_tx(&server, &token, card_id, "2025-02").await;
    create_test_tx(&server, &token, card_id, "2025-02").await;

    // Act
    let response = server
        .get("/v1/transactions?timestamp_bucket=2025-02")
        .add_header(axum::http::header::AUTHORIZATION, bearer(&token))
        .await;

    // Assert
    let body: serde_json::Value = response.json();
    assert_eq!(
        body["data"].as_array().unwrap().len(),
        2,
        "Should only return transactions for 2025-02"
    );
}

#[tokio::test]
async fn test_list_transactions_returns_only_own_transactions() {
    // Arrange
    let server = common::spawn_test_app().await;
    let token_a = register_and_login(&server, "tx-own-a").await;
    let token_b = register_and_login(&server, "tx-own-b").await;
    let card_a = create_test_card(&server, &token_a).await;
    let card_b = create_test_card(&server, &token_b).await;
    create_test_tx(&server, &token_a, card_a, "2025-03").await;
    create_test_tx(&server, &token_b, card_b, "2025-03").await;

    // Act
    let response = server
        .get("/v1/transactions")
        .add_header(axum::http::header::AUTHORIZATION, bearer(&token_a))
        .await;

    // Assert
    let body: serde_json::Value = response.json();
    assert_eq!(
        body["data"].as_array().unwrap().len(),
        1,
        "User A should only see their own transaction"
    );
}

// ── PUT /v1/transactions/:id ──────────────────────────────────────────────

#[tokio::test]
async fn test_update_transaction_with_valid_payload_returns_200() {
    // Arrange
    let server = common::spawn_test_app().await;
    let token = register_and_login(&server, "tx-update").await;
    let card_id = create_test_card(&server, &token).await;
    let tx_id = create_test_tx(&server, &token, card_id, "2025-03").await;

    let updated = json!({
        "card_id": card_id,
        "encrypted_data": "dXBkYXRlZA==",
        "iv": "bmV3aXYxMjM0NTY=",
        "auth_tag": "bmV3dGFnMTIzNDU2",
        "timestamp_bucket": "2025-04"
    });

    // Act
    let response = server
        .put(&format!("/v1/transactions/{tx_id}"))
        .add_header(axum::http::header::AUTHORIZATION, bearer(&token))
        .json(&updated)
        .await;

    // Assert
    assert_eq!(
        response.status_code(),
        StatusCode::OK,
        "Expected 200 for valid update"
    );
    let body: serde_json::Value = response.json();
    assert_eq!(body["data"]["timestamp_bucket"], "2025-04");
    assert_eq!(body["data"]["encrypted_data"], "dXBkYXRlZA==");
}

#[tokio::test]
async fn test_update_transaction_without_auth_returns_401() {
    let server = common::spawn_test_app().await;
    let token = register_and_login(&server, "tx-update-noauth").await;
    let card_id = create_test_card(&server, &token).await;
    let tx_id = create_test_tx(&server, &token, card_id, "2025-03").await;

    let response = server
        .put(&format!("/v1/transactions/{tx_id}"))
        .json(&tx_payload(card_id, "2025-03"))
        .await;

    assert_eq!(response.status_code(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn test_update_transaction_not_found_returns_404() {
    let server = common::spawn_test_app().await;
    let token = register_and_login(&server, "tx-update-404").await;
    let card_id = create_test_card(&server, &token).await;

    let response = server
        .put(&format!("/v1/transactions/{}", Uuid::new_v4()))
        .add_header(axum::http::header::AUTHORIZATION, bearer(&token))
        .json(&tx_payload(card_id, "2025-03"))
        .await;

    assert_eq!(response.status_code(), StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn test_update_transaction_owned_by_another_user_returns_403() {
    // Arrange
    let server = common::spawn_test_app().await;
    let token_a = register_and_login(&server, "tx-upd-a").await;
    let token_b = register_and_login(&server, "tx-upd-b").await;
    let card_a = create_test_card(&server, &token_a).await;
    let card_b = create_test_card(&server, &token_b).await;
    let tx_id = create_test_tx(&server, &token_a, card_a, "2025-03").await;

    // Act — User B tries to update User A's transaction
    let response = server
        .put(&format!("/v1/transactions/{tx_id}"))
        .add_header(axum::http::header::AUTHORIZATION, bearer(&token_b))
        .json(&tx_payload(card_b, "2025-03"))
        .await;

    // Assert
    assert_eq!(
        response.status_code(),
        StatusCode::FORBIDDEN,
        "Expected 403 for ownership violation"
    );
}

#[tokio::test]
async fn test_update_transaction_with_invalid_bucket_returns_422() {
    let server = common::spawn_test_app().await;
    let token = register_and_login(&server, "tx-upd-bucket").await;
    let card_id = create_test_card(&server, &token).await;
    let tx_id = create_test_tx(&server, &token, card_id, "2025-03").await;

    let response = server
        .put(&format!("/v1/transactions/{tx_id}"))
        .add_header(axum::http::header::AUTHORIZATION, bearer(&token))
        .json(&tx_payload(card_id, "bad"))
        .await;

    assert_eq!(response.status_code(), StatusCode::UNPROCESSABLE_ENTITY);
}

// ── DELETE /v1/transactions/:id ───────────────────────────────────────────

#[tokio::test]
async fn test_delete_transaction_returns_204() {
    // Arrange
    let server = common::spawn_test_app().await;
    let token = register_and_login(&server, "tx-delete").await;
    let card_id = create_test_card(&server, &token).await;
    let tx_id = create_test_tx(&server, &token, card_id, "2025-03").await;

    // Act
    let response = server
        .delete(&format!("/v1/transactions/{tx_id}"))
        .add_header(axum::http::header::AUTHORIZATION, bearer(&token))
        .await;

    // Assert
    assert_eq!(
        response.status_code(),
        StatusCode::NO_CONTENT,
        "Expected 204 for successful delete"
    );

    // Verify transaction is gone
    let list = server
        .get("/v1/transactions")
        .add_header(axum::http::header::AUTHORIZATION, bearer(&token))
        .await;
    let body: serde_json::Value = list.json();
    assert_eq!(body["data"].as_array().unwrap().len(), 0);
}

#[tokio::test]
async fn test_delete_transaction_without_auth_returns_401() {
    let server = common::spawn_test_app().await;
    let token = register_and_login(&server, "tx-del-noauth").await;
    let card_id = create_test_card(&server, &token).await;
    let tx_id = create_test_tx(&server, &token, card_id, "2025-03").await;

    let response = server.delete(&format!("/v1/transactions/{tx_id}")).await;

    assert_eq!(response.status_code(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn test_delete_transaction_not_found_returns_404() {
    let server = common::spawn_test_app().await;
    let token = register_and_login(&server, "tx-del-404").await;

    let response = server
        .delete(&format!("/v1/transactions/{}", Uuid::new_v4()))
        .add_header(axum::http::header::AUTHORIZATION, bearer(&token))
        .await;

    assert_eq!(response.status_code(), StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn test_delete_transaction_owned_by_another_user_returns_403() {
    let server = common::spawn_test_app().await;
    let token_a = register_and_login(&server, "tx-del-a").await;
    let token_b = register_and_login(&server, "tx-del-b").await;
    let card_a = create_test_card(&server, &token_a).await;
    let tx_id = create_test_tx(&server, &token_a, card_a, "2025-03").await;

    let response = server
        .delete(&format!("/v1/transactions/{tx_id}"))
        .add_header(axum::http::header::AUTHORIZATION, bearer(&token_b))
        .await;

    assert_eq!(
        response.status_code(),
        StatusCode::FORBIDDEN,
        "Expected 403 for ownership violation"
    );
}
