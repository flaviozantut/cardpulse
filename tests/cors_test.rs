mod common;

use axum::http::{HeaderValue, StatusCode};

// ── Allowed origin ──────────────────────────────────────────────────────────

#[tokio::test]
async fn test_cors_preflight_with_allowed_origin_returns_200() {
    // Arrange
    let server = common::spawn_test_app().await;

    // Act — OPTIONS preflight from allowed origin
    let response = server
        .method(axum::http::Method::OPTIONS, "/auth/login")
        .add_header(
            axum::http::header::ORIGIN,
            HeaderValue::from_static("http://localhost:3000"),
        )
        .add_header(
            axum::http::header::ACCESS_CONTROL_REQUEST_METHOD,
            HeaderValue::from_static("POST"),
        )
        .add_header(
            axum::http::header::ACCESS_CONTROL_REQUEST_HEADERS,
            HeaderValue::from_static("authorization,content-type"),
        )
        .await;

    // Assert
    assert_eq!(
        response.status_code(),
        StatusCode::OK,
        "Preflight from allowed origin should succeed"
    );
    let acao = response.header("access-control-allow-origin");
    assert_eq!(acao, "http://localhost:3000");
}

#[tokio::test]
async fn test_cors_allows_get_post_put_delete_methods() {
    // Arrange
    let server = common::spawn_test_app().await;

    // Act
    let response = server
        .method(axum::http::Method::OPTIONS, "/v1/cards")
        .add_header(
            axum::http::header::ORIGIN,
            HeaderValue::from_static("http://localhost:3000"),
        )
        .add_header(
            axum::http::header::ACCESS_CONTROL_REQUEST_METHOD,
            HeaderValue::from_static("PUT"),
        )
        .await;

    // Assert
    let methods = response.header("access-control-allow-methods");
    let methods_str = methods.to_str().unwrap();
    for method in ["GET", "POST", "PUT", "DELETE"] {
        assert!(
            methods_str.contains(method),
            "CORS should allow {method}, got: {methods_str}"
        );
    }
}

#[tokio::test]
async fn test_cors_allows_authorization_and_content_type_headers() {
    // Arrange
    let server = common::spawn_test_app().await;

    // Act
    let response = server
        .method(axum::http::Method::OPTIONS, "/v1/cards")
        .add_header(
            axum::http::header::ORIGIN,
            HeaderValue::from_static("http://localhost:3000"),
        )
        .add_header(
            axum::http::header::ACCESS_CONTROL_REQUEST_METHOD,
            HeaderValue::from_static("POST"),
        )
        .add_header(
            axum::http::header::ACCESS_CONTROL_REQUEST_HEADERS,
            HeaderValue::from_static("authorization,content-type"),
        )
        .await;

    // Assert
    let headers = response.header("access-control-allow-headers");
    let headers_str = headers.to_str().unwrap().to_lowercase();
    assert!(
        headers_str.contains("authorization"),
        "CORS should allow authorization header, got: {headers_str}"
    );
    assert!(
        headers_str.contains("content-type"),
        "CORS should allow content-type header, got: {headers_str}"
    );
}

// ── Disallowed origin ───────────────────────────────────────────────────────

#[tokio::test]
async fn test_cors_preflight_with_disallowed_origin_omits_acao_header() {
    // Arrange
    let server = common::spawn_test_app().await;

    // Act — OPTIONS preflight from a non-allowed origin
    let response = server
        .method(axum::http::Method::OPTIONS, "/auth/login")
        .add_header(
            axum::http::header::ORIGIN,
            HeaderValue::from_static("https://evil.example.com"),
        )
        .add_header(
            axum::http::header::ACCESS_CONTROL_REQUEST_METHOD,
            HeaderValue::from_static("POST"),
        )
        .await;

    // Assert — no access-control-allow-origin header should be present
    let acao = response.maybe_header("access-control-allow-origin");
    assert!(
        acao.is_none(),
        "Disallowed origin should not receive ACAO header"
    );
}
