//! Sync handlers for encrypted backup export and import.
//!
//! # Endpoints
//! - `GET /v1/sync/export` — export all user data as encrypted JSON
//! - `POST /v1/sync/import` — bulk import from a backup

use std::collections::HashMap;

use axum::{extract::State, response::IntoResponse, Json};
use base64::{engine::general_purpose::STANDARD, Engine};
use chrono::Utc;
use serde::Deserialize;
use serde_json::json;
use uuid::Uuid;

use crate::{
    auth::middleware::AuthUser,
    error::AppError,
    models::{card::CardResponse, transaction::TransactionResponse},
    repositories::{
        card_repo::PgCardRepository,
        traits::{CardRepository, NewCard, NewTransaction, TransactionFilters, TransactionRepository},
        transaction_repo::PgTransactionRepository,
    },
    state::AppState,
    validation::{validate_base64, validate_timestamp_bucket},
};

/// `GET /v1/sync/export` — export all user data as encrypted blobs.
///
/// Returns all cards and transactions belonging to the authenticated user.
/// Data is sent as-is (encrypted); the server never decrypts it.
///
/// # Responses
/// - `200 OK` — `{ "data": { "exported_at": "...", "cards": [...], "transactions": [...] } }`
/// - `401 Unauthorized` — missing or invalid token
pub async fn export(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
) -> Result<impl IntoResponse, AppError> {
    let card_repo = PgCardRepository::new(state.pool.clone());
    let tx_repo = PgTransactionRepository::new(state.pool);

    let cards = card_repo.find_all_by_user_id(user_id.0).await?;
    let transactions = tx_repo
        .find_all_by_user_id(
            user_id.0,
            TransactionFilters {
                card_id: None,
                timestamp_bucket: None,
            },
        )
        .await?;

    let card_responses: Vec<CardResponse> = cards
        .into_iter()
        .map(|c| CardResponse {
            id: c.id,
            user_id: c.user_id,
            encrypted_data: STANDARD.encode(&c.encrypted_data),
            iv: STANDARD.encode(&c.iv),
            auth_tag: STANDARD.encode(&c.auth_tag),
            created_at: c.created_at,
        })
        .collect();

    let tx_responses: Vec<TransactionResponse> = transactions
        .into_iter()
        .map(|t| TransactionResponse {
            id: t.id,
            user_id: t.user_id,
            card_id: t.card_id,
            encrypted_data: STANDARD.encode(&t.encrypted_data),
            iv: STANDARD.encode(&t.iv),
            auth_tag: STANDARD.encode(&t.auth_tag),
            timestamp_bucket: t.timestamp_bucket,
            created_at: t.created_at,
        })
        .collect();

    Ok(Json(json!({
        "data": {
            "exported_at": Utc::now(),
            "cards": card_responses,
            "transactions": tx_responses,
        }
    })))
}

/// A card entry in an import payload.
///
/// `original_id` identifies this card within the payload so that transactions
/// can reference it via their `card_id` field. The server generates a new UUID
/// for the persisted card.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct ImportCard {
    /// Client-assigned ID used only to correlate transactions in this payload.
    pub original_id: Uuid,
    pub encrypted_data: String,
    pub iv: String,
    pub auth_tag: String,
}

/// A transaction entry in an import payload.
///
/// `card_id` must match one of the `original_id` values from the accompanying
/// `cards` array in the same request.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct ImportTransaction {
    /// Must match an `original_id` from the `cards` array.
    pub card_id: Uuid,
    pub encrypted_data: String,
    pub iv: String,
    pub auth_tag: String,
    pub timestamp_bucket: String,
}

/// Request body for `POST /v1/sync/import`.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct ImportPayload {
    pub cards: Vec<ImportCard>,
    pub transactions: Vec<ImportTransaction>,
}

/// `POST /v1/sync/import` — bulk import from a backup file.
///
/// Cards are created first; their `original_id` values are mapped to new
/// server-generated UUIDs. Transactions are then created with the resolved
/// card IDs. The server never reads or modifies the encrypted content.
///
/// # Responses
/// - `200 OK` — `{ "data": { "cards_imported": N, "transactions_imported": M } }`
/// - `401 Unauthorized` — missing or invalid token
/// - `422 Unprocessable Entity` — invalid base64, invalid timestamp_bucket,
///   or a transaction references an unknown `original_id`
pub async fn import(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Json(payload): Json<ImportPayload>,
) -> Result<impl IntoResponse, AppError> {
    let card_repo = PgCardRepository::new(state.pool.clone());
    let tx_repo = PgTransactionRepository::new(state.pool);

    // Create cards and build original_id → new DB id mapping.
    let mut id_map: HashMap<Uuid, Uuid> = HashMap::with_capacity(payload.cards.len());

    for import_card in &payload.cards {
        let encrypted_data = validate_base64(&import_card.encrypted_data, "encrypted_data")?;
        let iv = validate_base64(&import_card.iv, "iv")?;
        let auth_tag = validate_base64(&import_card.auth_tag, "auth_tag")?;

        let card = card_repo
            .create(NewCard {
                user_id: user_id.0,
                encrypted_data,
                iv,
                auth_tag,
            })
            .await?;

        id_map.insert(import_card.original_id, card.id);
    }

    // Create transactions, resolving card IDs through the mapping.
    let mut transactions_imported: usize = 0;

    for import_tx in &payload.transactions {
        validate_timestamp_bucket(&import_tx.timestamp_bucket)?;

        let new_card_id = id_map.get(&import_tx.card_id).copied().ok_or_else(|| {
            AppError::ValidationError(format!(
                "card_id '{}' does not match any imported card's original_id",
                import_tx.card_id
            ))
        })?;

        let encrypted_data = validate_base64(&import_tx.encrypted_data, "encrypted_data")?;
        let iv = validate_base64(&import_tx.iv, "iv")?;
        let auth_tag = validate_base64(&import_tx.auth_tag, "auth_tag")?;

        tx_repo
            .create(NewTransaction {
                user_id: user_id.0,
                card_id: new_card_id,
                encrypted_data,
                iv,
                auth_tag,
                timestamp_bucket: import_tx.timestamp_bucket.clone(),
            })
            .await?;

        transactions_imported += 1;
    }

    Ok(Json(json!({
        "data": {
            "cards_imported": id_map.len(),
            "transactions_imported": transactions_imported,
        }
    })))
}
