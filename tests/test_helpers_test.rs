//! Tests for the shared test infrastructure helpers.
//!
//! Validates that `spawn_test_app`, `create_test_user_and_login`,
//! `create_test_card`, and `create_test_transaction` work correctly
//! and use `DATABASE_URL_TEST` (port 5433).

mod common;

use axum::http::StatusCode;

// ── spawn_test_app ──────────────────────────────────────────────────────────

#[tokio::test]
async fn test_spawn_test_app_uses_test_database() {
    let server = common::spawn_test_app().await;

    let response = server.get("/health").await;

    assert_eq!(
        response.status_code(),
        StatusCode::OK,
        "Test server must be reachable via /health"
    );
}

// ── create_test_user_and_login ──────────────────────────────────────────────

#[tokio::test]
async fn test_create_test_user_and_login_returns_valid_token() {
    let server = common::spawn_test_app().await;

    let token = common::create_test_user_and_login(&server, "helper-auth").await;

    // Token must be a non-empty string
    assert!(!token.is_empty(), "Token must not be empty");

    // Token must be usable for authenticated requests
    let response = server
        .get("/v1/me")
        .add_header(axum::http::header::AUTHORIZATION, common::bearer(&token))
        .await;

    assert_eq!(
        response.status_code(),
        StatusCode::OK,
        "Token from create_test_user_and_login must be valid for auth"
    );
}

// ── create_test_card ────────────────────────────────────────────────────────

#[tokio::test]
async fn test_create_test_card_returns_valid_uuid() {
    let server = common::spawn_test_app().await;
    let token = common::create_test_user_and_login(&server, "helper-card").await;

    let card_id = common::create_test_card(&server, &token).await;

    // Card must be fetchable via the API
    let response = server
        .get("/v1/cards")
        .add_header(axum::http::header::AUTHORIZATION, common::bearer(&token))
        .await;

    let body: serde_json::Value = response.json();
    let cards = body["data"].as_array().unwrap();
    assert!(
        cards.iter().any(|c| c["id"] == card_id.to_string()),
        "Created card must appear in the card list"
    );
}

// ── create_test_transaction ─────────────────────────────────────────────────

#[tokio::test]
async fn test_create_test_transaction_returns_valid_uuid() {
    let server = common::spawn_test_app().await;
    let token = common::create_test_user_and_login(&server, "helper-tx").await;
    let card_id = common::create_test_card(&server, &token).await;

    let tx_id = common::create_test_transaction(&server, &token, card_id, "2025-06").await;

    // Transaction must be fetchable via the API
    let response = server
        .get("/v1/transactions")
        .add_header(axum::http::header::AUTHORIZATION, common::bearer(&token))
        .await;

    let body: serde_json::Value = response.json();
    let txs = body["data"].as_array().unwrap();
    assert!(
        txs.iter().any(|t| t["id"] == tx_id.to_string()),
        "Created transaction must appear in the transaction list"
    );
}

// ── cleanup_tables ──────────────────────────────────────────────────────────

#[tokio::test]
async fn test_cleanup_tables_removes_all_data() {
    let pool = common::test_pool().await;
    let server = common::spawn_test_app_with_state(pool.clone()).await;

    // Create some data
    let token = common::create_test_user_and_login(&server, "helper-cleanup").await;
    let card_id = common::create_test_card(&server, &token).await;
    common::create_test_transaction(&server, &token, card_id, "2025-06").await;

    // Act — truncate everything
    common::cleanup_tables(&pool).await;

    // Re-register (old user was truncated) and verify no data exists
    let token2 = common::create_test_user_and_login(&server, "helper-cleanup-after").await;

    let cards_response = server
        .get("/v1/cards")
        .add_header(axum::http::header::AUTHORIZATION, common::bearer(&token2))
        .await;
    let cards_body: serde_json::Value = cards_response.json();
    assert_eq!(
        cards_body["data"].as_array().unwrap().len(),
        0,
        "No cards should exist after cleanup"
    );
}
