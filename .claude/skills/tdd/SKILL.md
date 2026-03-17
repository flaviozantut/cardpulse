---
description: Implement a feature using TDD (Red → Green → Refactor)
---

# Skill: TDD Feature Implementation

When invoked, follow this rigorous workflow to implement a feature:

## Steps

### 1. Understand the requirement
- Read the feature description
- Identify expected behaviors (happy path + edge cases)
- List test scenarios BEFORE thinking about implementation

### 2. Red — write the tests
For each identified scenario:
- Create the test in `tests/` (integration) or in `#[cfg(test)]` module (unit)
- Use the naming convention: `test_<action>_<condition>_<result>`
- Run `cargo test` — confirm the tests FAIL
- If any test passes without new code, the test is wrong — revise it

### 3. Green — minimal implementation
- Write ONLY the code necessary for the tests to pass
- Resist the urge to implement "extras" or optimizations
- Run `cargo test` — confirm ALL tests pass
- If any existing test broke, fix it BEFORE continuing

### 4. Refactor — cleanup
- Eliminate duplication
- Extract functions/types if needed
- Apply SOLID principles
- Run `cargo test` — confirm it stays green
- Run `cargo clippy -- -D warnings` — zero warnings
- Run `cargo fmt` — clean formatting

### 5. Document
- Add `///` doc comments to created public functions/structs
- Update README.md if the feature adds endpoints or configuration
- If a new endpoint was created, document path/method/body/responses

### 6. Commit
- `cargo test` green
- `cargo clippy -- -D warnings` clean
- `cargo fmt` applied
- Commit message: `feat(scope): description` or `test(scope): description`

## Usage example

Prompt: "Implement POST /v1/cards endpoint"

1. Identify scenarios: valid creation (201), no auth (401), invalid payload (422)
2. Write 3 tests in `tests/cards_test.rs` — all fail
3. Implement handler, model, repository — tests pass
4. Refactor — extract validation, apply repository pattern
5. Document handler with `///`
6. Commit: `feat(cards): add POST /v1/cards endpoint`
