-- Fictional seed data so the app can be tried immediately.

INSERT INTO environment (key, name, sort_order) VALUES
    ('dev',  'Development', 1),
    ('prod', 'Production',  2);

-- Dev-only logins (listed in the README). Passwords: admin-pass, editor-pass, viewer-pass.
INSERT INTO app_user (username, password_hash, role) VALUES
    ('admin',  '$2a$10$3kqTcRDkHLL4NBmKb7S93OvOr1NvJDh6bCniMUz4ziLpXZOr5owwS', 'ADMIN'),
    ('editor', '$2a$10$VLqfMuQ7FCW5YGPtG6C6tOouiIaOLcKRp4zIpGkIE2xNbQpVwrPWu', 'EDITOR'),
    ('viewer', '$2a$10$j8cpB7v60nzgyNcQJgaZfuYF/QrpJZvhHmxy/aWGJhzvP2.TV0siu', 'VIEWER');

INSERT INTO flag (key, description) VALUES
    ('new-dashboard', 'Redesigned home page'),
    ('beta-reports',  'Reports for beta customers'),
    ('dark-mode',     'Dark theme, gradual rollout');

INSERT INTO flag_environment (flag_id, env_key, enabled, otherwise, rules)
SELECT f.id, v.env_key, v.enabled, v.otherwise, v.rules::jsonb
FROM flag f
JOIN (VALUES
    ('new-dashboard', 'dev',  true,  true,  '[]'),
    ('new-dashboard', 'prod', true,  false, '[{"type":"users","userIds":["u_102","u_207"],"serve":true},
                                             {"type":"customers","customerIds":["acme"],"serve":true},
                                             {"type":"percent","percent":10,"serve":true}]'),
    ('beta-reports',  'dev',  true,  true,  '[]'),
    ('beta-reports',  'prod', true,  false, '[{"type":"customers","customerIds":["acme"],"serve":true}]'),
    ('dark-mode',     'dev',  true,  true,  '[]'),
    ('dark-mode',     'prod', false, false, '[{"type":"percent","percent":25,"serve":true}]')
) AS v (flag_key, env_key, enabled, otherwise, rules) ON v.flag_key = f.key;
