# Feature Flag Service: Plan

An internal feature-flag and progressive-rollout system: an admin dashboard, a Java backend on PostgreSQL, and a demo web app that shows it working end to end. Think of a much smaller LaunchDarkly.

Two constraints are fixed from the start:

- **The evaluation engine is plain Java with no framework dependencies**, so it can be tested hard in isolation.
- **Percentage rollouts are deterministic per user.** The same user gets the same answer for the same flag, on every call and every server.

## Architecture

```
feature-flags/
  engine/      plain Java 21 library. JDK only; JUnit 5 + AssertJ in test scope
  backend/     Spring Boot 3: REST, Spring Security sessions, Postgres (Flyway), audit; depends on engine
  admin/       React + TS + Vite: login + admin dashboard (nginx in compose, proxies /api)
  demo/        React + TS + Vite: mock storefront + debug panel (nginx in compose, proxies /api)
  sdk/         TS client (built in phase 6): isEnabled(), result cache, polling, live updates, outage fallback
  design/      shared design tokens for admin and demo (added after the plan)
  qa/          Playwright runner for the top 25 QA cases (added after the plan)
  docker-compose.yml   postgres + backend + admin + demo
  test.sh              mvn verify + SDK/admin/demo tests and builds
```

```
 admin (React) ──session cookie──▶ ┌──────────── backend (Spring) ────────────┐
                                   │ controllers → services → repositories    │ ──▶ PostgreSQL
 demo  (React) ──X-SDK-Key───────▶ │  /api/evaluate (+ SSE stream)            │
 agents (MCP)  ──Bearer API key──▶ │  /mcp → same services, AccessPolicy      │
                                   │      EngineMapper → engine.Evaluator     │
                                   └──────────────────────────────────────────┘
```

- Maven multi-module. The root pom is plain (no Spring parent). `backend` imports the `spring-boot-dependencies` BOM, so nothing Spring can leak into `engine`. A `maven-enforcer` `bannedDependencies` rule on `engine` fails the build if any non-test dependency appears.
- Backend layering: controller (HTTP only) → service (logic, authorization, audit) → repository (DB only). DB↔engine translation lives in one `EngineMapper`.
- Single backend instance. Config is read from the DB per evaluate call; add a cache only if it's needed.

## Evaluation engine (`engine/`)

```java
EvaluationResult Evaluator.evaluate(FlagConfig flag, EvaluationContext ctx)

record FlagConfig(String key, boolean enabled, List<Rule> rules, boolean otherwise)
record EvaluationContext(String userId, Map<String, String> attributes)
record EvaluationResult(boolean value, Reason reason, Integer matchedRuleIndex)
enum   Reason { FLAG_OFF, RULE_MATCH, OTHERWISE, FLAG_NOT_FOUND }

interface Rule {
    boolean matches(String flagKey, EvaluationContext ctx);
    boolean serve();
}
```

- **Context is open-ended.** `userId` is nullable. `attributes` is defensively copied and never null, and `attribute(name)` returns null when a key is absent. `CustomerIdIn` reads `attribute("customer")`. A rule on a new attribute (for example `country`) needs no change to the context, the mapper or the API.
- **Open/closed.** The evaluator only loops over rules and never switches on their type. Built-in rules are records: `UserIdIn`, `CustomerIdIn`, `PercentRollout`. A new rule type is a new class plus one JSON-type registration in the backend; the evaluator doesn't change.
- **Semantics.** If the flag is disabled in the env, the result is `false` with `FLAG_OFF`. Otherwise rules run top to bottom and the **first match wins**, returning that rule's `serve`. If nothing matches, the result is the `otherwise` value (default `false`), shown in the UI as an **"Otherwise → ON/OFF" row under the rules**.
- **Pure.** No I/O, clock, randomness, logging or mutable static state. Records with defensive copies; constructors validate (non-null key, percent 0–100, non-empty ID lists).

### Deterministic rollout (`Bucketing`)

