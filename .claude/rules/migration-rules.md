---
description: Database migration and SQL conventions
globs: migrations/**/*.sql
---

# Database migration rules

## Naming
- Format: `NNN_short_description.sql` (e.g., `001_initial.sql`)
- Description in snake_case, no spaces
- Sequential numbers with 3-digit zero-padding

## SQL conventions
- SQL keywords in UPPERCASE: `CREATE TABLE`, `NOT NULL`, `DEFAULT`
- Table and column names in snake_case
- Primary keys: `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- Timestamps: always `TIMESTAMPTZ`, never `TIMESTAMP` without timezone
- Encrypted data: `BYTEA NOT NULL` for encrypted_data, iv, auth_tag
- Foreign keys: name explicitly `REFERENCES table(column)`
- Indices: prefix `idx_table_column`

## Security rules
- NEVER store transaction/card data in plaintext
- Fields allowed in plaintext: id, user_id, card_id, timestamp_bucket, created_at
- `timestamp_bucket` is VARCHAR(7) in "YYYY-MM" format

## Idempotency
- Use `CREATE TABLE IF NOT EXISTS` when possible
- Use `CREATE INDEX IF NOT EXISTS`
- Avoid `DROP` in migrations — prefer additive migrations
