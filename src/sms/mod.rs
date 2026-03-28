//! SMS parsing module for multi-bank Brazilian bank notifications.
//!
//! Implements a parser chain that tries each registered bank parser in order
//! and returns the first successful result. Unknown formats trigger a warning
//! log so new parsers can be identified and added over time.
//!
//! # Supported banks
//!
//! | Bank     | Struct            | Example SMS pattern |
//! |----------|-------------------|---------------------|
//! | Nubank   | [`NubankParser`]  | `Nubank: Compra de R$ <amount> em <MERCHANT> em <DD/MM/YYYY>` |
//! | Itaú     | [`ItauParser`]    | `Itau: Compra aprovada de R$ <amount> em <MERCHANT> em <DD/MM/YYYY>` |
//! | Bradesco | [`BradescoParser`]| `Bradesco: Compra de R$ <amount> em <MERCHANT> em <DD/MM/YYYY>` |
//!
//! # Adding a new bank
//!
//! 1. Create `src/sms/<bank>.rs` and implement [`SmsParser`] for your struct.
//! 2. Add `mod <bank>;` and `pub use <bank>::<BankParser>;` here.
//! 3. Register the parser in [`SmsParserChain::default_chain`].
//! 4. Add unit tests inside the new module.
//!
//! # Usage
//!
//! ```rust,ignore
//! use cardpulse_api::sms::SmsParserChain;
//!
//! let chain = SmsParserChain::default_chain();
//! if let Some(parsed) = chain.parse(raw_sms) {
//!     // encrypt parsed fields client-side, then POST /v1/transactions
//! } else {
//!     // unknown format — chain already logged a warning
//! }
//! ```

mod bradesco;
mod chain;
mod itau;
mod nubank;
pub mod parser;

pub use bradesco::BradescoParser;
pub use chain::SmsParserChain;
pub use itau::ItauParser;
pub use nubank::NubankParser;
pub use parser::{ParsedSms, SmsParser};
