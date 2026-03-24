//! Reusable request validation helpers.
//!
//! Each function returns `Result<(), AppError::ValidationError>` on failure,
//! making it easy to compose with the `?` operator in handlers.

use base64::{engine::general_purpose::STANDARD, Engine};

use crate::error::AppError;

/// Validates that `bucket` matches the `YYYY-MM` format with a valid date.
///
/// Year must be >= 2000, month must be 01–12.
///
/// # Errors
/// Returns [`AppError::ValidationError`] if the format or date is invalid.
pub fn validate_timestamp_bucket(bucket: &str) -> Result<(), AppError> {
    if bucket.len() != 7 {
        return Err(AppError::ValidationError(
            "timestamp_bucket must be in YYYY-MM format".into(),
        ));
    }

    let parts: Vec<&str> = bucket.split('-').collect();
    if parts.len() != 2 {
        return Err(AppError::ValidationError(
            "timestamp_bucket must be in YYYY-MM format".into(),
        ));
    }

    let year: u16 = parts[0].parse().map_err(|_| {
        AppError::ValidationError("timestamp_bucket must be in YYYY-MM format".into())
    })?;
    let month: u8 = parts[1].parse().map_err(|_| {
        AppError::ValidationError("timestamp_bucket must be in YYYY-MM format".into())
    })?;

    if year < 2000 || !(1..=12).contains(&month) {
        return Err(AppError::ValidationError(
            "timestamp_bucket must be a valid YYYY-MM date".into(),
        ));
    }

    Ok(())
}

/// Validates that `value` is a valid standard base64 string.
///
/// Uses the standard alphabet with padding. Empty strings are rejected.
///
/// # Errors
/// Returns [`AppError::ValidationError`] with `field_name` in the message
/// if the value is empty or not valid base64.
pub fn validate_base64(value: &str, field_name: &str) -> Result<Vec<u8>, AppError> {
    if value.is_empty() {
        return Err(AppError::ValidationError(format!(
            "{field_name} must not be empty"
        )));
    }

    STANDARD
        .decode(value)
        .map_err(|_| AppError::ValidationError(format!("{field_name} is not valid base64")))
}

/// Validates that `email` has a basic valid format (contains `@` with parts on both sides).
///
/// This is intentionally a lightweight check — full RFC 5322 compliance
/// is not attempted. The definitive check is the registration flow itself
/// (e.g. confirmation email).
///
/// # Errors
/// Returns [`AppError::ValidationError`] if the format is clearly invalid.
pub fn validate_email(email: &str) -> Result<(), AppError> {
    if email.is_empty() {
        return Err(AppError::ValidationError("email must not be empty".into()));
    }

    let parts: Vec<&str> = email.splitn(2, '@').collect();
    if parts.len() != 2 {
        return Err(AppError::ValidationError(
            "email must contain an @ symbol".into(),
        ));
    }

    let local = parts[0];
    let domain = parts[1];

    if local.is_empty() {
        return Err(AppError::ValidationError(
            "email must have a local part before @".into(),
        ));
    }

    if domain.is_empty() || !domain.contains('.') {
        return Err(AppError::ValidationError(
            "email must have a valid domain after @".into(),
        ));
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    // ── validate_timestamp_bucket ─────────────────────────────────────────

    #[test]
    fn test_timestamp_bucket_accepts_valid_format() {
        assert!(validate_timestamp_bucket("2025-01").is_ok());
        assert!(validate_timestamp_bucket("2025-12").is_ok());
        assert!(validate_timestamp_bucket("2000-06").is_ok());
        assert!(validate_timestamp_bucket("2099-11").is_ok());
    }

    #[test]
    fn test_timestamp_bucket_rejects_invalid_format() {
        assert!(validate_timestamp_bucket("2025").is_err());
        assert!(validate_timestamp_bucket("2025-1").is_err());
        assert!(validate_timestamp_bucket("25-01").is_err());
        assert!(validate_timestamp_bucket("").is_err());
        assert!(validate_timestamp_bucket("abcd-01").is_err());
        assert!(validate_timestamp_bucket("2025/01").is_err());
    }

    #[test]
    fn test_timestamp_bucket_rejects_invalid_month() {
        assert!(validate_timestamp_bucket("2025-00").is_err());
        assert!(validate_timestamp_bucket("2025-13").is_err());
    }

    #[test]
    fn test_timestamp_bucket_rejects_year_before_2000() {
        assert!(validate_timestamp_bucket("1999-12").is_err());
    }

    // ── validate_base64 ──────────────────────────────────────────────────

    #[test]
    fn test_base64_accepts_valid_input() {
        let result = validate_base64("aGVsbG8gd29ybGQ=", "data");
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), b"hello world");
    }

    #[test]
    fn test_base64_accepts_unpadded_valid_input() {
        // "aGk=" is valid standard base64 for "hi"
        let result = validate_base64("aGk=", "field");
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), b"hi");
    }

    #[test]
    fn test_base64_rejects_empty_string() {
        let result = validate_base64("", "my_field");
        assert!(result.is_err());
        let msg = result.unwrap_err().to_string();
        assert!(msg.contains("my_field"), "Error should mention field name");
        assert!(msg.contains("empty"), "Error should mention empty");
    }

    #[test]
    fn test_base64_rejects_invalid_characters() {
        let result = validate_base64("not!valid@base64", "data");
        assert!(result.is_err());
        let msg = result.unwrap_err().to_string();
        assert!(msg.contains("data"), "Error should mention field name");
        assert!(msg.contains("base64"), "Error should mention base64");
    }

    #[test]
    fn test_base64_rejects_truncated_padding() {
        // "aGVsbG8" without proper padding
        let result = validate_base64("aGVsbG8", "field");
        // Standard base64 with padding required — this should fail
        assert!(result.is_err());
    }

    // ── validate_email ───────────────────────────────────────────────────

    #[test]
    fn test_email_accepts_valid_addresses() {
        assert!(validate_email("user@example.com").is_ok());
        assert!(validate_email("a@b.co").is_ok());
        assert!(validate_email("user+tag@domain.org").is_ok());
        assert!(validate_email("name@sub.domain.com").is_ok());
    }

    #[test]
    fn test_email_rejects_empty_string() {
        let result = validate_email("");
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("empty"));
    }

    #[test]
    fn test_email_rejects_missing_at_symbol() {
        assert!(validate_email("userexample.com").is_err());
    }

    #[test]
    fn test_email_rejects_missing_local_part() {
        assert!(validate_email("@example.com").is_err());
    }

    #[test]
    fn test_email_rejects_missing_domain() {
        assert!(validate_email("user@").is_err());
    }

    #[test]
    fn test_email_rejects_domain_without_dot() {
        assert!(validate_email("user@localhost").is_err());
    }
}
