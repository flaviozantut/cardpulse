//! Parser chain that tries each registered `SmsParser` in order.

use tracing::warn;

use super::bradesco::BradescoParser;
use super::itau::ItauParser;
use super::nubank::NubankParser;
use super::parser::{ParsedSms, SmsParser};

/// Tries each registered parser in insertion order, returning the first
/// successful parse result.
///
/// When no parser matches, a `WARN`-level log entry is emitted so that
/// unknown SMS formats can be detected and new parsers added over time.
pub struct SmsParserChain {
    parsers: Vec<Box<dyn SmsParser>>,
}

impl SmsParserChain {
    /// Creates a new chain from the given list of parsers.
    pub fn new(parsers: Vec<Box<dyn SmsParser>>) -> Self {
        Self { parsers }
    }

    /// Creates the default chain with all built-in bank parsers pre-registered.
    ///
    /// Order: Nubank → Itaú → Bradesco.
    pub fn default_chain() -> Self {
        Self::new(vec![
            Box::new(NubankParser),
            Box::new(ItauParser),
            Box::new(BradescoParser),
        ])
    }

    /// Tries each parser in order and returns the first successful result.
    ///
    /// Emits a `warn!` log when no parser is able to handle the SMS so that
    /// operators can identify and support new bank formats over time.
    pub fn parse(&self, sms: &str) -> Option<ParsedSms> {
        for parser in &self.parsers {
            if parser.can_parse(sms) {
                if let Some(result) = parser.parse(sms) {
                    return Some(result);
                }
            }
        }
        warn!(sms = sms, "No SMS parser matched the format");
        None
    }
}

// ─── Unit tests ──────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    // ── default_chain ─────────────────────────────────────────────────────────

    #[test]
    fn test_default_chain_handles_nubank_sms() {
        let chain = SmsParserChain::default_chain();
        let result = chain
            .parse("Nubank: Compra de R$ 50,00 em IFOOD em 01/01/2025")
            .expect("should parse");
        assert_eq!(result.bank, "Nubank");
        assert_eq!(result.amount, 50.0);
    }

    #[test]
    fn test_default_chain_handles_itau_sms() {
        let chain = SmsParserChain::default_chain();
        let result = chain
            .parse("Itau: Compra aprovada de R$ 200,00 em POSTO SHELL em 20/03/2025")
            .expect("should parse");
        assert_eq!(result.bank, "Itaú");
        assert_eq!(result.amount, 200.0);
    }

    #[test]
    fn test_default_chain_handles_bradesco_sms() {
        let chain = SmsParserChain::default_chain();
        let result = chain
            .parse("Bradesco: Compra de R$ 45,00 em UBER em 28/03/2025")
            .expect("should parse");
        assert_eq!(result.bank, "Bradesco");
        assert_eq!(result.amount, 45.0);
    }

    #[test]
    fn test_chain_returns_none_for_unknown_format() {
        let chain = SmsParserChain::default_chain();
        assert!(chain
            .parse("Banco Desconhecido: pagamento realizado")
            .is_none());
    }

    #[test]
    fn test_chain_returns_none_for_empty_sms() {
        let chain = SmsParserChain::default_chain();
        assert!(chain.parse("").is_none());
    }

    #[test]
    fn test_chain_with_no_parsers_returns_none() {
        let chain = SmsParserChain::new(vec![]);
        assert!(chain
            .parse("Nubank: Compra de R$ 50,00 em IFOOD em 01/01/2025")
            .is_none());
    }

    #[test]
    fn test_chain_falls_through_to_next_parser_when_first_cannot_parse() {
        // A chain where the first parser always says can_parse=false
        // and the second is a real Bradesco parser.
        struct NeverParser;
        impl SmsParser for NeverParser {
            fn can_parse(&self, _: &str) -> bool {
                false
            }
            fn parse(&self, _: &str) -> Option<ParsedSms> {
                None
            }
            fn bank_name(&self) -> &'static str {
                "Never"
            }
        }

        let chain = SmsParserChain::new(vec![Box::new(NeverParser), Box::new(BradescoParser)]);
        let result = chain
            .parse("Bradesco: Compra de R$ 45,00 em UBER em 28/03/2025")
            .expect("should parse via BradescoParser");
        assert_eq!(result.bank, "Bradesco");
    }
}
