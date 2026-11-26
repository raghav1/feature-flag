-- Fictional seed flag that shows attribute targeting end to end (Story 12.5).
-- The demo storefront sends each user's country; prod serves free shipping to Canada only.
-- V5 also runs on existing databases: if someone already made a 'free-shipping' flag, leave it as it is.

INSERT INTO flag (key, description) VALUES
    ('free-shipping', 'Free shipping for Canada')
ON CONFLICT (key) DO NOTHING;

INSERT INTO flag_environment (flag_id, env_key, enabled, otherwise, rules)
SELECT f.id, v.env_key, v.enabled, v.otherwise, v.rules::jsonb
FROM flag f
JOIN (VALUES
    ('free-shipping', 'dev',  true, true,  '[]'),
    ('free-shipping', 'prod', true, false, '[{"type":"attribute","attribute":"country","operator":"in","values":["CA"],"serve":true}]')
) AS v (flag_key, env_key, enabled, otherwise, rules) ON v.flag_key = f.key
WHERE NOT EXISTS (SELECT 1 FROM flag_environment fe WHERE fe.flag_id = f.id);
