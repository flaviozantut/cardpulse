//! Repository layer — one struct per domain type, one trait per repository.
//!
//! Handlers depend on the traits in [`traits`], not on the concrete
//! implementations, keeping business logic decoupled from SQL.

pub mod card_repo;
pub mod traits;
pub mod user_repo;
