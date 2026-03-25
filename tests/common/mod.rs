//! Shared test helpers and fixtures for integration tests.
//!
//! Provides functions to spawn a test server, create test users, cards,
//! and transactions, and build common payloads. All helpers use the
//! test database (`DATABASE_URL_TEST`) with automatic migration.

use axum::http::header::HeaderValue;
use axum_test::TestServer;
use cardpulse_api::{router::build_router, state::AppState};
use serde_json::json;
use sqlx::PgPool;
use uuid::Uuid;

const TEST_JWT_SECRET: &str = "ci-secret-minimum-64-chars-long-for-hs256-validation-in-tests-ok";
const TEST_JWT_EXPIRATION_HOURS: u64 = 24;

// ─── App setup ──────────────────────────────────────────────────────────────

/// Returns a [`PgPool`] connected to the test database with all migrations run.
///
/// Reads `DATABASE_URL_TEST` from the environment (set in `.env`).
pub async fn test_pool() -> PgPool {
    dotenvy::dotenv().ok();
    let url = std::env::var("DATABASE_URL_TEST")
        .expect("DATABASE_URL_TEST must be set for integration tests");
    cardpulse_api::db::init_pool(&url)
        .await
        .expect("failed to connect to test database")
}

/// Spawns an in-process test server backed by the given pool.
pub async fn spawn_test_app_with_state(pool: PgPool) -> TestServer {
    let state = AppState::new(
        pool,
        TEST_JWT_SECRET.to_string(),
        TEST_JWT_EXPIRATION_HOURS,
        vec!["http://localhost:3000".to_string()],
    );
    let app = build_router(state);
    TestServer::new(app).expect("failed to create test server")
}

/// Spawns an in-process test server connected to the test database.
pub async fn spawn_test_app() -> TestServer {
    let pool = test_pool().await;
    spawn_test_app_with_state(pool).await
}

// ─── Test isolation ─────────────────────────────────────────────────────────

/// Truncates all application tables to ensure test isolation.
///
/// Call this at the beginning of tests that require a clean database state.
/// Uses `CASCADE` to handle foreign key constraints.
pub async fn cleanup_tables(pool: &PgPool) {
    sqlx::query("TRUNCATE TABLE transactions, cards, users CASCADE")
        .execute(pool)
        .await
        .expect("failed to truncate test tables");
}

// ─── Auth helpers ───────────────────────────────────────────────────────────

/// Generates a unique email for each test run to avoid conflicts.
pub fn unique_email(prefix: &str) -> String {
    format!("{prefix}+{}@example.com", Uuid::new_v4())
}

/// Builds a registration payload with the given email.
pub fn register_payload(email: &str) -> serde_json::Value {
    json!({
        "email": email,
        "password": "testpassword123",
        "wrapped_dek": "aGVsbG8gd29ybGQ=",
        "dek_salt": "c2FsdHNhbHQ=",
        "dek_params": "{\"m\":65536,\"t\":3,\"p\":1}"
    })
}

/// Formats a Bearer token as an `Authorization` header value.
pub fn bearer(token: &str) -> HeaderValue {
    format!("Bearer {token}").parse().unwrap()
}

/// Registers a user and logs in, returning the JWT token.
///
/// Uses `prefix` to generate a unique email for this test invocation.
pub async fn create_test_user_and_login(server: &TestServer, prefix: &str) -> String {
    let email = unique_email(prefix);
    server
        .post("/auth/register")
        .json(&register_payload(&email))
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

// ─── Card helpers ───────────────────────────────────────────────────────────

/// Builds a card creation payload with valid base64-encoded encrypted fields.
pub fn card_payload() -> serde_json::Value {
    json!({
        "encrypted_data": "aGVsbG8gd29ybGQ=",
        "iv": "c29tZWl2MTIzNA==",
        "auth_tag": "dGFnMTIzNDU2Nzg="
    })
}

/// Creates a card for the authenticated user and returns its UUID.
pub async fn create_test_card(server: &TestServer, token: &str) -> Uuid {
    let response = server
        .post("/v1/cards")
        .add_header(axum::http::header::AUTHORIZATION, bearer(token))
        .json(&card_payload())
        .await;

    let body: serde_json::Value = response.json();
    Uuid::parse_str(body["data"]["id"].as_str().unwrap()).unwrap()
}

// ─── Transaction helpers ────────────────────────────────────────────────────

/// Builds a transaction creation payload for the given card and bucket.
pub fn tx_payload(card_id: Uuid, bucket: &str) -> serde_json::Value {
    json!({
        "card_id": card_id,
        "encrypted_data": "dHhkYXRh",
        "iv": "dHhpdjEyMzQ=",
        "auth_tag": "dHh0YWcxMjM0",
        "timestamp_bucket": bucket
    })
}

/// Creates a transaction for the authenticated user and returns its UUID.
pub async fn create_test_transaction(
    server: &TestServer,
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
