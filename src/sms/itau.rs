//! SMS parser for Itaú bank notifications.

use std::sync::OnceLock;

use regex::Regex;

use super::parser::{parse_brl_amount, parse_date_to_bucket, ParsedSms, SmsParser};

/// Shared purchase regex compiled once.
///
/// Captures: (int_part, dec_part, merchant, day, month, year)
static RE: OnceLock<Regex> = OnceLock::new();

/// Optional card-digits regex compiled once.
static RE_CARD: OnceLock<Regex> = OnceLock::new();

fn regex() -> &'static Regex {
    RE.get_or_init(|| {
        Regex::new(
            r"R\$\s*([\d.]+),(\d{2})\s+em\s+([A-Z0-9][A-Z0-9 *./-]*?)\s+em\s+(\d{2})/(\d{2})/(\d{2,4})",
        )
        .expect("invalid itau regex")
    })
}

fn card_regex() -> &'static Regex {
    RE_CARD.get_or_init(|| {
        Regex::new(r"(?:cartao|cartão) final (\d{4})").expect("invalid itau card regex")
    })
}

/// Parses Itaú credit card purchase SMS notifications.
///
/// Supported formats:
/// ```text
/// Itau: Compra aprovada de R$ <amount> em <MERCHANT> em <DD/MM/YYYY>
/// Itau: Compra aprovada de R$ <amount> em <MERCHANT> em <DD/MM/YYYY> no cartao final <DDDD>
/// ```
pub struct ItauParser;

impl SmsParser for ItauParser {
    fn can_parse(&self, sms: &str) -> bool {
        let lower = sms.to_lowercase();
        // Handle both "Itau" and "Itaú" (accented form).
        lower.contains("itau") || lower.contains("itaú")
    }

    fn parse(&self, sms: &str) -> Option<ParsedSms> {
        let caps = regex().captures(sms)?;

        let amount_str = format!("{},{}", &caps[1], &caps[2]);
        let amount = parse_brl_amount(&amount_str)?;
        let merchant = caps[3].trim().to_string();
        let timestamp_bucket = parse_date_to_bucket(&caps[4], &caps[5], &caps[6])?;

        // Card digits are optional.
        let card_last_digits = card_regex().captures(sms).map(|c| c[1].to_string());

        Some(ParsedSms {
            amount,
            merchant,
            timestamp_bucket,
            bank: self.bank_name().to_string(),
            card_last_digits,
        })
    }

    fn bank_name(&self) -> &'static str {
        "Itaú"
    }
}

// ─── Unit tests ──────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    const ITAU_BASIC: &str = "Itau: Compra aprovada de R$ 200,00 em POSTO SHELL em 20/03/2025";
    const ITAU_WITH_CARD: &str =
        "Itau: Compra aprovada de R$ 75,50 em SHOPEE em 22/03/2025 no cartao final 1234";
    const ITAU_WITH_ACCENT: &str = "Itaú: Compra de R$ 99,00 em AMAZON em 28/03/2025";
    const ITAU_SHORT_YEAR: &str = "Itau: Compra de R$ 40,00 em UBER em 05/06/25";
    const NUBANK_SMS: &str = "Nubank: Compra de R$ 50,00 em IFOOD em 01/01/2025";

    // ── can_parse ─────────────────────────────────────────────────────────────

    #[test]
    fn test_itau_parser_recognizes_itau_sms() {
        assert!(ItauParser.can_parse(ITAU_BASIC));
    }

    #[test]
    fn test_itau_parser_recognizes_itau_with_accent() {
        assert!(ItauParser.can_parse(ITAU_WITH_ACCENT));
    }

    #[test]
    fn test_itau_parser_does_not_recognize_nubank_sms() {
        assert!(!ItauParser.can_parse(NUBANK_SMS));
    }

    #[test]
    fn test_itau_parser_does_not_recognize_empty_sms() {
        assert!(!ItauParser.can_parse(""));
    }

    // ── bank_name ─────────────────────────────────────────────────────────────

    #[test]
    fn test_itau_parser_bank_name_is_itau() {
        assert_eq!(ItauParser.bank_name(), "Itaú");
    }

    // ── parse ─────────────────────────────────────────────────────────────────

    #[test]
    fn test_itau_parser_parses_basic_purchase() {
        let result = ItauParser.parse(ITAU_BASIC).expect("should parse");
        assert_eq!(result.amount, 200.0);
        assert_eq!(result.merchant, "POSTO SHELL");
        assert_eq!(result.timestamp_bucket, "2025-03");
        assert_eq!(result.bank, "Itaú");
        assert_eq!(result.card_last_digits, None);
    }

    #[test]
    fn test_itau_parser_parses_sms_with_card_last_digits() {
        let result = ItauParser.parse(ITAU_WITH_CARD).expect("should parse");
        assert_eq!(result.amount, 75.50);
        assert_eq!(result.merchant, "SHOPEE");
        assert_eq!(result.card_last_digits, Some("1234".to_string()));
    }

    #[test]
    fn test_itau_parser_parses_sms_with_accent_in_bank_name() {
        let result = ItauParser.parse(ITAU_WITH_ACCENT).expect("should parse");
        assert_eq!(result.amount, 99.0);
        assert_eq!(result.merchant, "AMAZON");
        assert_eq!(result.timestamp_bucket, "2025-03");
    }

    #[test]
    fn test_itau_parser_parses_short_year() {
        let result = ItauParser.parse(ITAU_SHORT_YEAR).expect("should parse");
        assert_eq!(result.timestamp_bucket, "2025-06");
    }

    #[test]
    fn test_itau_parser_returns_none_for_malformed_sms() {
        assert!(ItauParser.parse("Itau: mensagem sem valor").is_none());
    }
}
