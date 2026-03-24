//! Transaction CRUD handlers.
//!
//! # Endpoints
//! - `POST /v1/transactions`      — create one or many transactions
//! - `GET /v1/transactions`       — list with optional `card_id` and `timestamp_bucket` filters
//! - `PUT /v1/transactions/:id`   — update a transaction
//! - `DELETE /v1/transactions/:id` — delete a transaction

use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use base64::{engine::general_purpose::STANDARD, Engine};
use serde::Deserialize;
use serde_json::json;
use uuid::Uuid;

use crate::{
    auth::middleware::AuthUser,
    error::AppError,
    models::transaction::{CreateTransaction, TransactionResponse},
    repositories::{
        card_repo::PgCardRepository,
        traits::{
            CardRepository, NewTransaction, TransactionFilters, TransactionRepository,
            UpdateTransaction,
        },
        transaction_repo::PgTransactionRepository,
    },
    state::AppState,
    validation::{validate_base64, validate_timestamp_bucket},
};

/// Builds a [`TransactionResponse`] from a domain [`Transaction`].
fn tx_to_response(tx: crate::models::transaction::Transaction) -> TransactionResponse {
    TransactionResponse {
        id: tx.id,
        user_id: tx.user_id,
        card_id: tx.card_id,
        encrypted_data: STANDARD.encode(&tx.encrypted_data),
        iv: STANDARD.encode(&tx.iv),
        auth_tag: STANDARD.encode(&tx.auth_tag),
        timestamp_bucket: tx.timestamp_bucket,
        created_at: tx.created_at,
    }
}

/// Verifies that `card_id` exists and belongs to `user_id`.
async fn verify_card_ownership(
    pool: &sqlx::PgPool,
    card_id: Uuid,
    user_id: Uuid,
) -> Result<(), AppError> {
    let card_repo = PgCardRepository::new(pool.clone());
    let card = card_repo.find_by_id(card_id).await?;
    if card.user_id != user_id {
        return Err(AppError::Forbidden(
            "card does not belong to the authenticated user".into(),
        ));
    }
    Ok(())
}

/// Request body for bulk or single transaction creation.
///
/// Accepts either a single `CreateTransaction` or an array of them.
#[derive(Debug, Deserialize)]
#[serde(untagged)]
pub enum CreateTransactionPayload {
    /// A list of transactions to create.
    Bulk(Vec<CreateTransaction>),
    /// A single transaction to create.
    Single(CreateTransaction),
}

/// `POST /v1/transactions` — create one or many encrypted transactions.
///
/// Accepts either a single transaction object or an array for bulk creation.
///
/// # Responses
/// - `201 Created` — `{ "data": { ... } }` or `{ "data": [ ... ] }`
/// - `401 Unauthorized` — missing or invalid token
/// - `403 Forbidden` — card does not belong to the user
/// - `404 Not Found` — card does not exist
/// - `422 Unprocessable Entity` — invalid payload or timestamp_bucket
pub async fn create_transaction(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Json(payload): Json<CreateTransactionPayload>,
) -> Result<impl IntoResponse, AppError> {
    let items = match payload {
        CreateTransactionPayload::Single(item) => vec![item],
        CreateTransactionPayload::Bulk(items) => items,
    };

    if items.is_empty() {
        return Err(AppError::ValidationError(
            "at least one transaction is required".into(),
        ));
    }

    let repo = PgTransactionRepository::new(state.pool.clone());
    let mut responses = Vec::with_capacity(items.len());

    for item in &items {
        validate_timestamp_bucket(&item.timestamp_bucket)?;
        verify_card_ownership(&state.pool, item.card_id, user_id.0).await?;
    }

    for item in items {
        let encrypted_data = validate_base64(&item.encrypted_data, "encrypted_data")?;
        let iv = validate_base64(&item.iv, "iv")?;
        let auth_tag = validate_base64(&item.auth_tag, "auth_tag")?;
        let tx = repo
            .create(NewTransaction {
                user_id: user_id.0,
                card_id: item.card_id,
                encrypted_data,
                iv,
                auth_tag,
                timestamp_bucket: item.timestamp_bucket,
            })
            .await?;
        responses.push(tx_to_response(tx));
    }

    if responses.len() == 1 {
        Ok((
            StatusCode::CREATED,
            Json(json!({ "data": responses.into_iter().next().unwrap() })),
        ))
    } else {
        Ok((StatusCode::CREATED, Json(json!({ "data": responses }))))
    }
}

