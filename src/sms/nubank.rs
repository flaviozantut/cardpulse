//! SMS parser for Nubank notifications.

use std::sync::OnceLock;

use regex::Regex;

use super::parser::{parse_brl_amount, parse_date_to_bucket, ParsedSms, SmsParser};

/// Shared regex compiled once.
///
/// Captures: (int_part, dec_part, merchant, day, month, year)
static RE: OnceLock<Regex> = OnceLock::new();

fn regex() -> &'static Regex {
    RE.get_or_init(|| {
        // Matches: R$ 50,50 em AMAZON.COM.BR em 20/03/2025
        Regex::new(
            r"R\$\s*([\d.]+),(\d{2})\s+em\s+([A-Z0-9][A-Z0-9 *./-]*?)\s+em\s+(\d{2})/(\d{2})/(\d{2,4})",
        )
        .expect("invalid nubank regex")
    })
}

/// Parses Nubank credit card purchase SMS notifications.
///
/// Supported format:
/// ```text
/// Nubank: Compra de R$ <amount> em <MERCHANT> em <DD/MM/YYYY>
/// ```
pub struct NubankParser;

impl SmsParser for NubankParser {
    fn can_parse(&self, sms: &str) -> bool {
        sms.to_lowercase().contains("nubank")
    }

    fn parse(&self, sms: &str) -> Option<ParsedSms> {
        let caps = regex().captures(sms)?;

        let amount_str = format!("{},{}", &caps[1], &caps[2]);
        let amount = parse_brl_amount(&amount_str)?;
        let merchant = caps[3].trim().to_string();
        let timestamp_bucket = parse_date_to_bucket(&caps[4], &caps[5], &caps[6])?;

        Some(ParsedSms {
            amount,
            merchant,
            timestamp_bucket,
            bank: self.bank_name().to_string(),
            card_last_digits: None,
        })
    }

    fn bank_name(&self) -> &'static str {
        "Nubank"
    }
}

// ─── Unit tests ──────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    const NUBANK_BASIC: &str = "Nubank: Compra de R$ 50,50 em AMAZON.COM.BR em 20/03/2025";
    const NUBANK_THOUSANDS: &str = "Nubank: Compra de R$ 1.500,00 em MERCADO LIVRE em 15/02/2025";
    const NUBANK_SHORT_YEAR: &str = "Nubank: Compra de R$ 30,00 em SPOTIFY em 10/01/25";
    const ITAU_SMS: &str = "Itau: Compra aprovada de R$ 200,00 em POSTO SHELL em 20/03/2025";

    // ── can_parse ─────────────────────────────────────────────────────────────

    #[test]
    fn test_nubank_parser_recognizes_nubank_sms() {
        assert!(NubankParser.can_parse(NUBANK_BASIC));
    }

    #[test]
    fn test_nubank_parser_recognizes_nubank_case_insensitive() {
        assert!(NubankParser.can_parse("nubank: Compra de R$ 10,00 em LOJA em 01/01/2025"));
    }

    #[test]
    fn test_nubank_parser_does_not_recognize_itau_sms() {
        assert!(!NubankParser.can_parse(ITAU_SMS));
    }

    #[test]
    fn test_nubank_parser_does_not_recognize_empty_sms() {
        assert!(!NubankParser.can_parse(""));
    }

    // ── bank_name ─────────────────────────────────────────────────────────────

    #[test]
    fn test_nubank_parser_bank_name_is_nubank() {
        assert_eq!(NubankParser.bank_name(), "Nubank");
    }

    // ── parse ─────────────────────────────────────────────────────────────────

    #[test]
    fn test_nubank_parser_parses_basic_purchase() {
        let result = NubankParser.parse(NUBANK_BASIC).expect("should parse");
        assert_eq!(result.amount, 50.50);
        assert_eq!(result.merchant, "AMAZON.COM.BR");
        assert_eq!(result.timestamp_bucket, "2025-03");
        assert_eq!(result.bank, "Nubank");
        assert_eq!(result.card_last_digits, None);
    }

    #[test]
    fn test_nubank_parser_parses_purchase_with_thousands_separator() {
        let result = NubankParser.parse(NUBANK_THOUSANDS).expect("should parse");
        assert_eq!(result.amount, 1500.0);
        assert_eq!(result.merchant, "MERCADO LIVRE");
        assert_eq!(result.timestamp_bucket, "2025-02");
    }

    #[test]
    fn test_nubank_parser_parses_short_year() {
        let result = NubankParser.parse(NUBANK_SHORT_YEAR).expect("should parse");
        assert_eq!(result.timestamp_bucket, "2025-01");
    }

    #[test]
    fn test_nubank_parser_returns_none_for_malformed_sms() {
        assert!(NubankParser.parse("Nubank: mensagem sem valor").is_none());
    }
}
