//! SMS parser for Bradesco bank notifications.

use std::sync::OnceLock;

use regex::Regex;

use super::parser::{parse_brl_amount, parse_date_to_bucket, ParsedSms, SmsParser};

/// Shared regex compiled once.
///
/// Captures: (int_part, dec_part, merchant, day, month, year)
static RE: OnceLock<Regex> = OnceLock::new();

fn regex() -> &'static Regex {
    RE.get_or_init(|| {
        Regex::new(
            r"R\$\s*([\d.]+),(\d{2})\s+em\s+([A-Z0-9][A-Z0-9 *./-]*?)\s+em\s+(\d{2})/(\d{2})/(\d{2,4})",
        )
        .expect("invalid bradesco regex")
    })
}

/// Parses Bradesco credit card purchase SMS notifications.
///
/// Supported formats:
/// ```text
/// Bradesco: Compra de R$ <amount> em <MERCHANT> em <DD/MM/YYYY> aprovada
/// Bradesco Cartoes: Compra de R$ <amount> em <MERCHANT> em <DD/MM/YYYY>
/// ```
pub struct BradescoParser;

impl SmsParser for BradescoParser {
    fn can_parse(&self, sms: &str) -> bool {
        sms.to_lowercase().contains("bradesco")
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
        "Bradesco"
    }
}

// ─── Unit tests ──────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    const BRADESCO_BASIC: &str =
        "Bradesco: Compra de R$ 99,90 em AMAZON.COM.BR em 22/03/2025 aprovada";
    const BRADESCO_CARTOES: &str = "Bradesco Cartoes: Compra de R$ 45,00 em UBER em 28/03/2025";
    const BRADESCO_SHORT_YEAR: &str = "Bradesco: Compra de R$ 35,00 em SPOTIFY em 15/07/25";
    const NUBANK_SMS: &str = "Nubank: Compra de R$ 50,00 em IFOOD em 01/01/2025";

    // ── can_parse ─────────────────────────────────────────────────────────────

    #[test]
    fn test_bradesco_parser_recognizes_bradesco_sms() {
        assert!(BradescoParser.can_parse(BRADESCO_BASIC));
    }

    #[test]
    fn test_bradesco_parser_recognizes_bradesco_cartoes_variant() {
        assert!(BradescoParser.can_parse(BRADESCO_CARTOES));
    }

    #[test]
    fn test_bradesco_parser_does_not_recognize_nubank_sms() {
        assert!(!BradescoParser.can_parse(NUBANK_SMS));
    }

    #[test]
    fn test_bradesco_parser_does_not_recognize_empty_sms() {
        assert!(!BradescoParser.can_parse(""));
    }

    // ── bank_name ─────────────────────────────────────────────────────────────

    #[test]
    fn test_bradesco_parser_bank_name_is_bradesco() {
        assert_eq!(BradescoParser.bank_name(), "Bradesco");
    }

    // ── parse ─────────────────────────────────────────────────────────────────

    #[test]
    fn test_bradesco_parser_parses_basic_purchase() {
        let result = BradescoParser.parse(BRADESCO_BASIC).expect("should parse");
        assert_eq!(result.amount, 99.90);
        assert_eq!(result.merchant, "AMAZON.COM.BR");
        assert_eq!(result.timestamp_bucket, "2025-03");
        assert_eq!(result.bank, "Bradesco");
        assert_eq!(result.card_last_digits, None);
    }

    #[test]
    fn test_bradesco_parser_parses_cartoes_variant() {
        let result = BradescoParser
            .parse(BRADESCO_CARTOES)
            .expect("should parse");
        assert_eq!(result.amount, 45.0);
        assert_eq!(result.merchant, "UBER");
        assert_eq!(result.timestamp_bucket, "2025-03");
    }

    #[test]
    fn test_bradesco_parser_parses_short_year() {
        let result = BradescoParser
            .parse(BRADESCO_SHORT_YEAR)
            .expect("should parse");
        assert_eq!(result.timestamp_bucket, "2025-07");
    }

    #[test]
    fn test_bradesco_parser_returns_none_for_malformed_sms() {
        assert!(BradescoParser
            .parse("Bradesco: mensagem sem valor")
            .is_none());
    }
}
