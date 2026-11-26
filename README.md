# Feature Flags

An internal feature-flag and progressive-rollout service, a much smaller LaunchDarkly. It has three parts: an **admin dashboard** where product managers turn flags on per environment and target users, customers or a percentage of traffic; a **Java backend** on PostgreSQL that evaluates them; and a **demo storefront** that shows it working end to end.

## Run it

You need Docker.

```bash
git clone https://github.com/raghav1/feature-flag.git
cd feature-flag
docker compose up --build
```

| | URL | |
|---|---|---|
| Admin dashboard | http://localhost:5173 | sign in with a login below |
| Demo storefront | http://localhost:5174 | no login |
| Backend health | http://localhost:8080/actuator/health | |

The first build takes a few minutes; Maven and npm download dependencies. Seed data (four flags, three logins, demo users) loads on first start. To start over from seed data, run `docker compose down -v`.

If a port is already taken, override it: `ADMIN_PORT`, `DEMO_PORT`, `BACKEND_PORT`, `POSTGRES_PORT` (Postgres listens on `127.0.0.1:5433` by default).

### Logins (fictional dev seed data)

> **Local demo only.** These logins, the SDK keys (`dev-sdk-key` / `prod-sdk-key`) and the Postgres password (`flags`) are made-up defaults so the stack runs with one command on your machine. They are not secrets and protect nothing real. For any shared or real deployment, set `SDK_KEY_DEV`, `SDK_KEY_PROD` and the database credentials through the environment, and replace the seeded users.

| User | Password | Can |
|---|---|---|
| `admin` | `admin-pass` | everything |
| `editor` | `editor-pass` | create flags, edit descriptions, change **dev** only; can't delete |
| `viewer` | `viewer-pass` | read-only |

## Two-minute walkthrough

