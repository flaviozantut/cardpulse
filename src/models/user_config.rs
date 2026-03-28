//! User configuration blob domain type, request DTOs, and response DTOs.
//!
//! Stores encrypted configuration blobs per (user, config_type).
//! The server never decrypts the blob — it only stores and returns it.
//! Used to sync client-side settings (e.g., category overrides) across devices.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Core user config domain type as stored in the database.
///
/// Each row represents one encrypted configuration blob for a specific user
/// and config type (e.g., `"category_overrides"`). The content is opaque to
/// the server.
#[derive(Debug, Clone, sqlx::FromRow)]
pub struct UserConfig {
    pub id: Uuid,
    pub user_id: Uuid,
    pub config_type: String,
    pub encrypted_data: Vec<u8>,
    pub iv: Vec<u8>,
    pub auth_tag: Vec<u8>,
    pub updated_at: DateTime<Utc>,
}

/// Request DTO for upserting a user config blob.
///
/// Encrypted fields are base64-encoded strings produced by the client's
/// AES-256-GCM encryption before transmission.
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct UpsertUserConfig {
    pub encrypted_data: String,
    pub iv: String,
    pub auth_tag: String,
}

/// Public-facing user config response.
///
/// All binary fields are returned as base64-encoded strings for JSON
/// serialization. The `config_type` is echoed back so the client can
/// validate the response.
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct UserConfigResponse {
    pub id: Uuid,
    pub config_type: String,
    pub encrypted_data: String,
    pub iv: String,
    pub auth_tag: String,
    pub updated_at: DateTime<Utc>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_upsert_user_config_deserializes_with_snake_case_fields() {
        let json = json!({
            "encrypted_data": "base64data",
            "iv": "base64iv",
            "auth_tag": "base64tag"
        });
        let dto: UpsertUserConfig = serde_json::from_value(json).unwrap();
        assert_eq!(dto.encrypted_data, "base64data");
        assert_eq!(dto.iv, "base64iv");
        assert_eq!(dto.auth_tag, "base64tag");
    }

    #[test]
    fn test_user_config_response_serializes_with_snake_case_fields() {
        let resp = UserConfigResponse {
            id: Uuid::new_v4(),
            config_type: "category_overrides".to_string(),
            encrypted_data: "base64data".to_string(),
            iv: "base64iv".to_string(),
            auth_tag: "base64tag".to_string(),
            updated_at: chrono::DateTime::from_timestamp(0, 0).unwrap(),
        };
        let value = serde_json::to_value(&resp).unwrap();
        assert_eq!(value["config_type"], "category_overrides");
        assert_eq!(value["encrypted_data"], "base64data");
    }
}
