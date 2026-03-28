//! Core SMS parser types: the `SmsParser` trait, `ParsedSms` result struct,
//! and shared helper functions for amount/date parsing.

/// The result of a successfully parsed bank SMS notification.
#[derive(Debug, Clone, PartialEq)]
pub struct ParsedSms {
    /// Transaction amount in BRL (e.g., `150.00` for "R$150,00").
    pub amount: f64,
    /// Merchant name extracted from the SMS.
    pub merchant: String,
    /// Month bucket in `"YYYY-MM"` format, ready for storage.
    pub timestamp_bucket: String,
    /// Name of the bank that sent the SMS (e.g., `"Nubank"`).
    pub bank: String,
    /// Last 4 digits of the card, when present in the SMS.
    pub card_last_digits: Option<String>,
}

/// Implemented by each bank-specific SMS parser.
///
/// New banks are added by implementing this trait without modifying existing
/// parsers (Open/Closed Principle). The `SmsParserChain` tries each registered
/// parser in order and returns the first successful result.
pub trait SmsParser: Send + Sync {
    /// Returns `true` if this parser is designed to handle the given SMS text.
    fn can_parse(&self, sms: &str) -> bool;

    /// Attempts to parse `sms` into a `ParsedSms`.
    ///
    /// Returns `None` if the SMS does not match the expected format even
    /// though `can_parse` returned `true` (e.g., a malformed message).
    fn parse(&self, sms: &str) -> Option<ParsedSms>;

    /// Returns the human-readable bank name this parser handles.
    fn bank_name(&self) -> &'static str;
}

/// Parses a Brazilian currency amount string into `f64`.
///
/// Accepts the string portion *after* `R$`, e.g. `"150,00"` or `"1.500,00"`.
/// The thousands separator (`.`) is stripped; the decimal separator (`,`) is
/// replaced with `.` before parsing.
///
/// # Examples
///
/// ```
/// use cardpulse_api::sms::parser::parse_brl_amount;
/// assert_eq!(parse_brl_amount("150,00"), Some(150.0));
/// assert_eq!(parse_brl_amount("1.500,00"), Some(1500.0));
/// assert_eq!(parse_brl_amount("abc"), None);
/// ```
pub fn parse_brl_amount(amount_str: &str) -> Option<f64> {
    // Strip thousands separator (.) then replace decimal comma with dot.
    let normalized = amount_str.replace('.', "").replace(',', ".");
    normalized.parse::<f64>().ok()
}

/// Converts a date expressed as `(day, month, year)` strings into a
/// `"YYYY-MM"` timestamp bucket.
///
/// `year` may be 2 or 4 digits. 2-digit years are expanded with the `"20"`
/// prefix (e.g., `"25"` → `"2025"`). The `_day` argument is accepted for
/// API symmetry with regex capture groups but is not used in the output.
///
/// Returns `None` when the month is outside 1–12 or the year is before 2000.
///
/// # Examples
///
/// ```
/// use cardpulse_api::sms::parser::parse_date_to_bucket;
/// assert_eq!(parse_date_to_bucket("15", "03", "2025"), Some("2025-03".to_string()));
/// assert_eq!(parse_date_to_bucket("15", "03", "25"),   Some("2025-03".to_string()));
/// assert_eq!(parse_date_to_bucket("15", "13", "2025"), None);
/// ```
pub fn parse_date_to_bucket(_day: &str, month: &str, year: &str) -> Option<String> {
    let full_year = if year.len() == 2 {
        format!("20{year}")
    } else {
        year.to_string()
    };

    let month_num: u8 = month.parse().ok()?;
    let year_num: u16 = full_year.parse().ok()?;

    if !(1..=12).contains(&month_num) || year_num < 2000 {
        return None;
    }

    // Zero-pad month to two digits (it already is from the regex, but be explicit).
    Some(format!("{full_year}-{month_num:02}"))
}

// ─── Unit tests ──────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    // ── parse_brl_amount ──────────────────────────────────────────────────────

    #[test]
    fn test_parse_brl_amount_basic_value() {
        assert_eq!(parse_brl_amount("150,00"), Some(150.0));
    }

    #[test]
    fn test_parse_brl_amount_with_cents() {
        assert_eq!(parse_brl_amount("75,50"), Some(75.5));
    }

    #[test]
    fn test_parse_brl_amount_with_thousands_separator() {
        assert_eq!(parse_brl_amount("1.500,00"), Some(1500.0));
    }

    #[test]
    fn test_parse_brl_amount_sub_one_real() {
        assert_eq!(parse_brl_amount("0,99"), Some(0.99));
    }

    #[test]
    fn test_parse_brl_amount_invalid_returns_none() {
        assert_eq!(parse_brl_amount("abc"), None);
    }

    #[test]
    fn test_parse_brl_amount_empty_returns_none() {
        assert_eq!(parse_brl_amount(""), None);
    }

    // ── parse_date_to_bucket ──────────────────────────────────────────────────

    #[test]
    fn test_parse_date_to_bucket_full_year() {
        assert_eq!(
            parse_date_to_bucket("15", "03", "2025"),
            Some("2025-03".to_string())
        );
    }

    #[test]
    fn test_parse_date_to_bucket_short_year_expands_with_20_prefix() {
        assert_eq!(
            parse_date_to_bucket("15", "03", "25"),
            Some("2025-03".to_string())
        );
    }

    #[test]
    fn test_parse_date_to_bucket_january() {
        assert_eq!(
            parse_date_to_bucket("01", "01", "2025"),
            Some("2025-01".to_string())
        );
    }

    #[test]
    fn test_parse_date_to_bucket_december() {
        assert_eq!(
            parse_date_to_bucket("31", "12", "2025"),
            Some("2025-12".to_string())
        );
    }

    #[test]
    fn test_parse_date_to_bucket_invalid_month_returns_none() {
        assert_eq!(parse_date_to_bucket("01", "13", "2025"), None);
    }

    #[test]
    fn test_parse_date_to_bucket_zero_month_returns_none() {
        assert_eq!(parse_date_to_bucket("01", "00", "2025"), None);
    }

    #[test]
    fn test_parse_date_to_bucket_year_before_2000_returns_none() {
        assert_eq!(parse_date_to_bucket("01", "03", "1999"), None);
    }
}
