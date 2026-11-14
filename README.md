# Feature Flags

An internal feature-flag and progressive-rollout service: admin dashboard, Java backend on PostgreSQL, and a demo storefront that reads the flags.

> Work in progress. Phases 0–3 are done: scaffold, evaluation engine, admin API (login, roles, audit), and `/api/evaluate` with the demo storefront. The admin UI is still a placeholder (phase 4). See [docs/plan.md](docs/plan.md).

## Run it

Prerequisite: Docker.

```bash
docker compose up --build
```

| Service | URL |
|---|---|
| Admin | http://localhost:5173 |
| Demo | http://localhost:5174 |
| Backend | http://localhost:8080/actuator/health |

## Tests

Prerequisite: Docker (running). A local JDK 21+ and Node 20+ are used when present; otherwise `test.sh` runs those steps in containers.

```bash
./test.sh
```

## Demo storefront

Open http://localhost:5174 and use **Viewing as** to switch users (and **Env** for dev/prod). The debug panel shows each flag's value and why. Flags are fetched before the first render, so the page never shows a default and then flips. If the flag service is down, the store still renders with every feature OFF and shows a banner.

The fictional demo users each take a different path through the seeded prod rules for `new-dashboard` (users u_102, u_207 → customers acme → 10% rollout → otherwise OFF):

| User | Customer | new-dashboard (prod) | beta-reports (prod) |
|---|---|---|---|
| Ana · u_102 | none | ON, rule 1 (user list) | OFF |
| Ben · u_207 | acme | ON, rule 1 (user list) | ON (customer) |
| Cy · u_350 | acme | ON, rule 2 (customer list) | ON (customer) |
| Dee · u_303 | zenith | ON, rule 3 (in the 10% rollout) | OFF |
| Eli · u_412 | zenith | OFF (outside the 10%) | OFF |
| Anonymous | none | OFF (a rollout needs a user ID) | OFF |

`dark-mode` is OFF in prod and ON in dev, where it turns the store dark.

## Logins (dev seed data)

| User | Password | Role |
|---|---|---|
| `admin` | `admin-pass` | Everything |
| `editor` | `editor-pass` | Create flags, edit descriptions, change **dev** only |
| `viewer` | `viewer-pass` | Read-only |

Roles are enforced by the server. A denied request gets `403` and changes nothing.

## API

All endpoints need a login session except `POST /api/auth/login`. Changes need the `X-XSRF-TOKEN` header, set from the `XSRF-TOKEN` cookie. Errors are `application/problem+json`.

| Method | Path | Who | Body / notes |
|---|---|---|---|
| POST | `/api/auth/login` | anyone | `{username, password}` → `{username, role}` |
| POST | `/api/auth/logout` | logged in | 204 |
| GET | `/api/auth/me` | logged in | `{username, role}` |
| GET | `/api/environments` | logged in | `[{key, name}]` |
| GET | `/api/flags` | logged in | flags with per-env `enabled`, `otherwise`, `rules`, `version` |
| GET | `/api/flags/{key}` | logged in | one flag |
| POST | `/api/flags` | admin, editor | `{key, description}` → 201 |
| PATCH | `/api/flags/{key}` | admin, editor | `{description}` (key can't change) |
| DELETE | `/api/flags/{key}` | admin | 204; audit history kept |
| PUT | `/api/flags/{key}/envs/{env}/enabled` | admin; editor for dev | `{enabled, version}` |
| PUT | `/api/flags/{key}/envs/{env}/rules` | admin; editor for dev | `{rules, otherwise, version}` |
| GET | `/api/audit?flag=&env=&limit=` | logged in | newest first; limit 1–200, default 50 |
| POST | `/api/evaluate` | `X-SDK-Key` header | `{context: {userId?, attributes?}, flags?}` → results only, see below |

### Evaluation (`/api/evaluate`)

No login or CSRF token; the `X-SDK-Key` header picks the environment (`dev-sdk-key`, `prod-sdk-key` locally; set `SDK_KEY_DEV` / `SDK_KEY_PROD` in production). SDK keys end up in browser bundles, so the response holds **results only, never rules or targeting lists**:

```json
POST /api/evaluate   X-SDK-Key: prod-sdk-key
{"context": {"userId": "u_303", "attributes": {"customer": "zenith"}}}

{"environment": "prod",
 "flags": {"beta-reports":  {"value": false, "reason": "OTHERWISE"},
           "dark-mode":     {"value": false, "reason": "FLAG_OFF"},
           "new-dashboard": {"value": true,  "reason": "RULE_MATCH", "ruleIndex": 2, "ruleType": "percent"}}}
```

`reason` is `FLAG_OFF`, `RULE_MATCH`, `OTHERWISE` or `FLAG_NOT_FOUND`. `ruleIndex` (zero-based) and `ruleType` appear only for `RULE_MATCH`. Leave out `flags` to get all of them; unknown keys come back OFF with `FLAG_NOT_FOUND`. A missing context is anonymous, and null attributes are ignored.

Rules are an ordered list, and the first match wins:

```json
[{"type": "users", "userIds": ["u_102", "u_207"]},
 {"type": "customers", "customerIds": ["acme"]},
 {"type": "percent", "percent": 10, "serve": true}]
```

`serve` defaults to `true`. A stale `version` returns `409`; reload and retry.

## Assumptions

1. A flag that's ON with no rules serves its **Otherwise** value (default OFF). For "on for everyone", set Otherwise → ON or add a 100 % rule.
2. Rule types are user-ID list, customer list and percentage rollout. The engine accepts new rule types without changes to the evaluator.
3. Percentage rollouts bucket by `userId`. A request with no user ID skips percentage rules.
4. A user lands in the same rollout bucket in dev and prod.
5. Flag keys can't be renamed, since a rename would re-bucket everyone. Descriptions can be edited.
6. Deleting a flag is permanent. Its audit history is kept.
7. Roles: admin can do everything, editor can change dev only and can't delete flags, viewer is read-only. Enforced by the server.
8. Demo users are a fixed, fictional list inside the demo app.
9. There are exactly two environments, dev and prod.
10. A change that doesn't change anything (for example turning ON a flag that's already ON) is accepted but doesn't bump the version or write an audit entry.
11. The login endpoint is exempt from CSRF, so there's no token to fetch before logging in. Every other change needs the token.
12. Audit summaries don't name the environment, since each entry has its own `envKey` field.
13. The SDK key decides the environment, rather than an `env` field in the request, so a dev key can't read prod.
14. `/api/evaluate` exposes the matched rule's position and kind (e.g. "rule 3, percent") for debugging, but never who is targeted.
15. When the flag service is unreachable, the demo treats every flag as OFF (safe default) and says so.