/// Query parameters for listing transactions.
#[derive(Debug, Deserialize)]
pub struct ListTransactionsQuery {
    pub card_id: Option<Uuid>,
    pub timestamp_bucket: Option<String>,
}

/// `GET /v1/transactions` — list transactions with optional filters.
///
/// # Query parameters
/// - `card_id` — filter by card UUID
/// - `timestamp_bucket` — filter by "YYYY-MM" bucket
///
/// # Responses
/// - `200 OK` — `{ "data": [ ... ] }`
/// - `401 Unauthorized` — missing or invalid token
/// - `422 Unprocessable Entity` — invalid timestamp_bucket format
pub async fn list_transactions(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Query(query): Query<ListTransactionsQuery>,
) -> Result<impl IntoResponse, AppError> {
    if let Some(ref bucket) = query.timestamp_bucket {
        validate_timestamp_bucket(bucket)?;
    }

    let repo = PgTransactionRepository::new(state.pool);
    let txs = repo
        .find_all_by_user_id(
            user_id.0,
            TransactionFilters {
                card_id: query.card_id,
                timestamp_bucket: query.timestamp_bucket,
            },
        )
        .await?;

    let data: Vec<TransactionResponse> = txs.into_iter().map(tx_to_response).collect();

    Ok(Json(json!({ "data": data })))
}

/// `PUT /v1/transactions/:id` — update an existing transaction.
///
/// # Responses
/// - `200 OK` — `{ "data": { ... } }`
/// - `401 Unauthorized` — missing or invalid token
/// - `403 Forbidden` — transaction belongs to another user
/// - `404 Not Found` — transaction does not exist
/// - `422 Unprocessable Entity` — invalid payload or timestamp_bucket
pub async fn update_transaction(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Path(id): Path<Uuid>,
    Json(payload): Json<CreateTransaction>,
) -> Result<impl IntoResponse, AppError> {
    validate_timestamp_bucket(&payload.timestamp_bucket)?;

    let repo = PgTransactionRepository::new(state.pool.clone());

    // Ownership check
    let existing = repo.find_by_id(id).await?;
    if existing.user_id != user_id.0 {
        return Err(AppError::Forbidden(
            "you do not have access to this transaction".into(),
        ));
    }

    // Verify new card_id ownership if changed
    if payload.card_id != existing.card_id {
        verify_card_ownership(&state.pool, payload.card_id, user_id.0).await?;
    }

    let encrypted_data = validate_base64(&payload.encrypted_data, "encrypted_data")?;
    let iv = validate_base64(&payload.iv, "iv")?;
    let auth_tag = validate_base64(&payload.auth_tag, "auth_tag")?;
    let tx = repo
        .update(
            id,
            UpdateTransaction {
                encrypted_data,
                iv,
                auth_tag,
                timestamp_bucket: payload.timestamp_bucket,
            },
        )
        .await?;

    Ok(Json(json!({ "data": tx_to_response(tx) })))
}

/// `DELETE /v1/transactions/:id` — delete a transaction.
///
/// # Responses
/// - `204 No Content`
/// - `401 Unauthorized` — missing or invalid token
/// - `403 Forbidden` — transaction belongs to another user
/// - `404 Not Found` — transaction does not exist
pub async fn delete_transaction(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, AppError> {
    let repo = PgTransactionRepository::new(state.pool);

    // Ownership check
    let existing = repo.find_by_id(id).await?;
    if existing.user_id != user_id.0 {
        return Err(AppError::Forbidden(
            "you do not have access to this transaction".into(),
        ));
    }

    repo.delete(id).await?;

    Ok(StatusCode::NO_CONTENT)
}
