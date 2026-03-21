//! User domain type, request DTOs, and response DTOs.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Newtype wrapper for user IDs to prevent accidental mixing with other ID types.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct UserId(pub Uuid);

impl std::fmt::Display for UserId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

/// Core user domain type as stored in the database.
///
/// Sensitive fields (`wrapped_dek`, `dek_salt`) are encrypted blobs
/// and are never exposed outside the authenticated owner's session.
#[derive(Debug, Clone)]
pub struct User {
    pub id: Uuid,
    pub email: String,
    pub password_hash: String,
    pub wrapped_dek: Vec<u8>,
    pub dek_salt: Vec<u8>,
    pub dek_params: String,
    pub created_at: DateTime<Utc>,
}

/// Request DTO for user registration.
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct CreateUser {
    pub email: String,
    pub password: String,
    pub wrapped_dek: String,
    pub dek_salt: String,
    pub dek_params: String,
}

/// Public-facing user response, omitting all sensitive fields.
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct UserResponse {
    pub id: Uuid,
    pub email: String,
    pub created_at: DateTime<Utc>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_user_id_serializes_as_uuid_string() {
        let id = Uuid::parse_str("550e8400-e29b-41d4-a716-446655440000").unwrap();
        let user_id = UserId(id);
        let serialized = serde_json::to_value(&user_id).unwrap();
        assert_eq!(serialized, json!("550e8400-e29b-41d4-a716-446655440000"));
    }

    #[test]
    fn test_user_id_deserializes_from_uuid_string() {
        let json = json!("550e8400-e29b-41d4-a716-446655440000");
        let user_id: UserId = serde_json::from_value(json).unwrap();
        assert_eq!(
            user_id.0,
            Uuid::parse_str("550e8400-e29b-41d4-a716-446655440000").unwrap()
        );
    }

    #[test]
    fn test_user_id_display_shows_uuid() {
        let id = Uuid::parse_str("550e8400-e29b-41d4-a716-446655440000").unwrap();
        let user_id = UserId(id);
        assert_eq!(format!("{user_id}"), "550e8400-e29b-41d4-a716-446655440000");
    }

    #[test]
    fn test_create_user_deserializes_with_snake_case_fields() {
        let json = json!({
            "email": "test@example.com",
            "password": "secret",
            "wrapped_dek": "base64encryptedkey",
            "dek_salt": "base64salt",
            "dek_params": "{\"m\":65536}"
        });
        let dto: CreateUser = serde_json::from_value(json).unwrap();
        assert_eq!(dto.email, "test@example.com");
        assert_eq!(dto.password, "secret");
        assert_eq!(dto.wrapped_dek, "base64encryptedkey");
        assert_eq!(dto.dek_salt, "base64salt");
        assert_eq!(dto.dek_params, "{\"m\":65536}");
    }

    #[test]
    fn test_user_response_serializes_with_snake_case_fields() {
        let id = Uuid::parse_str("550e8400-e29b-41d4-a716-446655440000").unwrap();
        let resp = UserResponse {
            id,
            email: "test@example.com".to_string(),
            created_at: DateTime::from_timestamp(0, 0).unwrap(),
        };
        let value = serde_json::to_value(&resp).unwrap();
        assert_eq!(value["email"], "test@example.com");
        assert_eq!(value["id"], "550e8400-e29b-41d4-a716-446655440000");
        assert!(
            value.get("password_hash").is_none(),
            "password_hash must not be exposed"
        );
    }

    #[test]
    fn test_user_struct_derives_debug_and_clone() {
        let user = User {
            id: Uuid::new_v4(),
            email: "a@b.com".to_string(),
            password_hash: "hash".to_string(),
            wrapped_dek: vec![1, 2, 3],
            dek_salt: vec![4, 5, 6],
            dek_params: "{}".to_string(),
            created_at: Utc::now(),
        };
        let cloned = user.clone();
        assert_eq!(user.email, cloned.email);
        let _ = format!("{user:?}");
    }
}
