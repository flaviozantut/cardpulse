# CardPulse — Expense Tracker with E2E Encryption

## Overview

REST API for real-time credit card expense tracking. Zero-knowledge model: the server stores only encrypted blobs (AES-256-GCM) and never has access to plaintext data. Expenses are captured via iOS automation (Shortcuts + Scriptable) and visualized through a React dashboard that decrypts everything client-side.

## Stack

- **Backend:** Rust (edition 2021) with axum + tokio + sqlx
- **Database:** PostgreSQL (encrypted data in BYTEA, structural metadata in plaintext)
- **Frontend:** React + TypeScript + Vite + Tailwind CSS
- **Crypto:** aes-gcm, argon2 (server-side KDF), Web Crypto API (client-side)
- **Auth:** JWT (jsonwebtoken crate)
- **Deploy:** Fly.io (gru region — São Paulo)
- **CI:** GitHub Actions

## Core principles

### TDD — Test-Driven Development

All new code strictly follows the Red → Green → Refactor cycle:

1. **Red:** write the test BEFORE production code. The test must fail.
2. **Green:** write the MINIMUM code to make the test pass. Nothing more.
3. **Refactor:** clean up the code while keeping all tests green.

Non-negotiable rules:
- Never write production code without a failing test first
- Every commit must include corresponding tests
- Integration tests for every API endpoint
- Unit tests for SMS parsing, validation, and domain logic
- Run `cargo test` before every commit — if it fails, do not commit
- Minimum coverage: 80% on core modules (handlers, models, auth)

### SOLID

- **S — Single Responsibility:** each struct/module has one reason to change. Handlers do not run queries directly — they delegate to repositories.
- **O — Open/Closed:** use traits for extensibility. New SMS parsers implement the `SmsParser` trait without modifying existing code.
- **L — Liskov Substitution:** any trait implementation must be substitutable without breaking behavior.
- **I — Interface Segregation:** small, focused traits. Prefer separate `trait TransactionRepository` and `trait CardRepository` over a monolithic `trait Repository`.
- **D — Dependency Inversion:** handlers depend on traits (abstractions), not concrete database implementations. This makes testing with mocks straightforward.

### Documentation

- Every public struct has a `///` doc comment explaining purpose and invariants
- Every endpoint documents: path, method, headers, body, possible responses (2xx, 4xx, 5xx)
- Functions with complex logic include `///` with usage examples
- `//` inline comments only when the "why" is not obvious from the code
- Modules (`mod.rs`) include `//!` module-level docs explaining responsibility
- README.md kept up to date with setup instructions, env vars, and how to run tests

## Project architecture

```
cardpulse-api/
├── Cargo.toml
├── Cargo.lock
├── CLAUDE.md
├── README.md
├── .env.example
├── .github/
│   └── workflows/
│       └── ci.yml
├── migrations/
│   └── 001_initial.sql
├── src/
│   ├── main.rs              # Startup, router setup, graceful shutdown
│   ├── config.rs             # Env vars → AppConfig struct (dotenvy)
│   ├── db.rs                 # PgPool setup, migration runner
│   ├── error.rs              # AppError enum, IntoResponse impl, thiserror
│   ├── auth/
│   │   ├── mod.rs            # Re-exports
│   │   ├── handler.rs        # POST /auth/register, /auth/login, /auth/refresh
│   │   ├── jwt.rs            # Token creation/validation
│   │   ├── middleware.rs     # AuthUser extractor (FromRequestParts)
│   │   └── password.rs       # Argon2 hash/verify
│   ├── models/
│   │   ├── mod.rs
│   │   ├── user.rs           # User, CreateUser, UserResponse
│   │   ├── card.rs           # Card, CreateCard, CardResponse
│   │   └── transaction.rs    # Transaction, CreateTransaction, TransactionResponse
│   ├── repositories/
│   │   ├── mod.rs
│   │   ├── traits.rs         # Repository traits (DI-friendly)
│   │   ├── user_repo.rs      # impl UserRepository for PgUserRepository
│   │   ├── card_repo.rs      # impl CardRepository for PgCardRepository
│   │   └── transaction_repo.rs
│   ├── handlers/
│   │   ├── mod.rs
│   │   ├── cards.rs          # CRUD /v1/cards
│   │   └── transactions.rs   # CRUD /v1/transactions
│   └── routes.rs             # Router assembly with state injection
└── tests/
    ├── common/
    │   └── mod.rs            # Test helpers, DB setup, fixtures
    ├── auth_test.rs
    ├── cards_test.rs
    └── transactions_test.rs
```

## Rust code conventions

### Style

- `cargo fmt` on every file before committing — no exceptions
- `cargo clippy -- -D warnings` must be clean — warnings are errors
- snake_case for functions/variables, PascalCase for types/traits
- Imports organized: std → external crates → internal crate (separated by blank lines)
- Maximum 100 characters per line
- Maximum 50 lines per function — if exceeded, extract

### Error handling

- Use `thiserror` to define `AppError` with semantic variants
- Never use `.unwrap()` in production code — use `?` or `.expect("descriptive message")`
- `.unwrap()` is allowed ONLY in tests
- Each `AppError` variant maps to an HTTP status code via `IntoResponse`

### Required patterns

- **Repository pattern:** handlers NEVER run SQL queries directly
- **Extractor pattern:** use `FromRequestParts` for auth, not middleware that mutates the request
- **Builder pattern:** for structs with many optional fields
- **Newtype pattern:** for typed IDs (`UserId(Uuid)`, `CardId(Uuid)`) — prevents mixing IDs

