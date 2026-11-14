-- Keys for agents using the MCP endpoint. Each acts as a fixed role. Only a SHA-256 hash of the token is
-- stored; the token is shown once, at creation.
CREATE TABLE api_key (
    id           bigserial   PRIMARY KEY,
    name         text        NOT NULL,
    role         text        NOT NULL CHECK (role IN ('ADMIN', 'EDITOR', 'VIEWER')),
    prefix       text        NOT NULL,          -- first characters of the token, to recognise it in lists
    secret_hash  text        NOT NULL UNIQUE,   -- hex SHA-256 of the full token
    created_by   text        NOT NULL,
    created_at   timestamptz NOT NULL DEFAULT now(),
    expires_at   timestamptz NOT NULL,
    last_used_at timestamptz,
    revoked_at   timestamptz,
    revoked_by   text
);

-- A name identifies one live key at a time; revoked keys keep their name for the record.
CREATE UNIQUE INDEX api_key_active_name_idx ON api_key (name) WHERE revoked_at IS NULL;