1. Open the **demo** (http://localhost:5174). **Viewing as** Ben (acme, CA) sees the *New dashboard*, *Beta reports* and *Free shipping* cards. The debug panel says why: "matched rule 1 (user ID list)", "matched rule 1 (customer list)", "matched rule 1 (attribute)" (his country is CA), "flag is OFF in prod".
2. Switch to **Dee**: still the new dashboard, this time via "rule 3 (% rollout)". Switch to **Eli**: nothing matches, so you get the classic home page. Click **Dev** in the header: everything is ON and the store goes dark (`dark-mode`).
3. Open the **admin** (http://localhost:5173) and sign in as `editor`. Each flag is a row that says whether it's **Live, Partial or Off in prod** and who gets it, in plain words. The prod switches are locked for an editor; click a row to expand it, and dev is editable.
4. Sign in as `admin`, expand `dark-mode`, and in **Production** change the rollout to 100% and save. Turn on its prod switch: a dialog says who will get it before anything changes.
5. Back in the demo (prod), no refresh is needed: the change arrives over the live stream and every user with an ID now gets the dark theme. The flag's history in the admin reads "admin · prod · rollout 25% → 100%" and "admin · prod · turned ON".

## What's built

From the brief's **must-haves**:

| Must-have | Where |
|---|---|
| Boolean flags with key + description; dev and prod each with their own on/off state and rules | `flag` + `flag_environment` tables; admin flag list with expandable rows |
| Admin UI: list, toggle per environment, edit rules | `admin/` (React + TanStack Query) |
| Audit log: flag, environment, what changed, when, who | `audit_event`; plain-words summaries such as "rollout 5% → 10%" |
| Unit tests on the evaluation engine: rules, rollout determinism, defaults | `engine/src/test`: 103 tests |
| Separate demo web app that reads the flags | `demo/`: mock storefront, "Viewing as" user switcher, Dev/Prod switch, debug panel |

Beyond them:
- **Role-based access** (a stretch item): admin / editor / viewer, enforced on the server, so only admins can change prod.
- **Results-only evaluation API**: SDK keys are public, so no rules or targeting lists are ever returned.
- **Optimistic locking**: concurrent edits get a clear conflict, not a silent overwrite.
- **Resilience**: if the flag service is down, the demo keeps its last known flags (marked stale), or renders with everything OFF if it has none.

- **An admin built for product managers**: each flag is one expandable row that leads with **Live / Partial / Off in prod** and who gets it in plain English ("On for users u_102 and u_207, customer acme and 10% of users"). Prod changes confirm first and say who's affected; rule IDs are checked as you type, with suggestions from IDs the service has seen. An **Activity** tab searches the whole audit trail; an **API keys** tab (admins only) issues keys for agents.
- **One design system for both apps**: GitHub Primer colour tokens in `design/tokens.css`, light and dark, with a test that every text colour pair meets 4.5:1 contrast. The admin has a light / dark / system toggle; the storefront's theme is the `dark-mode` flag itself.
- **Live updates** (stretch): the demo listens to a server-sent event stream and refetches when a flag changes, so admin changes show up without a refresh. It reconnects by itself after outages and catches up on anything it missed.

- **MCP server for agents**: any MCP client (Claude Code, Claude Desktop, …) can read and change everything the dashboard can, with an API key that acts as one role. See [Agents (MCP)](#agents-mcp).
- **TypeScript client SDK** (stretch): `client.isEnabled("new-dashboard", user)` from an in-memory cache, kept fresh by polling and the live stream. It **keeps working from cache during a backend outage**, even across a page reload. The demo uses it. See [SDK](#typescript-sdk).

## Architecture

```
 admin (React) ──session cookie + CSRF──▶ ┌────────────── backend (Spring Boot) ──────────────┐
                                          │ controllers → services → repositories (JDBC)      │──▶ PostgreSQL
 demo  (React) ──SDK: X-SDK-Key─────────▶ │  /api/evaluate, /api/evaluate/stream (SSE)        │    (Flyway)
   └ @flags/sdk (cache, polling, live)    │                  │                                 │
 agents (MCP)  ──Bearer API key─────────▶ │  /mcp → same services, same AccessPolicy           │
                                          │      EngineMapper → engine.Evaluator (plain Java)  │
                                          └────────────────────────────────────────────────────┘
```

| Module | What |
|---|---|
| `engine/` | The evaluation engine. **Plain Java 21, no dependencies** (a Maven enforcer rule fails the build if one is added), so it can be tested hard. |
| `backend/` | Spring Boot 3: REST API, session login with CSRF, `AccessPolicy` (the one place permissions are decided), audit, Flyway migrations, and the MCP server at `/mcp` for agents. |
| `admin/` | Admin dashboard, React + TypeScript + Vite, served by nginx. |
| `demo/` | Demo storefront, React + TypeScript + Vite, served by nginx. Reads flags through the SDK. |
| `sdk/` | TypeScript client SDK: cached `isEnabled`, polling, live updates, outage fallback. |
| `design/` | `tokens.css`: the colour, spacing and type tokens both frontends use (GitHub Primer palette, light and dark). |
| `qa/` | Playwright runner that executes the [top 25 QA cases](docs/qa-top-25.md) in a real browser, with video, screenshots and a [report](qa/results/REPORT.md). Run on demand, not part of `./test.sh`. |
| `docs/` | [plan.md](docs/plan.md) (design), [ai-log.md](docs/ai-log.md) (how the AI was directed), [qa-test-plan.md](docs/qa-test-plan.md) and [qa-top-25.md](docs/qa-top-25.md) (QA). |

## How evaluation works

For one flag, one environment and one user context (`userId` plus attributes such as `customer` or `country`):

1. If the flag is **disabled** in that environment, the answer is OFF (`FLAG_OFF`).
2. Otherwise the **rules** are checked top to bottom and the **first match wins**. Each rule serves ON or OFF (`RULE_MATCH`):
   - **User ID in** a list
   - **Customer in** a list (the `customer` attribute)
   - **Percentage rollout**
   - **Attribute in / not in** a list: any context attribute, e.g. `country in [US, CA]`. Values match exactly (case-sensitive); a missing or blank attribute never matches, for either operator
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

New rule types plug in as a new `Rule` class; the evaluator doesn't change (a test proves it with a rule on an attribute the engine has never heard of). The attribute rule was added exactly that way.

## API

All endpoints need a login session except `POST /api/auth/login` and `POST /api/evaluate`. Changes need the `X-XSRF-TOKEN` header, set from the `XSRF-TOKEN` cookie. Errors are `application/problem+json`.

| Method | Path | Who | Body / notes |
|---|---|---|---|
| POST | `/api/auth/login` | anyone | `{username, password}` → same as `/me` |
| POST | `/api/auth/logout` | logged in | 204 |
| GET | `/api/auth/me` | logged in | `{username, role, can: {createFlag, editDescription, deleteFlag, changeEnvironments, manageApiKeys}}` |
| GET | `/api/environments` | logged in | `[{key, name}]` |
| GET | `/api/flags` | logged in | flags with per-env `enabled`, `otherwise`, `rules`, `version` |
| GET | `/api/flags/{key}` | logged in | one flag |
| POST | `/api/flags` | admin, editor | `{key, description}` → 201 |
| PATCH | `/api/flags/{key}` | admin, editor | `{description}`; the key can't change |
| DELETE | `/api/flags/{key}` | admin | 204; audit history kept |
| PUT | `/api/flags/{key}/envs/{env}/enabled` | admin; editor for dev | `{enabled, version}` |
| PUT | `/api/flags/{key}/envs/{env}/rules` | admin; editor for dev | `{rules, otherwise, version}` |
| GET | `/api/audit?flag=&env=&q=&action=&actor=&before=&limit=` | logged in | newest first; `q` searches summary, flag and actor; `action` e.g. `FLAG_TOGGLED`; `actor` = `person` or `key`; page back with `before=<oldest id you have>`; limit 1–200, default 50 |
| GET | `/api/contexts?kind=user\|customer&query=&limit=` | logged in | IDs the service has evaluated, most recent first (for suggestions) |
| GET | `/api/contexts/unseen?kind=&value=…` | logged in | which of the given IDs were never evaluated (for warnings) |
| GET | `/api/keys` | admin | agent API keys (never the token) |
| POST | `/api/keys` | admin | `{name, role, expiresInDays?}` → 201 `{key, token}`; the token is shown only here |
| DELETE | `/api/keys/{id}` | admin | revoke; takes effect on the next request |
| POST | `/mcp` | API key (`Authorization: Bearer ffk_…`) | MCP over Streamable HTTP; see [Agents (MCP)](#agents-mcp) |
| POST | `/api/evaluate` | `X-SDK-Key` header | `{context: {userId?, attributes?}, flags?}` → results only |
| GET | `/api/evaluate/stream?sdkKey=` | SDK key (query param or header) | server-sent events: `ready`, then `changed {environment, flagKey}` after each committed change |

Rule user and customer IDs, and attribute rule values, must start with a letter or digit and use only letters, digits and `_ . : @ -` (max 128); anything else is a 400 naming the field, e.g. `rules[0].userIds[1]` or `rules[0].values[1]`. IDs the service has never seen are allowed (you may target someone before their first visit). Attribute names are lowercase (`^[a-z][a-z0-9_]{0,63}$`, e.g. `country`, `app_version`), and `operator` is required: `in` or `not_in`.

Rules are an ordered list; `serve` defaults to `true`:

```json
[{"type": "users", "userIds": ["u_102", "u_207"]},
 {"type": "customers", "customerIds": ["acme"]},
 {"type": "attribute", "attribute": "country", "operator": "not_in", "values": ["DE"]},
 {"type": "percent", "percent": 10, "serve": true}]
```

A stale `version` returns `409`; reload and retry. Turning a flag on or off doesn't block someone else's rules edit in the admin UI, which picks up the new version automatically.

### Evaluation (`/api/evaluate`)

The SDK key decides the environment (`dev-sdk-key` / `prod-sdk-key` locally; set `SDK_KEY_DEV` / `SDK_KEY_PROD` otherwise), so a dev key can't read prod. SDK keys end up in browser bundles, so the response holds **results only, never rules or targeting lists**:

```json
POST /api/evaluate   X-SDK-Key: prod-sdk-key
{"context": {"userId": "u_303", "attributes": {"customer": "zenith", "country": "DE"}}}

{"environment": "prod",
 "flags": {"beta-reports":  {"value": false, "reason": "OTHERWISE"},
           "dark-mode":     {"value": false, "reason": "FLAG_OFF"},
           "free-shipping": {"value": false, "reason": "OTHERWISE"},
           "new-dashboard": {"value": true,  "reason": "RULE_MATCH", "ruleIndex": 2, "ruleType": "percent"}}}
```

- `ruleIndex` (zero-based) and `ruleType` (`users`, `customers`, `percent` or `attribute`) appear only for `RULE_MATCH`. An attribute match never says which attribute or values.
- Leave out `flags` to get every flag. Unknown keys come back OFF with `FLAG_NOT_FOUND`, not an error.
- A missing context is anonymous, and null attributes are ignored.

**Live changes.** `GET /api/evaluate/stream` is a server-sent event stream for the key's environment:
- `ready` on connect, then `changed {"environment","flagKey"}` after each committed change that can affect results.
- Denied, rolled-back and no-op changes are never announced, and events never carry rules.
- The key goes in the query string because browsers' `EventSource` can't send headers; SDK keys are public anyway.
- A keepalive comment every 20 s keeps proxies from closing idle streams.

### TypeScript SDK

`sdk/` has no runtime dependencies and is used by the demo:

```ts
import { createClient } from "@flags/sdk";

const flags = createClient({ sdkKey: "prod-sdk-key", storage: localStorage });
await flags.load(user);                         // before first render; never rejects
flags.isEnabled("new-dashboard", user);         // synchronous, from the cache; unknown → false
flags.subscribe(() => rerender());              // polling, live events and outages all notify
flags.state(user);                              // { status: "fresh" | "stale" | "unavailable" | "loading", flags, error? }
```

- **Cache:** results are cached per user, holding the least recently used 100.
- **Freshness:** refreshed every 30 s and on every live `changed` event. After a reconnect it refetches, because events sent while disconnected are lost.
- **Outages:** a failed refresh keeps the last results and marks them `stale`. With `storage`, results survive a reload during an outage. A first load that fails leaves the user `unavailable`, and `isEnabled` returns the fallback.
- **Reconnects:** it reopens the stream itself after HTTP errors. (Browsers' EventSource gives up for good on a proxy's 502.)
- **Packaging:** it's consumed from source inside this repo (`"@flags/sdk": "file:../sdk"`). Publishing it would need a build step to JavaScript.

### Demo users

They're fictional, and each takes a different path through the seeded prod rules for `new-dashboard` (users u_102, u_207 → customers acme → 10% rollout → otherwise OFF). The demo sends each user's customer and country as attributes; `free-shipping` targets `country in [CA]` in prod (in dev it's ON for everyone):

| User | Customer | Country | new-dashboard (prod) | beta-reports (prod) | free-shipping (prod) |
|---|---|---|---|---|---|
| Ana · u_102 | – | US | ON, rule 1 (user list) | OFF | OFF |
| Ben · u_207 | acme | CA | ON, rule 1 (user list) | ON (customer) | ON, rule 1 (attribute) |
| Cy · u_350 | acme | US | ON, rule 2 (customer list) | ON (customer) | OFF |
| Dee · u_303 | zenith | DE | ON, rule 3 (in the 10%) | OFF | OFF |
| Eli · u_412 | zenith | – | OFF (outside the 10%) | OFF | OFF (no country) |
| Anonymous | – | – | OFF (a rollout needs a user ID) | OFF | OFF (no country) |

## Agents (MCP)

The backend is also an [MCP](https://modelcontextprotocol.io) server, so an AI agent can do everything the admin dashboard can: read flags, rules and history, and create, toggle, re-target and delete flags.

**Connect.** An admin creates a key under **API keys** in the dashboard. The token (`ffk_…`) is shown once, along with ready-to-paste config. For Claude Code:

```bash
claude mcp add --transport http feature-flags http://localhost:5173/mcp --header "Authorization: Bearer ffk_..."
```

Check it with `claude mcp list` (it should say `✔ Connected`). That adds the server for the current folder only; add `--scope user` to use it in every project. Start a new Claude session to get the tools.

For other clients (Claude Desktop, Cursor, …) it's an HTTP MCP server at `http://localhost:5173/mcp` with that `Authorization` header. The dashboard's address proxies `/mcp` to the backend; `http://localhost:8080/mcp` works too.

**Tools** (12), with the same rules, messages and JSON shapes as the dashboard:

| Read | Change |
|---|---|
| `whoami`: the key's identity, role and exactly what it may change | `create_flag` |
| `list_environments`, `list_flags`, `get_flag` | `update_flag_description` |
| `get_audit_log`: plain-words history; search, filters and paging | `set_flag_enabled`: needs the env's `version` |
| `suggest_ids`: user/customer IDs the service has seen | `set_flag_rules`: replaces the ordered rules (users, customers, percent or attribute) + Otherwise; needs `version` |
| `find_unseen_ids`: likely typos | `delete_flag`: `confirm_key` must repeat the key |

Read tools are marked read-only and `delete_flag`/`set_flag_rules` destructive, so clients can ask before running them. A stale `version` is a conflict, so an agent can't overwrite a change it hasn't seen.

**Access model.**
- **A key acts as one role** (admin, editor or viewer) and can do exactly what a person with that role can. Enforcement is the same `AccessPolicy` as the dashboard, so an editor key can't touch prod, and a viewer key is read-only.
- **Only admins create and revoke keys.** Keys themselves can never manage keys, even an admin key, so a leaked key can't mint itself a replacement.
- **Keys work only on `/mcp`,** and dashboard sessions don't work there. No cookies, no CSRF, stateless: every request is authenticated by its own key.
- **Every change an agent makes is in the audit log** as `key:<name>`, and the key list shows who created each key and when it was last used.
- **Storage:** tokens are 256-bit random values, stored only as a SHA-256 hash and shown once. They expire (default 90 days, max 365), and revocation takes effect on the next request.

## Tests

```bash
./test.sh
```

It needs only Docker, and uses a local JDK 21+ / Node 20+ if present (otherwise those steps run in containers). Backend tests run against a real Postgres via Testcontainers. GitHub Actions runs the same script on every pull request and push to `main` (`.github/workflows/test.yml`). 510 tests in total:

| Suite | Tests | Covers |
|---|---|---|
| `engine` | 103 | first-match order, flag off, Otherwise, every rule type, null/blank context, murmur3 reference vectors, golden buckets, monotonic rollouts, distribution within ±1% over 100k users, independence between flags, open/closed rule extension |
| `backend` | 266 | every cell of the role matrix over HTTP with real logins (and as a unit), an editor trying every route into prod, permissions shown to the UI matching real enforcement, CSRF and the live change stream over real HTTP, validation, conflicts, plain-words audit, `/evaluate` never leaking rules, ID suggestions; **MCP with a real MCP client**: key auth (missing, wrong, revoked, expired, session-vs-key), every tool, the role matrix through tools, a full flag lifecycle driven by an agent |
| `sdk` | 21 | cache hits and fallbacks, request shape, dedupe, outages (stale, unavailable, HTTP errors, timeouts), persistence across reloads, polling, live refresh, catch-up after reconnect, reconnect backoff, LRU eviction |
| `admin`, `demo` | 120 | colour contrast ≥ 4.5:1 for every text/background token pair in light and dark (read from the shared `design/tokens.css`), 4px spacing grid, theme preference, activity day-grouping, change types and search highlighting, plain-English audience and Live/Partial/Off status, prod-change wording, rule drafts (ID chips, pending text saved, malformed IDs blocked and discardable), relative times, reason explanations, URL state, API key status and connection snippets |

**End-to-end in a browser.** `./test.sh` has no browser tests (per the brief). On top of it:
- [docs/qa-test-plan.md](docs/qa-test-plan.md) is the full manual QA plan (161 cases across admin, storefront, MCP, end-to-end and security, plus 9 regression checks).
- Its [top 25 cases](docs/qa-top-25.md) are automated by `qa/` (Playwright, Chromium) against a separate copy of the stack on ports 6173/6174, reset to seed data. Latest run: **25 of 25 passed**, with a recorded video, 43 screenshots and a report: [qa/results/REPORT.md](qa/results/REPORT.md). It found one real bug (Discard stuck after typing a malformed ID), since fixed.

```bash
ADMIN_PORT=6173 DEMO_PORT=6174 BACKEND_PORT=9080 POSTGRES_PORT=6433 docker compose -p ff-qa up -d --build
cd qa && npm ci && node run.mjs --reset && node make-video.mjs && node report.mjs
```

## Assumptions

1. A flag that's ON with no rules serves its **Otherwise** value (default OFF). For "on for everyone", set Otherwise → ON or add a 100% rule.
2. Rule types are user-ID list, customer list, percentage rollout and attribute in / not in a list (added in Epic 12). The engine accepts new rule types without changes to the evaluator.
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
15. When the flag service is unreachable, the demo keeps showing the last known flags (marked stale), from memory or from `localStorage` after a reload. With nothing cached, every flag is OFF (safe default). Either way the page says so.
16. Live updates may take up to ~30 s to resume after a long outage (reconnect backoff is capped at 30 s), and polling refreshes values every 30 s regardless.
17. An API key is a fixed role rather than a list of fine-grained scopes, and only admins create keys. Keys never manage keys.
18. Rule IDs must be well-formed (letters, digits and `_ . : @ -`, max 128), but needn't have been seen before.
19. Attribute names in rules are lowercase (`^[a-z][a-z0-9_]{0,63}$`), and matching is exact, so SDK callers must send lowercase attribute keys (`app_version`, not `appVersion`); `/api/evaluate` accepts any key, but a camelCase one can never be targeted.
20. Attribute names and values are never suggested in the admin or flagged as "never seen"; seen-ID tracking covers user and customer IDs only.

## What's missing, and how I'd build it

- **SDK for servers:** the SDK evaluates on the server per user, which suits browsers (no rules leak). A Node/back-end SDK could instead download the rules with a server-only key and evaluate locally with a port of the engine. That's faster at scale, but it needs a second, secret key type.
- **Scale:** evaluation reads flags from Postgres on every call, and the change stream lives in one backend instance's memory. With more traffic I'd keep an in-memory snapshot per environment, invalidated on writes, and fan changes out across instances with Postgres `LISTEN/NOTIFY`.
- **MCP hardening:** OAuth (the MCP spec's authorization flow) so agents get short-lived, user-consented tokens instead of static keys; per-key rate limits; key rotation with an overlap window; optional finer scopes, e.g. a key that can only change one flag.
- **Production hardening:**
  - real secrets for SDK keys and DB credentials;
  - login rate limiting;
  - user management instead of seeded users;
  - audit pagination;
  - CI for the QA runner (`./test.sh` already runs in GitHub Actions on every pull request and push to `main`);
  - sessions that survive a backend restart (today they live in memory, so a restart signs everyone out).
- **Known issue (tests only):** the backend test JVM sometimes takes ~30 s to exit after all tests pass Results are unaffected; the cause isn't diagnosed yet.
- **Known issue (tests only):** MockMvc's `csrf()` helper changes the CSRF filter in Spring's shared test context, which made one cookie assertion depend on test order. The trigger is confirmed, but why the cookie disappears is not yet explained. Real CSRF behaviour is covered over real HTTP instead. Details in [docs/ai-log.md](docs/ai-log.md#known-issue-mockmvc-csrf-changes-the-shared-csrf-filter).

## How this was built with AI

Built with Claude Code, directed phase by phase, with a review and course correction between each phase. The agent setup is committed:

- [CLAUDE.md](CLAUDE.md): the conventions and design principles the agent works to, and when it must stop and ask.
- [docs/plan.md](docs/plan.md): the design, agreed before any code.
- [docs/qa-test-plan.md](docs/qa-test-plan.md) and [docs/qa-top-25.md](docs/qa-top-25.md): the QA plan, and the 25 cases executed with video in [qa/results/REPORT.md](qa/results/REPORT.md).
- [docs/ai-log.md](docs/ai-log.md): the prompts for each phase, where the AI fell short and how it was corrected (a hard-coded attribute that broke open/closed, a recurring null bug fixed at the source, an order-dependent test investigated rather than replaced), and the bugs that only browser testing found.

## Project layout

```
engine/    evaluation engine (plain Java) + tests
backend/   Spring Boot API, MCP server (/mcp), Flyway migrations (db/migration), tests
admin/     admin dashboard (React)
demo/      demo storefront (React), uses the SDK
sdk/       TypeScript client SDK + tests
design/    shared design tokens (tokens.css) for admin and demo
qa/        Playwright QA runner; results/ holds the latest report, screenshots and video
docs/      plan.md, ai-log.md, qa-test-plan.md, qa-top-25.md
test.sh    every test + frontend builds
```