### Async

- All I/O is async via tokio
- Do not use `block_on` or `.blocking()` inside an async context
- sqlx queries use `sqlx::query_as!` (compile-time checked) whenever possible

## Database

- Migrations in plain SQL in the `migrations/` folder
- Naming: `NNN_description.sql` (e.g., `001_initial.sql`, `002_add_categories.sql`)
- Every migration is idempotent when possible (use `IF NOT EXISTS`)
- Sensitive data NEVER stored in plaintext — always BYTEA with separate iv + auth_tag
- `timestamp_bucket` is VARCHAR(7) in "YYYY-MM" format — the only non-encrypted temporal metadata

## Tests

### Structure

- **Unit tests:** in the same file, inside `#[cfg(test)] mod tests { ... }`
- **Integration tests:** in `tests/` at the root, one file per domain
- **Naming:** `test_<action>_<scenario>_<expected_result>` (e.g., `test_create_transaction_with_valid_payload_returns_201`)

### Rules

- Each endpoint has at minimum: happy path, auth failure (401), validation failure (422), not found (404)
- Integration tests use a real database (test database), not mocks
- Setup/teardown with transaction rollback for isolation
- `#[tokio::test]` for async tests
- Fixtures via helper functions in `tests/common/mod.rs`
- Clear assertions — prefer `assert_eq!` with descriptive messages

### Example test-first workflow

```rust
// 1. RED — write the test first
#[tokio::test]
async fn test_create_transaction_with_valid_payload_returns_201() {
    let app = spawn_test_app().await;
    let token = create_test_user_and_login(&app).await;

    let response = app
        .post("/v1/transactions")
        .header("Authorization", format!("Bearer {token}"))
        .json(&json!({
            "card_id": "card-uuid",
            "encrypted_data": "base64...",
            "iv": "base64...",
            "auth_tag": "base64...",
            "timestamp_bucket": "2025-03"
        }))
        .await;

    assert_eq!(response.status(), StatusCode::CREATED);
}

// 2. GREEN — implement the minimum to pass
// 3. REFACTOR — clean up while keeping it green
```

## Git workflow

- Commits in English, format: `type(scope): description`
  - Types: `feat`, `fix`, `test`, `docs`, `refactor`, `chore`
  - Example: `feat(auth): add JWT token refresh endpoint`
- Branch naming: `feat/short-name`, `fix/description`, `refactor/module`
- Never commit code that doesn't compile (`cargo build`) or with failing tests (`cargo test`)
- Make small, frequent commits — one commit per logical unit of change

## Local development — Docker-based

All development runs inside Docker containers. The API container has hot reload via `cargo-watch`. A dedicated test database runs on a separate container to avoid conflicts.

### Getting started

```bash
cp .env.example .env          # Configure environment
make up                       # Start db + db-test + api (hot reload)
make migrate                  # Run database migrations
```

### Essential commands (via Makefile)

```bash
# Docker lifecycle
make up                        # Start all services (db + db-test + api)
make up-tools                  # Start all + pgAdmin (http://localhost:5050)
make down                      # Stop everything
make restart                   # Restart API container
make logs                      # Tail API logs
make db-shell                  # Open psql to dev database
make db-test-shell             # Open psql to test database

# Development (runs inside API container)
make test                      # Run all tests
make test-verbose              # Tests with output
make test-watch                # Tests in watch mode
make lint                      # Run clippy (warnings = errors)
make fmt                       # Format code
make check                     # Fast compile check

# Database
make migrate                   # Run migrations
make migrate-add name=foo      # Create new migration
make migrate-revert            # Revert last migration

# CI pipeline
make ci                        # fmt-check + lint + test (run before pushing)

# Production
make build-prod                # Build production Docker image
make deploy                    # Deploy to Fly.io
```

### Direct commands (when running outside Docker)

```bash
cargo run                      # Run the server
cargo test                     # Run all tests
cargo clippy -- -D warnings    # Lint
cargo fmt                      # Format
sqlx migrate run               # Run migrations
```

### Service map

| Service    | Container          | Port  | Purpose                    |
|------------|--------------------|-------|----------------------------|
| API        | cardpulse-api      | 8080  | REST API with hot reload   |
| PostgreSQL | cardpulse-db       | 5432  | Development database       |
| PostgreSQL | cardpulse-db-test  | 5433  | Test database (isolated)   |
| pgAdmin    | cardpulse-pgadmin  | 5050  | DB GUI (optional, `--profile tools`) |

## Environment variables

```
# Database (matches docker-compose.yml defaults)
DATABASE_URL=postgres://cardpulse:cardpulse@localhost:5432/cardpulse
DATABASE_URL_TEST=postgres://cardpulse:cardpulse@localhost:5433/cardpulse_test

# Auth
JWT_SECRET=<random-64-chars>
JWT_EXPIRATION_HOURS=24

# Server
HOST=0.0.0.0
PORT=8080

# Logging
RUST_LOG=info,cardpulse_api=debug
```

## Security — absolute rules

- The server NEVER decrypts transaction/card data
- Data in `encrypted_data` is opaque — the API does not validate content, only persists it
- `wrapped_dek` and `dek_salt` are returned ONLY to the authenticated owner
- Rate limiting on auth endpoints (register, login)
- All queries use parameterized statements (sqlx does this by default)
- CORS configured to accept only the dashboard domain
