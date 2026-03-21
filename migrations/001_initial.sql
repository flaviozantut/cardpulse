-- Initial schema: users, cards, transactions
-- All sensitive data stored as encrypted BYTEA blobs (AES-256-GCM).
-- Only structural metadata (IDs, bucket, timestamps) is in plaintext.

CREATE TABLE IF NOT EXISTS users (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    email         TEXT        NOT NULL UNIQUE,
    password_hash TEXT        NOT NULL,
    -- Client-side DEK wrapped with the server-derived KEK
    wrapped_dek   BYTEA       NOT NULL,
    dek_salt      BYTEA       NOT NULL,
    dek_params    TEXT        NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cards (
    id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id        UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    encrypted_data BYTEA       NOT NULL,
    iv             BYTEA       NOT NULL,
    auth_tag       BYTEA       NOT NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS transactions (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    card_id          UUID        NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
    encrypted_data   BYTEA       NOT NULL,
    iv               BYTEA       NOT NULL,
    auth_tag         BYTEA       NOT NULL,
    -- Only non-encrypted temporal metadata: "YYYY-MM" bucket for listing
    timestamp_bucket VARCHAR(7)  NOT NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transactions_user_bucket
    ON transactions (user_id, timestamp_bucket);

CREATE INDEX IF NOT EXISTS idx_transactions_card
    ON transactions (card_id);
