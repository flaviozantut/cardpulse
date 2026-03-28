mod common;

use axum::http::StatusCode;
use serde_json::json;

// ── GET /v1/sync/export ───────────────────────────────────────────────────────

#[tokio::test]
async fn test_export_without_auth_returns_401() {
    // Arrange
    let server = common::spawn_test_app().await;

    // Act
    let response = server.get("/v1/sync/export").await;

    // Assert
    assert_eq!(
        response.status_code(),
        StatusCode::UNAUTHORIZED,
        "Expected 401 Unauthorized without auth"
    );
}

#[tokio::test]
async fn test_export_with_no_data_returns_empty_arrays() {
    // Arrange
    let server = common::spawn_test_app().await;
    let token = common::create_test_user_and_login(&server, "export-empty").await;

    // Act
    let response = server
        .get("/v1/sync/export")
        .add_header(axum::http::header::AUTHORIZATION, common::bearer(&token))
        .await;

    // Assert
    assert_eq!(
        response.status_code(),
        StatusCode::OK,
        "Expected 200 OK for export"
    );
    let body: serde_json::Value = response.json();
    assert!(
        body["data"]["cards"].is_array(),
        "Response must include cards array"
    );
    assert!(
        body["data"]["transactions"].is_array(),
        "Response must include transactions array"
    );
    assert_eq!(
        body["data"]["cards"].as_array().unwrap().len(),
        0,
        "Cards array should be empty"
    );
    assert_eq!(
        body["data"]["transactions"].as_array().unwrap().len(),
        0,
        "Transactions array should be empty"
    );
    assert!(
        body["data"]["exported_at"].is_string(),
        "Response must include exported_at timestamp"
    );
}

#[tokio::test]
async fn test_export_returns_all_user_cards_and_transactions() {
    // Arrange
    let server = common::spawn_test_app().await;
    let token = common::create_test_user_and_login(&server, "export-data").await;
    let card_id = common::create_test_card(&server, &token).await;
    common::create_test_transaction(&server, &token, card_id, "2025-01").await;
    common::create_test_transaction(&server, &token, card_id, "2025-02").await;

    // Act
    let response = server
        .get("/v1/sync/export")
        .add_header(axum::http::header::AUTHORIZATION, common::bearer(&token))
        .await;

    // Assert
    assert_eq!(response.status_code(), StatusCode::OK);
    let body: serde_json::Value = response.json();
    assert_eq!(
        body["data"]["cards"].as_array().unwrap().len(),
        1,
        "Export must include 1 card"
    );
    assert_eq!(
        body["data"]["transactions"].as_array().unwrap().len(),
        2,
        "Export must include 2 transactions"
    );

    // Verify encrypted fields are present and base64-encoded
    let card = &body["data"]["cards"][0];
    assert!(card["encrypted_data"].is_string());
    assert!(card["iv"].is_string());
    assert!(card["auth_tag"].is_string());

    let tx = &body["data"]["transactions"][0];
    assert!(tx["encrypted_data"].is_string());
    assert!(tx["iv"].is_string());
    assert!(tx["auth_tag"].is_string());
    assert!(tx["timestamp_bucket"].is_string());
}

#[tokio::test]
async fn test_export_only_returns_data_belonging_to_authenticated_user() {
    // Arrange
    let server = common::spawn_test_app().await;
    let token_a = common::create_test_user_and_login(&server, "export-user-a").await;
    let token_b = common::create_test_user_and_login(&server, "export-user-b").await;

    // User A creates a card and transaction
    let card_id = common::create_test_card(&server, &token_a).await;
    common::create_test_transaction(&server, &token_a, card_id, "2025-03").await;

    // Act — user B exports
    let response = server
        .get("/v1/sync/export")
        .add_header(axum::http::header::AUTHORIZATION, common::bearer(&token_b))
        .await;

    // Assert — user B sees no data
    assert_eq!(response.status_code(), StatusCode::OK);
    let body: serde_json::Value = response.json();
    assert_eq!(
        body["data"]["cards"].as_array().unwrap().len(),
        0,
        "User B must not see user A's cards"
    );
    assert_eq!(
        body["data"]["transactions"].as_array().unwrap().len(),
        0,
        "User B must not see user A's transactions"
    );
}

// ── POST /v1/sync/import ─────────────────────────────────────────────────────

#[tokio::test]
async fn test_import_without_auth_returns_401() {
    // Arrange
    let server = common::spawn_test_app().await;

    // Act
    let response = server
        .post("/v1/sync/import")
        .json(&json!({ "cards": [], "transactions": [] }))
        .await;

    // Assert
    assert_eq!(
        response.status_code(),
        StatusCode::UNAUTHORIZED,
        "Expected 401 Unauthorized without auth"
    );
}

#[tokio::test]
async fn test_import_empty_payload_returns_200_with_zero_counts() {
    // Arrange
    let server = common::spawn_test_app().await;
    let token = common::create_test_user_and_login(&server, "import-empty").await;

    // Act
    let response = server
        .post("/v1/sync/import")
        .add_header(axum::http::header::AUTHORIZATION, common::bearer(&token))
        .json(&json!({ "cards": [], "transactions": [] }))
        .await;

    // Assert
    assert_eq!(
        response.status_code(),
        StatusCode::OK,
        "Expected 200 OK for empty import"
    );
    let body: serde_json::Value = response.json();
    assert_eq!(body["data"]["cards_imported"], 0);
    assert_eq!(body["data"]["transactions_imported"], 0);
}

