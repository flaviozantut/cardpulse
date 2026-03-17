---
description: TDD workflow and testing standards
globs: tests/**/*.rs, src/**/*test*.rs
---

# Testing rules

## TDD is mandatory — not optional

When receiving any implementation task:

1. **First:** ask "what behavior are we testing?"
2. **Second:** write the test that validates that behavior
3. **Third:** run `cargo test` — confirm it FAILS
4. **Fourth:** implement the minimum to make the test pass
5. **Fifth:** run `cargo test` — confirm it PASSES
6. **Sixth:** refactor if needed, keeping tests green

If at any point you find yourself writing production code without a failing test, STOP and go back to step 1.

## Naming

```
test_<action>_<condition>_<result>
```

Examples:
- `test_register_with_valid_email_returns_201`
- `test_register_with_duplicate_email_returns_409`
- `test_login_with_wrong_password_returns_401`
- `test_create_transaction_without_auth_returns_401`
- `test_list_transactions_filters_by_bucket`

## Test structure

Use the Arrange-Act-Assert pattern with visual separation:

```rust
#[tokio::test]
async fn test_example() {
    // Arrange
    let app = spawn_test_app().await;
    let token = create_test_user_and_login(&app).await;

    // Act
    let response = app
        .get("/v1/transactions")
        .header("Authorization", format!("Bearer {token}"))
        .await;

    // Assert
    assert_eq!(response.status(), StatusCode::OK);
    let body: serde_json::Value = response.json().await;
    assert!(body["data"].is_array());
}
```

## Minimum coverage per endpoint

Each endpoint MUST have at least these scenarios tested:

- Happy path (2xx)
- Missing authentication (401)
- Expired/invalid token (401)
- Invalid/incomplete payload (422)
- Resource not found (404) — when applicable
- Resource owned by another user (403) — ownership check

## Test helpers (`tests/common/mod.rs`)

Helper functions that MUST exist:
- `spawn_test_app()` — starts app with test database, returns client
- `create_test_user_and_login()` — registers user + returns JWT token
- `create_test_card()` — creates a test card and returns its ID
- `create_test_transaction()` — creates a test transaction
- Each helper cleans up data via transaction rollback or truncate

## Assertions

- Use `assert_eq!` with messages: `assert_eq!(status, 201, "Expected 201 Created for valid transaction")`
- For JSON bodies, parse to `serde_json::Value` and validate specific fields
- Do not compare full JSON — compare relevant fields to avoid brittle tests
- For error tests, validate both the status code and the `error.code` field in the body
