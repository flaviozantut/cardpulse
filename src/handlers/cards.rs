//! Card CRUD handlers.
//!
//! # Endpoints
//! - `POST /v1/cards`     — create a new card
//! - `GET /v1/cards`      — list the authenticated user's cards
//! - `PUT /v1/cards/:id`  — update a card
//! - `DELETE /v1/cards/:id` — delete a card

use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use base64::{engine::general_purpose::STANDARD, Engine};
use serde_json::json;
use uuid::Uuid;

use crate::{
    auth::middleware::AuthUser,
    error::AppError,
    models::card::{CardResponse, CreateCard},
    repositories::{
        card_repo::PgCardRepository,
        traits::{CardRepository, NewCard, UpdateCard},
    },
    state::AppState,
    validation::validate_base64,
};

/// Builds a [`CardResponse`] from a domain [`Card`], encoding binary fields as base64.
fn card_to_response(card: crate::models::card::Card) -> CardResponse {
    CardResponse {
        id: card.id,
        user_id: card.user_id,
        encrypted_data: STANDARD.encode(&card.encrypted_data),
        iv: STANDARD.encode(&card.iv),
        auth_tag: STANDARD.encode(&card.auth_tag),
        created_at: card.created_at,
    }
}

/// `POST /v1/cards` — create a new encrypted card.
///
/// # Responses
/// - `201 Created` — `{ "data": { ... } }`
/// - `401 Unauthorized` — missing or invalid token
/// - `422 Unprocessable Entity` — invalid payload
pub async fn create_card(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Json(payload): Json<CreateCard>,
) -> Result<impl IntoResponse, AppError> {
    let encrypted_data = validate_base64(&payload.encrypted_data, "encrypted_data")?;
    let iv = validate_base64(&payload.iv, "iv")?;
    let auth_tag = validate_base64(&payload.auth_tag, "auth_tag")?;

    let repo = PgCardRepository::new(state.pool);
    let card = repo
        .create(NewCard {
            user_id: user_id.0,
            encrypted_data,
            iv,
            auth_tag,
        })
        .await?;

    Ok((
        StatusCode::CREATED,
        Json(json!({ "data": card_to_response(card) })),
    ))
}

/// `GET /v1/cards` — list all cards for the authenticated user.
///
/// # Responses
/// - `200 OK` — `{ "data": [ ... ] }`
/// - `401 Unauthorized` — missing or invalid token
pub async fn list_cards(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
) -> Result<impl IntoResponse, AppError> {
    let repo = PgCardRepository::new(state.pool);
    let cards = repo.find_all_by_user_id(user_id.0).await?;

    let data: Vec<CardResponse> = cards.into_iter().map(card_to_response).collect();

    Ok(Json(json!({ "data": data })))
}

/// `PUT /v1/cards/:id` — update an existing card.
///
/// # Responses
/// - `200 OK` — `{ "data": { ... } }`
/// - `401 Unauthorized` — missing or invalid token
/// - `403 Forbidden` — card belongs to another user
/// - `404 Not Found` — card does not exist
/// - `422 Unprocessable Entity` — invalid payload
pub async fn update_card(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Path(id): Path<Uuid>,
    Json(payload): Json<CreateCard>,
) -> Result<impl IntoResponse, AppError> {
    let repo = PgCardRepository::new(state.pool);

    // Ownership check
    let existing = repo.find_by_id(id).await?;
    if existing.user_id != user_id.0 {
        return Err(AppError::Forbidden(
            "you do not have access to this card".into(),
        ));
    }

    let encrypted_data = validate_base64(&payload.encrypted_data, "encrypted_data")?;
    let iv = validate_base64(&payload.iv, "iv")?;
    let auth_tag = validate_base64(&payload.auth_tag, "auth_tag")?;
    let card = repo
        .update(
            id,
            UpdateCard {
                encrypted_data,
                iv,
                auth_tag,
            },
        )
        .await?;

    Ok(Json(json!({ "data": card_to_response(card) })))
}

/// `DELETE /v1/cards/:id` — delete a card.
///
/// # Responses
/// - `204 No Content`
/// - `401 Unauthorized` — missing or invalid token
/// - `403 Forbidden` — card belongs to another user
/// - `404 Not Found` — card does not exist
pub async fn delete_card(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, AppError> {
    let repo = PgCardRepository::new(state.pool);

    // Ownership check
    let existing = repo.find_by_id(id).await?;
    if existing.user_id != user_id.0 {
        return Err(AppError::Forbidden(
            "you do not have access to this card".into(),
        ));
    }

    repo.delete(id).await?;

    Ok(StatusCode::NO_CONTENT)
}
