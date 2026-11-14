CREATE TABLE environment (
    key        text PRIMARY KEY,
    name       text NOT NULL,
    sort_order int  NOT NULL
);

CREATE TABLE app_user (
    id            bigserial PRIMARY KEY,
    username      text NOT NULL UNIQUE,
    password_hash text NOT NULL,
    role          text NOT NULL CHECK (role IN ('ADMIN', 'EDITOR', 'VIEWER'))
);

CREATE TABLE flag (
    id          bigserial   PRIMARY KEY,
    key         text        NOT NULL UNIQUE CHECK (key ~ '^[a-z0-9][a-z0-9-]{0,62}$'),
    description text        NOT NULL DEFAULT '',
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);

-- One row per flag per environment. Rules are an ordered JSON array; the first match wins.
CREATE TABLE flag_environment (
    flag_id    bigint      NOT NULL REFERENCES flag (id) ON DELETE CASCADE,
    env_key    text        NOT NULL REFERENCES environment (key),
    enabled    boolean     NOT NULL DEFAULT false,
    otherwise  boolean     NOT NULL DEFAULT false,
    rules      jsonb       NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(rules) = 'array'),
    version    int         NOT NULL DEFAULT 0,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (flag_id, env_key)
);

-- flag_key is plain text (no FK) so history survives a flag being deleted.
CREATE TABLE audit_event (
    id       bigserial   PRIMARY KEY,
    at       timestamptz NOT NULL DEFAULT now(),
    actor    text        NOT NULL,
    flag_key text        NOT NULL,
    env_key  text,
    action   text        NOT NULL,
    summary  text        NOT NULL,
    before   jsonb,
    after    jsonb
);

CREATE INDEX audit_event_flag_idx ON audit_event (flag_key, id DESC);
