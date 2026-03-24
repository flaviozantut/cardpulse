//! Transaction domain type, request DTOs, and response DTOs.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Newtype wrapper for transaction IDs to prevent accidental mixing with other ID types.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct TransactionId(pub Uuid);

impl std::fmt::Display for TransactionId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

/// Core transaction domain type as stored in the database.
///
/// All financial data is encrypted client-side. The only temporal
/// metadata stored in plaintext is `timestamp_bucket` ("YYYY-MM"),
/// which allows filtering without exposing exact timestamps.
#[derive(Debug, Clone, sqlx::FromRow)]
pub struct Transaction {
    pub id: Uuid,
    pub user_id: Uuid,
    pub card_id: Uuid,
    pub encrypted_data: Vec<u8>,
    pub iv: Vec<u8>,
    pub auth_tag: Vec<u8>,
    /// Month bucket in "YYYY-MM" format — the only non-encrypted temporal metadata.
    pub timestamp_bucket: String,
    pub created_at: DateTime<Utc>,
}

/// Request DTO for creating a transaction.
///
/// Encrypted fields are base64-encoded strings produced by the client's
/// AES-256-GCM encryption before transmission.
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct CreateTransaction {
    pub card_id: Uuid,
    pub encrypted_data: String,
    pub iv: String,
    pub auth_tag: String,
    /// Month bucket in "YYYY-MM" format.
    pub timestamp_bucket: String,
}

/// Public-facing transaction response.
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct TransactionResponse {
    pub id: Uuid,
    pub user_id: Uuid,
    pub card_id: Uuid,
    pub encrypted_data: String,
    pub iv: String,
    pub auth_tag: String,
    pub timestamp_bucket: String,
    pub created_at: DateTime<Utc>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_transaction_id_serializes_as_uuid_string() {
        let id = Uuid::parse_str("550e8400-e29b-41d4-a716-446655440000").unwrap();
        let tx_id = TransactionId(id);
        let serialized = serde_json::to_value(&tx_id).unwrap();
        assert_eq!(serialized, json!("550e8400-e29b-41d4-a716-446655440000"));
    }

    #[test]
    fn test_transaction_id_deserializes_from_uuid_string() {
        let json = json!("550e8400-e29b-41d4-a716-446655440000");
        let tx_id: TransactionId = serde_json::from_value(json).unwrap();
        assert_eq!(
            tx_id.0,
            Uuid::parse_str("550e8400-e29b-41d4-a716-446655440000").unwrap()
        );
    }

    #[test]
    fn test_transaction_id_display_shows_uuid() {
        let id = Uuid::parse_str("550e8400-e29b-41d4-a716-446655440000").unwrap();
        assert_eq!(
            format!("{}", TransactionId(id)),
            "550e8400-e29b-41d4-a716-446655440000"
        );
    }

    #[test]
    fn test_create_transaction_deserializes_with_snake_case_fields() {
        let card_id = Uuid::new_v4();
        let json = json!({
            "card_id": card_id,
            "encrypted_data": "base64data",
            "iv": "base64iv",
            "auth_tag": "base64tag",
            "timestamp_bucket": "2025-03"
        });
        let dto: CreateTransaction = serde_json::from_value(json).unwrap();
        assert_eq!(dto.card_id, card_id);
        assert_eq!(dto.encrypted_data, "base64data");
        assert_eq!(dto.timestamp_bucket, "2025-03");
    }

    #[test]
    fn test_transaction_response_serializes_with_snake_case_fields() {
        let resp = TransactionResponse {
            id: Uuid::new_v4(),
            user_id: Uuid::new_v4(),
            card_id: Uuid::new_v4(),
            encrypted_data: "base64data".to_string(),
            iv: "base64iv".to_string(),
            auth_tag: "base64tag".to_string(),
            timestamp_bucket: "2025-03".to_string(),
            created_at: DateTime::from_timestamp(0, 0).unwrap(),
        };
        let value = serde_json::to_value(&resp).unwrap();
        assert_eq!(value["timestamp_bucket"], "2025-03");
        assert_eq!(value["encrypted_data"], "base64data");
        assert!(value.get("password_hash").is_none());
    }

    #[test]
    fn test_transaction_struct_derives_debug_and_clone() {
        let tx = Transaction {
            id: Uuid::new_v4(),
            user_id: Uuid::new_v4(),
            card_id: Uuid::new_v4(),
            encrypted_data: vec![1, 2],
            iv: vec![3, 4],
            auth_tag: vec![5, 6],
            timestamp_bucket: "2025-03".to_string(),
            created_at: Utc::now(),
        };
        let cloned = tx.clone();
        assert_eq!(tx.timestamp_bucket, cloned.timestamp_bucket);
        let _ = format!("{tx:?}");
    }
}