```
bucket  = unsigned(murmur3_x86_32(utf8(flagKey + ":" + userId), seed 0)) mod 10_000
matches = bucket < percent * 100
```

- Murmur3 is hand-written inside `engine` (~40 lines), so there's no Guava.
- Properties, each tested:
  - the same (flag, user) always gives the same answer, across runs and environments;
  - **monotonic**: raising 5 % → 10 % keeps everyone who was in the 5 %;
  - independent per flag: being in flag A's 10 % says nothing about flag B;
  - no or blank `userId` → the rule doesn't match and evaluation falls through.
- **Golden vectors** pin the hash. Changing it would re-bucket every user in production, so those expected values are never edited to make a test pass.

### Engine tests

Flag off overrides rules; first-match ordering; each rule matches and misses; null/blank context; empty rules → otherwise (true and false); 0 % and 100 %; murmur3 against published reference vectors; golden buckets; monotonicity over 10k users; distribution (100k users within ±1 % at 10/25/50 %); independence between two flags; a custom test-only `Rule` works with no evaluator change; a test-only rule reads an attribute the engine has never heard of; the attributes map is immutable and null-safe; constructor validation.

## Data model (PostgreSQL, Flyway)

```sql
environment      (key text PK, name text, sort_order int)        -- 'dev','prod' seeded
app_user         (id bigserial PK, username text UNIQUE, password_hash text,  -- BCrypt
                  role text CHECK (role IN ('ADMIN','EDITOR','VIEWER')))
flag             (id bigserial PK, key text UNIQUE NOT NULL,      -- immutable
                  description text, created_at, updated_at)
flag_environment (flag_id FK ON DELETE CASCADE, env_key FK, enabled bool, otherwise bool,
                  rules jsonb NOT NULL default '[]',              -- ordered array
                  version int NOT NULL default 0,                 -- optimistic lock
                  updated_at, PRIMARY KEY (flag_id, env_key))
audit_event      (id bigserial PK, at timestamptz, actor text,    -- logged-in username
                  flag_key text,                                  -- no FK: survives deletes
                  env_key text NULL, action text, summary text,   -- "rollout 5% → 10%"
                  before jsonb, after jsonb)
```

- Rules are stored as one ordered JSONB array, saved whole and guarded by `version` (409 on conflict).
- Creating a flag creates one disabled `flag_environment` row per environment.
- Every mutation writes its audit row in the same transaction. The `summary` is in plain words, built by an `AuditDiff` service from before/after: "turned ON in prod", "rollout 5% → 10%", "added rule: users u_102, u_207", "rules reordered", "description changed". Unit-tested.
- Flag key regex: `^[a-z0-9][a-z0-9-]{0,62}$`.
- Seed users: `admin`, `editor`, `viewer`. Their dev passwords live only in the seed migration and README.

## Auth and roles (enforced on the server)

