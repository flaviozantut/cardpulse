---
description: Rust coding standards for all source files
globs: src/**/*.rs
---

# Rust source rules

## Ownership and borrowing
- Prefer `&str` over `String` in function parameters when ownership is not needed
- Use `Cow<'_, str>` when the function may or may not need to allocate
- Explicit clone is acceptable for cheap types (UUID, small strings). Document clones of large types.

## Structs and types
- Request/response structs derive: `Debug, Serialize, Deserialize`
- Domain structs derive: `Debug, Clone`
- Use `#[serde(rename_all = "snake_case")]` on all API structs
- Newtypes for IDs: `pub struct UserId(pub Uuid);`
- Implement `Display` for newtypes used in logs

## Async handlers (axum)
- Signature: `async fn handler(State(state): State<AppState>, ...) -> Result<impl IntoResponse, AppError>`
- Extract validation into separate functions — handlers orchestrate, they do not validate
- Return semantic status codes: 201 for creation, 204 for delete, 200 for queries
- JSON responses use a consistent wrapper: `{ "data": ... }` for success, `{ "error": { "code": "...", "message": "..." } }` for errors

## sqlx queries
- Prefer `sqlx::query_as!` (compile-time checked) whenever possible
- Fall back to `sqlx::query_as::<_, Type>` when compile-time check is not feasible
- Every query returning multiple rows uses `.fetch_all()`
- Lookup queries by ID use `.fetch_optional()` + mapping to `AppError::NotFound`
- NEVER concatenate strings to build queries — always use bind parameters

## Modules
- `mod.rs` only re-exports — zero logic
- One file per primary type/responsibility
- Module doc (`//!`) required explaining the module's responsibility
