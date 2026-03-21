//! CardPulse API library crate.
//!
//! Exposes all application modules so they can be used by the binary
//! entrypoint (`main.rs`) and by integration tests.

pub mod auth;
pub mod config;
pub mod db;
pub mod error;
pub mod handlers;
pub mod models;
pub mod repositories;
pub mod router;
pub mod state;
