//! HTTP request handlers.
//!
//! Each submodule handles one domain area. Handlers orchestrate
//! request extraction, delegation to repositories, and response
//! serialization — they contain no business logic or SQL.

pub mod cards;
pub mod health;
pub mod me;
pub mod test_blob;
