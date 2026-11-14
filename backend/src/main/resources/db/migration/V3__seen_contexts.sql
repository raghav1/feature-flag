-- User and customer IDs the service has evaluated, for suggestions and "never seen" warnings in the editor.
CREATE TABLE seen_context (
    kind       text        NOT NULL CHECK (kind IN ('user', 'customer')),
    value      text        NOT NULL,
    first_seen timestamptz NOT NULL DEFAULT now(),
    last_seen  timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (kind, value)
);

CREATE INDEX seen_context_recent_idx ON seen_context (kind, last_seen DESC);

-- The fictional demo users, so suggestions work before anyone opens the demo.
INSERT INTO seen_context (kind, value) VALUES
    ('user', 'u_102'), ('user', 'u_207'), ('user', 'u_350'), ('user', 'u_303'), ('user', 'u_412'),
    ('customer', 'acme'), ('customer', 'zenith');
