---
description: Create a new REST endpoint following the CardPulse architecture
---

# Skill: Create API Endpoint

Workflow for creating a complete endpoint in the CardPulse API, respecting the layered architecture.

## File checklist

For a new endpoint, touch these files in this order:

1. **Integration test** (`tests/<domain>_test.rs`) — TDD: write first
2. **Model** (`src/models/<domain>.rs`) — request/response structs
3. **Repository trait** (`src/repositories/traits.rs`) — add methods to the trait
4. **Repository impl** (`src/repositories/<domain>_repo.rs`) — implementation with sqlx
5. **Handler** (`src/handlers/<domain>.rs`) — orchestration
6. **Routes** (`src/routes.rs`) — register the route

## Endpoint anatomy

### Model (request)

```rust
/// Request body to create an encrypted transaction.
///
/// The `encrypted_data` field contains the AES-256-GCM encrypted payload.
/// The server does not validate or decrypt the content.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct CreateTransaction {
    pub card_id: Uuid,
    pub encrypted_data: String, // base64-encoded ciphertext
    pub iv: String,             // base64-encoded IV (96-bit)
    pub auth_tag: String,       // base64-encoded GCM auth tag
    pub timestamp_bucket: String, // "YYYY-MM"
}
```

### Repository trait

```rust
#[async_trait]
pub trait TransactionRepository: Send + Sync {
    async fn create(&self, user_id: UserId, input: CreateTransaction) -> Result<Transaction, AppError>;
    async fn find_by_id(&self, user_id: UserId, id: TransactionId) -> Result<Option<Transaction>, AppError>;
    async fn list(&self, user_id: UserId, bucket: Option<&str>) -> Result<Vec<Transaction>, AppError>;
    async fn delete(&self, user_id: UserId, id: TransactionId) -> Result<bool, AppError>;
}
```

### Handler

```rust
/// Creates a new encrypted transaction.
///
/// # Responses
/// - 201: transaction created successfully
/// - 401: not authenticated
/// - 422: invalid payload
pub async fn create_transaction(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Json(input): Json<CreateTransaction>,
) -> Result<impl IntoResponse, AppError> {
    let transaction = state.transaction_repo.create(user_id, input).await?;
    Ok((StatusCode::CREATED, Json(json!({ "data": transaction }))))
}
```

### Route registration

```rust
// In routes.rs
Router::new()
    .route("/v1/transactions", post(create_transaction).get(list_transactions))
    .route("/v1/transactions/:id", get(get_transaction).delete(delete_transaction))
    .layer(auth_middleware)
```

## Required validations

- `timestamp_bucket` must match "YYYY-MM" format (regex: `^\d{4}-(0[1-9]|1[0-2])$`)
- `encrypted_data`, `iv`, `auth_tag` must be valid base64
- `card_id` must exist and belong to the authenticated user
- Return 422 with a descriptive error for each failed validation

## After implementing

- Run `cargo test` — all green
- Run `cargo clippy -- -D warnings` — clean
- Run `cargo fmt`
- Document the endpoint in README.md
