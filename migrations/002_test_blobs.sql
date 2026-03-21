-- Temporary scaffolding table for the POST /v1/test endpoint.
-- MUST be removed before Phase 1 along with the endpoint itself.
CREATE TABLE IF NOT EXISTS test_blobs (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    data       TEXT        NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
