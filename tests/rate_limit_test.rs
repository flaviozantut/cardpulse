mod common;

use axum::http::StatusCode;
use serde_json::json;

// ── Register rate limit ─────────────────────────────────────────────────────

#[tokio::test]
async fn test_register_exceeding_rate_limit_returns_429() {
    // Arrange
    let server = common::spawn_test_app().await;

    // Act — send 6 requests (limit is 5/min)
    for i in 0..5 {
        let email = common::unique_email(&format!("rl-reg-{i}"));
        let response = server
            .post("/auth/register")
            .json(&common::register_payload(&email))
            .await;

        assert_ne!(
            response.status_code(),
            StatusCode::TOO_MANY_REQUESTS,
            "Request {i} should not be rate limited"
        );
    }

    // 6th request should be rate limited
    let email = common::unique_email("rl-reg-over");
    let response = server
        .post("/auth/register")
        .json(&common::register_payload(&email))
        .await;

    // Assert
    assert_eq!(
        response.status_code(),
        StatusCode::TOO_MANY_REQUESTS,
        "Expected 429 after exceeding register rate limit"
    );
    let body: serde_json::Value = response.json();
    assert_eq!(body["error"]["code"], "TOO_MANY_REQUESTS");
}

// ── Login rate limit ────────────────────────────────────────────────────────

#[tokio::test]
async fn test_login_exceeding_rate_limit_returns_429() {
    // Arrange
    let server = common::spawn_test_app().await;

    // Act — send 11 requests (limit is 10/min)
    for i in 0..10 {
        let response = server
            .post("/auth/login")
            .json(&json!({
                "email": common::unique_email(&format!("rl-login-{i}")),
                "password": "whatever"
            }))
            .await;

        assert_ne!(
            response.status_code(),
            StatusCode::TOO_MANY_REQUESTS,
            "Request {i} should not be rate limited"
        );
    }

    // 11th request should be rate limited
    let response = server
        .post("/auth/login")
        .json(&json!({
            "email": common::unique_email("rl-login-over"),
            "password": "whatever"
        }))
        .await;

    // Assert
    assert_eq!(
        response.status_code(),
        StatusCode::TOO_MANY_REQUESTS,
        "Expected 429 after exceeding login rate limit"
    );
    let body: serde_json::Value = response.json();
    assert_eq!(body["error"]["code"], "TOO_MANY_REQUESTS");
}

// ── Rate limits are independent per endpoint ────────────────────────────────

#[tokio::test]
async fn test_register_rate_limit_does_not_affect_login() {
    // Arrange
    let server = common::spawn_test_app().await;

    // Exhaust register limit (5 requests)
    for i in 0..5 {
        let email = common::unique_email(&format!("rl-cross-reg-{i}"));
        server
            .post("/auth/register")
            .json(&common::register_payload(&email))
            .await;
    }

    // Act — login should still work (different limiter)
    let response = server
        .post("/auth/login")
        .json(&json!({
            "email": common::unique_email("rl-cross-login"),
            "password": "whatever"
        }))
        .await;

    // Assert — should get 401 (invalid creds), NOT 429
    assert_eq!(
        response.status_code(),
        StatusCode::UNAUTHORIZED,
        "Login rate limit should be independent from register"
    );
}
