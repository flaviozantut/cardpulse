---
description: Refactor existing code while keeping tests green and applying SOLID
---

# Skill: Refactor

Workflow for safely refactoring code, guided by tests and SOLID principles.

## Preconditions

Before refactoring:
1. Run `cargo test` — ALL tests must be green
2. Run `cargo clippy -- -D warnings` — clean baseline
3. If there are no tests for the code being refactored, WRITE THEM FIRST

## Process

### 1. Identify the code smell
Common smells in this project:
- Function longer than 50 lines
- Handler running SQL queries directly (violates Repository pattern)
- Struct with mixed responsibilities (violates SRP)
- Deeply nested match/if (extract to function)
- Duplication across handlers (extract to helper)
- Trait with too many methods (violates ISP — split into smaller traits)
- Direct dependency on concrete implementation (violates DIP)

### 2. Plan the refactoring
- Describe the change in one sentence
- Identify which tests cover the affected code
- If coverage is insufficient, add tests BEFORE refactoring

### 3. Execute in small steps
For each step:
1. Make ONE isolated change
2. Run `cargo test` — must stay green
3. Run `cargo clippy` — must stay clean
4. If anything broke, revert (`git checkout -- .`) and try a smaller step

### 4. Common refactoring patterns

**Extract function:**
```rust
// Before: handler with inline validation logic
// After: fn validate_timestamp_bucket(bucket: &str) -> Result<(), AppError>
```

**Introduce trait (DIP):**
```rust
// Before: handler uses PgPool directly
// After: handler receives impl TransactionRepository
```

**Newtype (type safety):**
```rust
// Before: user_id: Uuid, card_id: Uuid (easy to mix up)
// After: UserId(Uuid), CardId(Uuid) — compiler prevents mixing
```

**Replace match with polymorphism:**
```rust
// Before: match sms_format { "bank_a" => parse_a(), "bank_b" => parse_b() }
// After: trait SmsParser { fn parse(&self, text: &str) -> ... }
```

### 5. Finalize
- `cargo test` — green
- `cargo clippy -- -D warnings` — clean
- `cargo fmt` — formatted
- Commit: `refactor(scope): description of the change`