#[tokio::test]
async fn test_import_with_cards_and_transactions_creates_all_records() {
    // Arrange
    let server = common::spawn_test_app().await;
    let token = common::create_test_user_and_login(&server, "import-full").await;

    let original_card_id = uuid::Uuid::new_v4();
    let payload = json!({
        "cards": [
            {
                "original_id": original_card_id,
                "encrypted_data": "aGVsbG8gd29ybGQ=",
                "iv": "c29tZWl2MTIzNA==",
                "auth_tag": "dGFnMTIzNDU2Nzg="
            }
        ],
        "transactions": [
            {
                "card_id": original_card_id,
                "encrypted_data": "dHhkYXRh",
                "iv": "dHhpdjEyMzQ=",
                "auth_tag": "dHh0YWcxMjM0",
                "timestamp_bucket": "2025-03"
            },
            {
                "card_id": original_card_id,
                "encrypted_data": "dHhkYXRh",
                "iv": "dHhpdjEyMzQ=",
                "auth_tag": "dHh0YWcxMjM0",
                "timestamp_bucket": "2025-04"
            }
        ]
    });

    // Act
    let response = server
        .post("/v1/sync/import")
        .add_header(axum::http::header::AUTHORIZATION, common::bearer(&token))
        .json(&payload)
        .await;

    // Assert
    assert_eq!(
        response.status_code(),
        StatusCode::OK,
        "Expected 200 OK for valid import"
    );
    let body: serde_json::Value = response.json();
    assert_eq!(
        body["data"]["cards_imported"],
        1,
        "Expected 1 card imported"
    );
    assert_eq!(
        body["data"]["transactions_imported"],
        2,
        "Expected 2 transactions imported"
    );

    // Verify the data actually exists via export
    let export_response = server
        .get("/v1/sync/export")
        .add_header(axum::http::header::AUTHORIZATION, common::bearer(&token))
        .await;
    let export_body: serde_json::Value = export_response.json();
    assert_eq!(export_body["data"]["cards"].as_array().unwrap().len(), 1);
    assert_eq!(
        export_body["data"]["transactions"].as_array().unwrap().len(),
        2
    );
}

#[tokio::test]
async fn test_import_with_unknown_card_id_in_transaction_returns_422() {
    // Arrange
    let server = common::spawn_test_app().await;
    let token = common::create_test_user_and_login(&server, "import-bad-card").await;

    let payload = json!({
        "cards": [],
        "transactions": [
            {
                "card_id": uuid::Uuid::new_v4(),
                "encrypted_data": "dHhkYXRh",
                "iv": "dHhpdjEyMzQ=",
                "auth_tag": "dHh0YWcxMjM0",
                "timestamp_bucket": "2025-03"
            }
        ]
    });

    // Act
    let response = server
        .post("/v1/sync/import")
        .add_header(axum::http::header::AUTHORIZATION, common::bearer(&token))
        .json(&payload)
        .await;

    // Assert
    assert_eq!(
        response.status_code(),
        StatusCode::UNPROCESSABLE_ENTITY,
        "Expected 422 when transaction references unknown card_id"
    );
    let body: serde_json::Value = response.json();
    assert_eq!(body["error"]["code"], "VALIDATION_ERROR");
}

#[tokio::test]
async fn test_import_with_invalid_base64_returns_422() {
    // Arrange
    let server = common::spawn_test_app().await;
    let token = common::create_test_user_and_login(&server, "import-invalid-b64").await;

    let payload = json!({
        "cards": [
            {
                "original_id": uuid::Uuid::new_v4(),
                "encrypted_data": "not!valid@base64",
                "iv": "c29tZWl2MTIzNA==",
                "auth_tag": "dGFnMTIzNDU2Nzg="
            }
        ],
        "transactions": []
    });

    // Act
    let response = server
        .post("/v1/sync/import")
        .add_header(axum::http::header::AUTHORIZATION, common::bearer(&token))
        .json(&payload)
        .await;

    // Assert
    assert_eq!(
        response.status_code(),
        StatusCode::UNPROCESSABLE_ENTITY,
        "Expected 422 for invalid base64 in card"
    );
    let body: serde_json::Value = response.json();
    assert_eq!(body["error"]["code"], "VALIDATION_ERROR");
}

#[tokio::test]
async fn test_import_with_invalid_timestamp_bucket_returns_422() {
    // Arrange
    let server = common::spawn_test_app().await;
    let token = common::create_test_user_and_login(&server, "import-bad-bucket").await;

    let original_card_id = uuid::Uuid::new_v4();
    let payload = json!({
        "cards": [
            {
                "original_id": original_card_id,
                "encrypted_data": "aGVsbG8gd29ybGQ=",
                "iv": "c29tZWl2MTIzNA==",
                "auth_tag": "dGFnMTIzNDU2Nzg="
            }
        ],
        "transactions": [
            {
                "card_id": original_card_id,
                "encrypted_data": "dHhkYXRh",
                "iv": "dHhpdjEyMzQ=",
                "auth_tag": "dHh0YWcxMjM0",
                "timestamp_bucket": "not-a-bucket"
            }
        ]
    });

    // Act
    let response = server
        .post("/v1/sync/import")
        .add_header(axum::http::header::AUTHORIZATION, common::bearer(&token))
        .json(&payload)
        .await;

    // Assert
    assert_eq!(
        response.status_code(),
        StatusCode::UNPROCESSABLE_ENTITY,
        "Expected 422 for invalid timestamp_bucket"
    );
    let body: serde_json::Value = response.json();
    assert_eq!(body["error"]["code"], "VALIDATION_ERROR");
}
