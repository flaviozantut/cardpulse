//! Card domain type, request DTOs, and response DTOs.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Newtype wrapper for card IDs to prevent accidental mixing with other ID types.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct CardId(pub Uuid);

impl std::fmt::Display for CardId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

/// Core card domain type as stored in the database.
///
/// All card data is encrypted client-side; the server stores only
/// opaque blobs and never inspects the plaintext content.
#[derive(Debug, Clone, sqlx::FromRow)]
pub struct Card {
    pub id: Uuid,
    pub user_id: Uuid,
    pub encrypted_data: Vec<u8>,
    pub iv: Vec<u8>,
    pub auth_tag: Vec<u8>,
    pub created_at: DateTime<Utc>,
}

/// Request DTO for creating a card.
///
/// Encrypted fields are base64-encoded strings produced by the client's
/// AES-256-GCM encryption before transmission.
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct CreateCard {
    pub encrypted_data: String,
    pub iv: String,
    pub auth_tag: String,
}

/// Public-facing card response.
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct CardResponse {
    pub id: Uuid,
    pub user_id: Uuid,
    pub encrypted_data: String,
    pub iv: String,
    pub auth_tag: String,
    pub created_at: DateTime<Utc>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_card_id_serializes_as_uuid_string() {
        let id = Uuid::parse_str("550e8400-e29b-41d4-a716-446655440000").unwrap();
        let card_id = CardId(id);
        let serialized = serde_json::to_value(&card_id).unwrap();
        assert_eq!(serialized, json!("550e8400-e29b-41d4-a716-446655440000"));
    }

    #[test]
    fn test_card_id_deserializes_from_uuid_string() {
        let json = json!("550e8400-e29b-41d4-a716-446655440000");
        let card_id: CardId = serde_json::from_value(json).unwrap();
        assert_eq!(
            card_id.0,
            Uuid::parse_str("550e8400-e29b-41d4-a716-446655440000").unwrap()
        );
    }

    #[test]
    fn test_card_id_display_shows_uuid() {
        let id = Uuid::parse_str("550e8400-e29b-41d4-a716-446655440000").unwrap();
        assert_eq!(
            format!("{}", CardId(id)),
            "550e8400-e29b-41d4-a716-446655440000"
        );
    }

    #[test]
    fn test_create_card_deserializes_with_snake_case_fields() {
        let json = json!({
            "encrypted_data": "base64data",
            "iv": "base64iv",
            "auth_tag": "base64tag"
        });
        let dto: CreateCard = serde_json::from_value(json).unwrap();
        assert_eq!(dto.encrypted_data, "base64data");
        assert_eq!(dto.iv, "base64iv");
        assert_eq!(dto.auth_tag, "base64tag");
    }

    #[test]
    fn test_card_response_serializes_with_snake_case_fields() {
        let resp = CardResponse {
            id: Uuid::new_v4(),
            user_id: Uuid::new_v4(),
            encrypted_data: "base64data".to_string(),
            iv: "base64iv".to_string(),
            auth_tag: "base64tag".to_string(),
            created_at: DateTime::from_timestamp(0, 0).unwrap(),
        };
        let value = serde_json::to_value(&resp).unwrap();
        assert_eq!(value["encrypted_data"], "base64data");
        assert_eq!(value["iv"], "base64iv");
        assert_eq!(value["auth_tag"], "base64tag");
    }

    #[test]
    fn test_card_struct_derives_debug_and_clone() {
        let card = Card {
            id: Uuid::new_v4(),
            user_id: Uuid::new_v4(),
            encrypted_data: vec![1, 2, 3],
            iv: vec![4, 5, 6],
            auth_tag: vec![7, 8, 9],
            created_at: Utc::now(),
        };
        let cloned = card.clone();
        assert_eq!(card.id, cloned.id);
        let _ = format!("{card:?}");
    }
}
