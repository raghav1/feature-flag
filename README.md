# Feature Flags

An internal feature-flag and progressive-rollout service: admin dashboard, Java backend on PostgreSQL, and a demo storefront that reads the flags.

> Work in progress. Phases 0–2 are done: scaffold, evaluation engine, and the admin API with login, roles and audit. The admin and demo UIs are placeholders. See [docs/plan.md](docs/plan.md).

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
