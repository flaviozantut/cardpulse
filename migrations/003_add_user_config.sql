-- User configuration blobs: one encrypted blob per (user, config_type).
-- Used to sync client-side settings (e.g., category_overrides) between devices.
-- The server stores only encrypted blobs and never inspects the plaintext content.

CREATE TABLE IF NOT EXISTS user_config (
    id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id        UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    config_type    VARCHAR(64) NOT NULL,
    encrypted_data BYTEA       NOT NULL,
    iv             BYTEA       NOT NULL,
    auth_tag       BYTEA       NOT NULL,
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, config_type)
);

CREATE INDEX IF NOT EXISTS idx_user_config_user_id ON user_config (user_id);
