# Feature Flags

An internal feature-flag and progressive-rollout service, a much smaller LaunchDarkly. It has three parts: an **admin dashboard** where product managers turn flags on per environment and target users, customers or a percentage of traffic; a **Java backend** on PostgreSQL that evaluates them; and a **demo storefront** that shows it working end to end.

## Run it

You need Docker.

```bash
docker compose up --build
```

| | URL | |
|---|---|---|
| Admin dashboard | http://localhost:5173 | sign in with a login below |
| Demo storefront | http://localhost:5174 | no login |
| Backend health | http://localhost:8080/actuator/health | |

The first build takes a few minutes; Maven and npm download dependencies. Seed data (three flags, three logins, demo users) loads on first start. To start over from seed data, run `docker compose down -v`.

If a port is already taken, override it: `ADMIN_PORT`, `DEMO_PORT`, `BACKEND_PORT`, `POSTGRES_PORT` (Postgres listens on `127.0.0.1:5433` by default).

### Logins (fictional dev seed data)

| User | Password | Can |
|---|---|---|
| `admin` | `admin-pass` | everything |
| `editor` | `editor-pass` | create flags, edit descriptions, change **dev** only; can't delete |
| `viewer` | `viewer-pass` | read-only |

## Two-minute walkthrough

1. Open the **demo** (http://localhost:5174). **Viewing as** Ben (acme) sees the *New dashboard* and *Beta reports* cards. The debug panel says why: "matched rule 1 (user ID list)", "matched rule 1 (customer list)", "flag is OFF in prod".
2. Switch to **Dee**: still the new dashboard, this time via "rule 3 (% rollout)". Switch to **Eli**: nothing matches, so you get the classic home page. Switch **Env** to dev: everything is ON and the store goes dark (`dark-mode`).
3. Open the **admin** (http://localhost:5173) and sign in as `editor`. The prod switches are disabled and prod rules are read-only. Dev is editable.
4. Sign in as `admin`, open `dark-mode`, and in **prod** change the rollout from 25% to 100%. Turn on its prod switch.
5. Back in the demo (prod), press **Refresh**: every user with an ID now gets the dark theme. The flag's history in the admin reads "admin · prod · rollout 25% → 100%" and "admin · prod · turned ON".

## What's built

From the brief's **must-haves**:

| Must-have | Where |
|---|---|
| Boolean flags with key + description; dev and prod each with their own on/off state and rules | `flag` + `flag_environment` tables; admin table + detail panel |
| Admin UI: list, toggle per environment, edit rules | `admin/` (React + TanStack Query) |
| Audit log: flag, environment, what changed, when, who | `audit_event`; plain-words summaries such as "rollout 5% → 10%" |
| Unit tests on the evaluation engine: rules, rollout determinism, defaults | `engine/src/test`: 91 tests |
| Separate demo web app that reads the flags | `demo/`: mock storefront, user switcher, debug panel |

Beyond them:
- **Role-based access** (a stretch item): admin / editor / viewer, enforced on the server, so only admins can change prod.
- **Results-only evaluation API**: SDK keys are public, so no rules or targeting lists are ever returned.
- **Optimistic locking**: concurrent edits get a clear conflict, not a silent overwrite.
- **Resilience**: the demo renders with everything OFF if the flag service is down.

Not built: live updates (SSE/WebSocket) and the TypeScript client SDK. See [What's missing](#whats-missing-and-how-id-build-it).

## Architecture

```
 admin (React) ──session cookie + CSRF──▶ ┌────────────── backend (Spring Boot) ──────────────┐
                                          │ controllers → services → repositories (JDBC)      │──▶ PostgreSQL
 demo  (React) ──X-SDK-Key──────────────▶ │                  │                                 │    (Flyway)
                                          │      EngineMapper → engine.Evaluator (plain Java)  │
                                          └────────────────────────────────────────────────────┘
```

| Module | What |
|---|---|
| `engine/` | The evaluation engine. **Plain Java 21, no dependencies** (a Maven enforcer rule fails the build if one is added), so it can be tested hard. |
| `backend/` | Spring Boot 3: REST API, session login with CSRF, `AccessPolicy` (the one place permissions are decided), audit, Flyway migrations. |
| `admin/` | Admin dashboard, React + TypeScript + Vite, served by nginx. |
| `demo/` | Demo storefront, React + TypeScript + Vite, served by nginx. |
| `docs/` | [plan.md](docs/plan.md) (design), [ai-log.md](docs/ai-log.md) (how the AI was directed). |

## How evaluation works

For one flag, one environment and one user context (`userId` plus attributes such as `customer`):

1. If the flag is **disabled** in that environment, the answer is OFF (`FLAG_OFF`).
2. Otherwise the **rules** are checked top to bottom and the **first match wins**. Each rule serves ON or OFF (`RULE_MATCH`):
   - **User ID in** a list
   - **Customer in** a list (the `customer` attribute)
   - **Percentage rollout**
3. If nothing matches, the flag serves its **Otherwise** value, which defaults to OFF (`OTHERWISE`).

**Percentage rollouts are deterministic per user.** Each user is hashed into one of 10,000 buckets:

```
bucket(flag, user) = murmur3_x86_32(utf8(flagKey + ":" + userId)) mod 10000
```

The rollout matches when `bucket < percent × 100`. So:
- The same user gets the same answer on every call and server, in dev and prod.
- Raising 5% → 10% only *adds* users.
- Each flag buckets users independently.

Users without an ID never match a rollout. The hash is pinned by golden test vectors, which were derived from a separate Python implementation rather than captured from the Java one.

New rule types plug in as a new `Rule` class; the evaluator doesn't change (a test proves it with a rule on an attribute the engine has never heard of).

## API

All endpoints need a login session except `POST /api/auth/login` and `POST /api/evaluate`. Changes need the `X-XSRF-TOKEN` header, set from the `XSRF-TOKEN` cookie. Errors are `application/problem+json`.

| Method | Path | Who | Body / notes |
|---|---|---|---|
| POST | `/api/auth/login` | anyone | `{username, password}` → same as `/me` |
| POST | `/api/auth/logout` | logged in | 204 |
| GET | `/api/auth/me` | logged in | `{username, role, can: {createFlag, editDescription, deleteFlag, changeEnvironments}}` |
| GET | `/api/environments` | logged in | `[{key, name}]` |
| GET | `/api/flags` | logged in | flags with per-env `enabled`, `otherwise`, `rules`, `version` |
| GET | `/api/flags/{key}` | logged in | one flag |
| POST | `/api/flags` | admin, editor | `{key, description}` → 201 |
| PATCH | `/api/flags/{key}` | admin, editor | `{description}`; the key can't change |
| DELETE | `/api/flags/{key}` | admin | 204; audit history kept |
| PUT | `/api/flags/{key}/envs/{env}/enabled` | admin; editor for dev | `{enabled, version}` |
| PUT | `/api/flags/{key}/envs/{env}/rules` | admin; editor for dev | `{rules, otherwise, version}` |
| GET | `/api/audit?flag=&env=&limit=` | logged in | newest first; limit 1–200, default 50 |
| POST | `/api/evaluate` | `X-SDK-Key` header | `{context: {userId?, attributes?}, flags?}` → results only |

Rules are an ordered list; `serve` defaults to `true`:

```json
[{"type": "users", "userIds": ["u_102", "u_207"]},
 {"type": "customers", "customerIds": ["acme"]},
 {"type": "percent", "percent": 10, "serve": true}]
```

A stale `version` returns `409`; reload and retry. Turning a flag on or off doesn't block someone else's rules edit in the admin UI, which picks up the new version automatically.

### Evaluation (`/api/evaluate`)

The SDK key decides the environment (`dev-sdk-key` / `prod-sdk-key` locally; set `SDK_KEY_DEV` / `SDK_KEY_PROD` otherwise), so a dev key can't read prod. SDK keys end up in browser bundles, so the response holds **results only, never rules or targeting lists**:

```json
POST /api/evaluate   X-SDK-Key: prod-sdk-key
{"context": {"userId": "u_303", "attributes": {"customer": "zenith"}}}

{"environment": "prod",
 "flags": {"beta-reports":  {"value": false, "reason": "OTHERWISE"},
           "dark-mode":     {"value": false, "reason": "FLAG_OFF"},
           "new-dashboard": {"value": true,  "reason": "RULE_MATCH", "ruleIndex": 2, "ruleType": "percent"}}}
```

- `ruleIndex` (zero-based) and `ruleType` appear only for `RULE_MATCH`.
- Leave out `flags` to get every flag. Unknown keys come back OFF with `FLAG_NOT_FOUND`, not an error.
- A missing context is anonymous, and null attributes are ignored.

### Demo users

They're fictional, and each takes a different path through the seeded prod rules for `new-dashboard` (users u_102, u_207 → customers acme → 10% rollout → otherwise OFF):

| User | Customer | new-dashboard (prod) | beta-reports (prod) |
|---|---|---|---|
| Ana · u_102 | – | ON, rule 1 (user list) | OFF |
| Ben · u_207 | acme | ON, rule 1 (user list) | ON (customer) |
| Cy · u_350 | acme | ON, rule 2 (customer list) | ON (customer) |
| Dee · u_303 | zenith | ON, rule 3 (in the 10%) | OFF |
| Eli · u_412 | zenith | OFF (outside the 10%) | OFF |
| Anonymous | – | OFF (a rollout needs a user ID) | OFF |

## Tests

```bash
./test.sh
```

It needs only Docker, and uses a local JDK 21+ / Node 20+ if present (otherwise those steps run in containers). Backend tests run against a real Postgres via Testcontainers. 241 tests in total:

| Suite | Tests | Covers |
|---|---|---|
| `engine` | 91 | first-match order, flag off, Otherwise, every rule type, null/blank context, murmur3 reference vectors, golden buckets, monotonic rollouts, distribution within ±1% over 100k users, independence between flags, open/closed rule extension |
| `backend` | 134 | every cell of the role matrix over HTTP with real logins (and as a unit), an editor trying every route into prod, permissions shown to the UI matching real enforcement, CSRF over real HTTP, validation, conflicts, plain-words audit, `/evaluate` never leaking rules |
| `admin`, `demo` | 16 | rule-draft parsing, relative times, reason explanations, URL state |

No end-to-end browser tests (per the brief). Each UI flow was checked by hand in a browser; see [docs/ai-log.md](docs/ai-log.md).

## Assumptions

1. A flag that's ON with no rules serves its **Otherwise** value (default OFF). For "on for everyone", set Otherwise → ON or add a 100% rule.
2. Rule types are user-ID list, customer list and percentage rollout. The engine accepts new rule types without changes to the evaluator.
3. Percentage rollouts bucket by `userId`. A request with no user ID skips percentage rules.
4. A user lands in the same rollout bucket in dev and prod.
5. Flag keys can't be renamed, since a rename would re-bucket everyone. Descriptions can be edited.
6. Deleting a flag is permanent, and its audit history is kept.
7. Roles: admin can do everything, editor can change dev only and can't delete flags (that would wipe prod too), viewer is read-only. Enforced by the server.
8. Demo users are a fixed, fictional list inside the demo app.
9. There are exactly two environments, dev and prod.
10. A change that doesn't change anything (e.g. turning ON a flag that's already ON) is accepted but doesn't bump the version or write an audit entry.
11. The login endpoint is exempt from CSRF; every other change needs the token.
12. Audit summaries don't name the environment, since each entry has its own `envKey` field.
13. The SDK key decides the environment, rather than an `env` field in the request.
14. `/api/evaluate` exposes the matched rule's position and kind (e.g. "rule 3, percent") for debugging, never who is targeted.
15. When the flag service is unreachable, the demo treats every flag as OFF (safe default) and says so.

## What's missing, and how I'd build it

- **Live updates (SSE):** a `GET /api/envs/{env}/stream` endpoint that sends "config changed" after each committed write (a transactional event listener). The demo would refetch on that event. Today it refreshes on button press or window focus.
- **TypeScript SDK:** `client.isEnabled("new-dashboard", user)` on top of `/api/evaluate`, with an in-memory per-user result cache refreshed by polling (or the SSE stream) and served from cache during an outage. The demo's fetch-before-render and all-OFF fallback are the start of it.
- **Scale:** evaluation reads flags from Postgres on every call. With more traffic I'd keep an in-memory snapshot per environment, invalidated on writes (or via Postgres `LISTEN/NOTIFY` across instances).
- **Production hardening:**
  - real secrets for SDK keys and DB credentials;
  - login rate limiting;
  - user management instead of seeded users;
  - audit pagination;
  - CI running `./test.sh`.
- **Known issue (tests only):** MockMvc's `csrf()` helper changes the CSRF filter in Spring's shared test context, which made one cookie assertion depend on test order. The trigger is confirmed, but why the cookie disappears is not yet explained. Real CSRF behaviour is covered over real HTTP instead. Details in [docs/ai-log.md](docs/ai-log.md#known-issue-mockmvc-csrf-changes-the-shared-csrf-filter).

## How this was built with AI

Built with Claude Code, directed phase by phase, with a review and course correction between each phase. The agent setup is committed:

- [CLAUDE.md](CLAUDE.md): the conventions and design principles the agent works to, and when it must stop and ask.
- [docs/plan.md](docs/plan.md): the design, agreed before any code.
- [docs/ai-log.md](docs/ai-log.md): the prompts for each phase, where the AI fell short and how it was corrected (a hard-coded attribute that broke open/closed, a recurring null bug fixed at the source, an order-dependent test investigated rather than replaced), and the bugs that only browser testing found.

## Project layout

```
engine/    evaluation engine (plain Java) + tests
backend/   Spring Boot API, Flyway migrations (db/migration), tests
admin/     admin dashboard (React)
demo/      demo storefront (React)
docs/      plan.md, ai-log.md
test.sh    every test + frontend builds
```