- Spring Security with a session cookie. `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me` → `{username, role}`. CSRF via a cookie token that the admin SPA sends back.
- An `AccessPolicy` service is the single place that decides, and services call it (controllers don't):

| Action | ADMIN | EDITOR | VIEWER |
|---|:-:|:-:|:-:|
| read flags, audit | ✓ | ✓ | ✓ |
| toggle / edit rules in **dev** | ✓ | ✓ | ✗ |
| toggle / edit rules in **prod** | ✓ | ✗ | ✗ |
| create flag, edit description | ✓ | ✓ | ✗ |
| delete flag | ✓ | ✗ | ✗ |

- A denied action returns 403 problem+json. The UI hides or disables controls based on `/me`, but the server is the authority. Tests cover every cell of the table.
- The demo app and the SDK call `/api/evaluate` with a per-env SDK key (`X-SDK-Key`, from env vars), not a user login.

## REST API

Errors use `application/problem+json`. Validation runs at the boundary (`@Valid` DTOs plus rule-shape checks) and fails fast with field-level messages.

| Method | Path | Who | Purpose |
|---|---|---|---|
| POST | `/api/auth/login`, `/api/auth/logout` | anyone | session login/out |
| GET | `/api/auth/me` | logged in | current user, role, and `can` (what they may change, computed by `AccessPolicy`) |
| GET | `/api/environments` | logged in | list envs |
| GET | `/api/flags` | logged in | flags with per-env state |
| POST | `/api/flags` | admin, editor | create `{key, description}` |
| GET | `/api/flags/{key}` | logged in | flag + per-env config |
| PATCH | `/api/flags/{key}` | admin, editor | edit description |
| DELETE | `/api/flags/{key}` | admin | delete (audit kept) |
| PUT | `/api/flags/{key}/envs/{env}/enabled` | per role table | `{enabled, version}` |
| PUT | `/api/flags/{key}/envs/{env}/rules` | per role table | `{rules, otherwise, version}` |
| GET | `/api/audit?flag=&env=&limit=` | logged in | newest first |
| POST | `/api/evaluate` | SDK key (decides the env) | `{context:{userId, attributes:{customer:"acme"}}, flags?}` → `{environment, flags: {key: {value, reason, ruleIndex?, ruleType?}}}`. Results only, never rules |
| GET | `/api/evaluate/stream?sdkKey=` | SDK key | *(stretch, built in phase 6)* SSE: `ready`, then `changed {environment, flagKey}` after commit. The path changed from `/api/envs/{env}/stream`: the key decides the env, as for `/evaluate`, and goes in the query because EventSource can't send headers |

An unknown flag at `/evaluate` returns `false` with `FLAG_NOT_FOUND` and HTTP 200, so a typo can't crash a client. Evaluation always runs on the server, so targeting lists never reach a browser.

*Changed in phase 3:* the environment comes from the SDK key instead of an `env` field, so a dev key can't read prod. Results also carry `ruleType` ("users", "customers", "percent") for the debug panel; it names the kind of rule, not its targets.

## Frontends

*As planned; what shipped differs as noted under "Added after the plan" below.*

- **admin**: login page; flag table with dev/prod toggles; a detail panel per env with the ordered rule editor (add/remove/reorder; user-ID list, customer-ID list, % slider) and an "Otherwise" row; audit list ("editor · rollout 5% → 10% · 2 min ago"); "+ New flag"; delete with confirm. Controls follow the user's role. TanStack Query.
- **demo**: mock storefront with a "Viewing as" dropdown of fictional users (a static list in the app). It evaluates all flags before first render and shows a debug panel with each value and reason, plus a refresh button (SSE in stretch).
- Seed flags: `new-dashboard`, `beta-reports`, `dark-mode`, matching the wireframe. All data is fictional.

## Build phases (commit after each)

All phases are done (phase 6 included both stretch items).

| # | Phase | Done when |
|---|---|---|
| 0 | Scaffold: git, root + module poms, backend boots with `/actuator/health` against Postgres, admin and demo placeholder pages behind nginx, Dockerfiles, compose, `test.sh` | `docker compose up` → all four containers up, health UP, both pages load; `./test.sh` green |
| 1 | **Engine + full test suite** (tests first) | all engine tests above green |
| 2 | Flyway schema + seed, auth + roles + `AccessPolicy`, admin API, audit + `AuditDiff`, validation; API tests (Testcontainers) including the role matrix | curl walkthrough per role works |
| 3 | `/evaluate` + demo app + debug panel | switching users changes the storefront |
| 4 | Admin UI with login | the wireframe flow works for each role |
| 5 | README (setup, endpoint table, assumptions, seeded logins), ai-log tidy | clean clone → `docker compose up` → everything works |
| 6 | Stretch, in order: SSE live updates → TS SDK (result cache, polling, outage fallback) | — |

Finish what's started: a phase is either complete or not begun. Stretch items get cut first.

## Decisions on unclear points in the brief

These are also recorded in the README under Assumptions.

1. A flag that's ON with no rules serves its **Otherwise** value (default OFF). For "on for everyone", set Otherwise → ON or add a 100 % rule.
2. Rule types are user-ID list, customer list and percentage rollout. There are no generic attribute/operator rules yet, but the engine is open to them.
3. Rollouts bucket by `userId` only. A user with no ID skips percentage rules.
4. A user lands in the same bucket in dev and prod, because the hash ignores the env.
5. Flag keys are immutable, since a rename would re-bucket everyone. Descriptions are editable.
6. Delete is a hard delete. Audit rows survive because they store the key as text.
7. Editors can create flags and edit descriptions but not delete flags, because a delete also wipes prod config.
8. Demo users are a static fictional list in the demo app, not DB rows.
9. Environments are a fixed dev/prod pair, with no create-env API. The schema allows more.

## Added after the plan: agents (MCP) and API keys

- `/mcp`: an MCP server (official Java SDK, stateless Streamable HTTP) in the backend. Twelve tools mirror the dashboard: whoami, list_environments, list_flags, get_flag, get_audit_log, suggest_ids, find_unseen_ids, create_flag, update_flag_description, delete_flag, set_flag_enabled, set_flag_rules.
- `api_key` table: name, role, display prefix, SHA-256 of the token, created_by, expires_at, last_used_at, revoked_at/by. Admin-only management at `/api/keys`.
- Decisions (asked, not assumed): MCP lives inside the backend; a key is a fixed role (not fine-grained scopes); only admins create keys.
- `/api/contexts` (seen user/customer IDs) feeds both the editor's suggestions and the `suggest_ids`/`find_unseen_ids` tools.

## Added after the plan: Activity

- `GET /api/audit` gains `q` (text in summary, flag key or actor; LIKE wildcards escaped), `action`, `actor` (person / key) and a `before` cursor for paging. Existing callers are unchanged. The MCP `get_audit_log` tool takes the same filters.
- Admin **Activity** tab: the whole trail, grouped by day, searchable and filterable, with "Load older" and links to each flag.

## Added after the plan: rule-ID checks and suggestions

- Rule user and customer IDs are validated at the API boundary (letters, digits and `_ . : @ -`, starting with a letter or digit, max 128); a bad one is a 400 naming the field, e.g. `rules[0].userIds[1]`.
- `seen_context` table (V3): user and customer IDs the service has evaluated, with first/last seen. `/api/contexts` and `/api/contexts/unseen` feed the editor's suggestions and its "never seen" warning (still allowed: you may target someone before their first visit), and the MCP `suggest_ids` / `find_unseen_ids` tools.

## Added after the plan: an admin for product managers

- The flag table and side panel became one list of **expandable rows**. Collapsed, a row leads with a Live / Partial / Off badge for prod (icon + word) and a plain-English audience sentence (`audience.ts`, unit-tested against the engine's semantics). Expanded: environment tabs, a status card, rules as cards with ID chips, the flag's history, and settings with a danger zone.
- Prod switches confirm first, in words that match what will happen (`prodImpact`).
- `?flag=&env=` in the URL keeps the expanded flag across reloads and shared links.

## Added after the plan: one design system

- GitHub Primer semantic colour tokens, light and dark, in `design/tokens.css`, imported by admin and demo. 4px spacing grid, 6px radius, borders over shadows, Inter, motion only on transform/opacity.
- `admin/src/contrast.test.ts` checks every text/background pair the apps use at 4.5:1 (icons 3:1) in both themes.
- Admin: light / dark / system toggle. Storefront: its theme is the `dark-mode` flag, so the demo shows a flag at work.

## Added after the plan: QA

- `docs/qa-test-plan.md`: 161 manual cases plus 9 regression checks across admin, storefront, MCP, end-to-end and security.
- `docs/qa-top-25.md`: the 25 most important, automated by `qa/` (Playwright) against a separate compose project (`ff-qa`, ports 6173/6174) reset to seed data, with a recorded video, screenshots and `qa/results/REPORT.md`. Latest: 25/25; it found one bug (Discard stuck after typing a malformed ID), fixed.
