# AI log

How the coding agent (Claude Code) was directed, and where it needed correcting. Each phase began with a short prompt and ended with a stop for review. The conventions it worked to are in [CLAUDE.md](../CLAUDE.md), and the design in [plan.md](plan.md).

## Highlights

**Course corrections from review**
- A planned `EvaluationContext(userId, customerId)` would have broken the open/closed principle the plan had just adopted. It became `userId` + attributes, with a test using an attribute the engine has never seen.
- `./test.sh` only worked on one machine. It now needs only Docker, and all three paths (local JDK, no JDK, no JDK and no Node) were verified.
- An order-dependent CSRF test had been *replaced*. I was asked to *investigate* it instead, which confirmed the trigger; the unexplained part is recorded as a known issue.
- A null crash came up three times and was fixed each time where it appeared. I was asked to fix the cause, so nulls are now normalised once at the API boundary, and rules and services can't receive one.

**Agent asked before deciding:**
- where to put the repo (it was started inside an unrelated personal project);
- whether to change the `/me` API shape for UI permissions.

**Bugs caught by tests the agent wrote:**
- `GET /api/flags` broken (caught by the role-matrix READ cells);
- missing `-parameters`;
- Testcontainers vs Docker 29;
- `contains(null)` on immutable collections.

**Bugs only real-browser testing caught:**
- login appeared stuck;
- "Reload" after a conflict restored stale rules;
- a dead backend blanked the demo for 60 s;
- nginx refused to start without the backend.

**Weak checks the agent caught in its own verification:**
- an enforcer probe that couldn't fail;
- a flicker observer that couldn't see the change;
- stale screenshots from a hidden browser pane (it then trusted DOM reads instead).

## Planning

- **Prompt:** plan the architecture, data model, API and phases; write `docs/plan.md` and `CLAUDE.md`; the engine is plain Java and rollouts are deterministic per user; flag anything unclear and stop.
- The agent was started in an unrelated existing repo. It stopped and asked instead of writing there, and the work moved to a new repo.
- **Review round 1:** added a login page with three server-enforced roles, audit by logged-in user in plain words, the brief kept out of the repo, `docker compose up` working from phase 0, a commit per phase, the snapshot `/config` endpoint dropped, fallthrough shown as an "Otherwise" row, and explicit design principles in `CLAUDE.md`.
- **Review round 2 (course correction):** the planned `EvaluationContext(userId, customerId)` hard-coded one attribute, which breaks the open/closed principle the plan had just adopted. A rule on a new attribute would have meant editing the context, mapper and API. Changed to `userId` + `Map<String, String> attributes`, with a test proving a rule can read an attribute the engine has never heard of.

## Phase 0: scaffold

- `java` wasn't on the PATH (only Homebrew's `mvn` knew where its JDK was), so `./mvnw` failed. The repo wasn't changed; commands ran with `JAVA_HOME` pointed at the Homebrew JDK (24, building with `--release 21`).
- npm blocked esbuild's postinstall script. The build works without it, so it stays unapproved.

## Phase 1: engine

- Tests were written first and failed to compile, then the engine was written.
- **Golden rollout buckets came from an independent Python murmur3**, after it passed the published reference vectors. They weren't captured from the Java output. The Java then matched on the first run, so two separate implementations agree.
- **Bug caught by the tests:** `FlagConfig` used `rules.contains(null)` to reject null rules, and `List.of(...)` throws NPE on that call. The same trap then showed up in the test-only `CountryIn` rule (`Set.of(...).contains(null)` when an attribute is absent). Fixed both, and documented it on `EvaluationContext.attribute()` for future rule authors.
- **Weak verification caught:** the first "does the enforcer actually block deps?" probe re-declared `assertj-core`, which was already declared in test scope, so Maven kept the test scope and the build passed. That proved nothing. Re-ran the probe with an undeclared artifact and the build failed as intended.

## test.sh on a clean machine

- **Prompt:** `./test.sh` only worked with my `JAVA_HOME`; make it work for reviewers, using Docker when Java isn't there.
- It now uses local JDK 21+ / Node 20+ when they work, otherwise `maven:3.9-eclipse-temurin-21` / `node:22-alpine`. Backend tests start Postgres through the mounted Docker socket.
- Checked all three paths: local JDK, no JDK, and no JDK and no Node. For the Docker path, the surefire XML shows `os.name=Linux` and `java.home=/opt/java/openjdk`, so the 188 tests really ran in the container and weren't skipped.

## Phase 2: schema, auth, roles, admin API, audit

- **Prompt:** start phase 2; a test for every cell of the role matrix, especially an editor trying to touch prod; show the test output and stop before the UI.
- Role matrix tested twice: as a unit (`RoleAccessPolicyTest`, 15 cells) and over HTTP with real logins (`RoleMatrixApiTest`, 24 cells). Every denied cell also checks that the flag is unchanged and no audit entry was written. `EditorProdApiTest` covers the routes into prod: toggle on, toggle off, rules, otherwise, delete, lookalike env names (`PROD`, `prod `), and a stale version that must not leak a 409 before the 403.
- **Docker 29 vs Testcontainers:** Spring Boot 3.5.6 pins Testcontainers 1.21.3, which speaks Docker API 1.32; Docker 29 rejects anything below 1.40. Pinned the 1.21.4 BOM ahead of Spring's.
- **`-parameters` missing:** without the Spring Boot parent pom, `@PathVariable` names weren't in the bytecode. Added it to the root compiler config. A stale incremental build hid the fix until a `clean`.
- **The `contains(null)` trap a third time**, in `RoleAccessPolicy` (`Set.of("dev").contains(null)`). The "editor only gets exactly dev" test caught it. Now a rule in CLAUDE.md.
- **Coverage gap found by the matrix:** `GET /api/flags` (list) was broken. I'd passed a lambda returning null as a `ResultSetExtractor`. `FlagApiTest` never called the list endpoint; the matrix's READ cells did. Fixed, and `FlagApiTest` now covers the list too.
- **Order-dependent test:** the MockMvc check for the XSRF cookie passed alone and failed in the full suite. I first replaced it with `CsrfRoundTripTest` (a real server on a random port with a real cookie jar) and guessed at the cause. On review I was told not to just replace it, so I investigated (timeboxed to 5 minutes). See the known issue below.

## Known issue: MockMvc `csrf()` changes the shared CSRF filter

**What was confirmed** with a temporary ordered experiment test (two methods sharing one Spring context):

| Moment | CSRF repository on the filter | `XSRF-TOKEN` cookie on `GET /api/auth/me` |
|---|---|---|
| before any `csrf()` request | `CookieCsrfTokenRepository` | set |
| after one request using `.with(csrf())` | `TestCsrfTokenRepository` | **not set** |

`SecurityMockMvcRequestPostProcessors.csrf()` swaps the CSRF filter's repository for a test wrapper, and the filter lives in Spring's cached test context, so the swap persists. Every `ApiTest` class shares that context. In the full suite, earlier classes (FlagApiTest, RoleMatrixApiTest…) used `csrf()` before AuthApiTest's cookie test ran, so the cookie test saw the changed filter. Run alone, it happened to run first. That's why it passed alone and failed in the suite.

**What is not explained yet:** why the wrapper suppresses the cookie on requests that never used `csrf()`. In the bytecode, `TestCsrfTokenRepository.saveToken` delegates to the real repository when the request isn't marked "enabled", so I expected the cookie to still be set. I stopped at the 5-minute timebox.

**Consequences and what we do about it:**
- Don't assert on the real CSRF cookie in MockMvc tests. That behaviour is tested in `CsrfRoundTripTest`, which runs a real server (`RANDOM_PORT`, its own Spring context) and never uses `csrf()`, so the change above can't reach it.
- Is the "missing token → 403" check in AuthApiTest still meaningful after the swap? Yes: it doesn't use `csrf()`, so the wrapper passes straight through to the real repository, finds no token and rejects. `CsrfRoundTripTest` also checks missing and forged tokens over real HTTP.
- Production isn't affected; this only happens under spring-security-test.
- Recorded in CLAUDE.md so later tests don't trip over it.

## Nulls normalised at the boundary

- **Prompt:** the null crash showing up two or three times means we're fixing symptoms. Normalise nulls once at the API boundary so services never see them.
- **Where nulls came from:** `envKey = null` meaning "flag-level action" in `AccessPolicy`; `EvaluationContext.attribute()` returning null to rule authors; nullable `envKey`/`before`/`after` in audit entries; nullable audit query params; `Integer matchedRuleIndex` being null for most results; and a missing `description` on create, handled by a ternary in the controller.
- **Fixes:**
  - Engine: `EvaluationContext` is now a final class with `Optional<String> userId()` / `attribute(name)`, and blank user IDs mean anonymous. `EvaluationResult` uses `OptionalInt` with named factories. A rule can't be handed a null any more, so the `contains(null)` trap can't come back.
  - Backend: `AccessPolicy` is split into `require(user, FlagAction)` and `requireEnvironmentChange(user, envKey)`, which rejects null. The editor case stays an exhaustive switch so a future action isn't allowed by default (I briefly wrote `action != DELETE_FLAG` and reverted it for that reason). `AuditEntry` uses `Optional` fields with named factories. `CreateFlagRequest` normalises its description in its compact constructor. Audit query params are `Optional`, with blank meaning absent.
- New tests: blank and null user IDs are anonymous; absent attributes are empty; null env is a programming error (NPE), not a denial; null description → `""`; `?flag=` (blank) means no filter.

## Phase 3: /evaluate and the demo storefront

- **Prompt:** the demo gets all flags before first render so nothing flickers, has a "viewing as" switcher, and a debug panel with each flag's value and why. `/evaluate` never returns rules, only results. Stop when switching users visibly changes the storefront.
- **Results only:** a controller-level view record (`FlagResult`) is the only shape that leaves `/evaluate`. A test walks the response JSON and checks that every field under a flag is one of `value`/`reason`/`ruleIndex`/`ruleType`, and that no seed targeting data (`u_102`, `acme`, `userIds`…) appears in the body. The SDK key decides the environment, so a dev key can't read prod.
- **Demo users chosen by bucket, not by luck:** the rollout users (u_303 inside new-dashboard's 10%, u_412 outside) were picked with the independent Python murmur3. The Java bucketing in `EvaluateApiTest` agrees with them.
- **Checked in the real browser, against `docker compose`:**
  - Switching users through the real dropdown changes the storefront and the debug panel (rule 1 user list / rule 2 customer list / rule 3 % rollout / Otherwise OFF), and the URL keeps the selection.
  - Flicker: my first MutationObserver check only watched the container's direct children and logged nothing even when the hero changed (React reused the `<section>`), so it was too weak to prove anything. Re-did it by recording the *visible state* after every DOM change: every switch goes old → new in one step, and Ben→Cy (same features) causes no visible change at all.
  - Before first render: paint timings aren't recorded in a hidden pane, so instead I **paused the backend container** and loaded the page. React rendered nothing while flags were pending, and after unpausing the render sequence was `nothing rendered → dashboard+beta`, never a default first.
- **Two real bugs found by testing the outage path** (stopping the backend):
  1. The page stayed blank for about 60 s: nginx's default connect timeout, with first render waiting on flags. Fixed with a 3 s client timeout on evaluation, `proxy_connect_timeout 2s`, and no retry before first paint (useQuery retries in the background). Now it renders all-OFF with a banner, and Refresh recovers once the backend is back.
  2. **nginx refused to start if the backend container didn't exist** (`host not found in upstream`), so a backend outage at deploy time would take the demo and admin down completely. Fixed by resolving `backend` per request through Docker DNS. With the backend down the page serves 200 and `/api` fails in about 80 ms.
- Also fixed: "Welcome back, Anonymous visitor" → "Welcome back".

## Phase 4: admin UI

- **Prompt:** start phase 4.
- **Asked before changing the API:** the UI needs to know which controls to enable, and CLAUDE.md says to stop and ask before changing the API shape. The options were the server adding `can` to `/api/auth/me` (computed by `AccessPolicy`) or the UI mirroring the role table. **Chosen: server.** `PermissionsMatchEnforcementApiTest` logs in as each role and checks every promise in `can` against what the server actually does, so the UI can't drift from enforcement.
- **Checked in the real browser, per role, against `docker compose`:**
  - Viewer: all six switches disabled, no New flag or Delete, no editable inputs, "read-only" notes.
  - Editor: dev switches enabled, prod disabled, the prod rules tab read-only, dev rules editable. Saving dev rules → history shows "editor · dev · added rule: users u_102, u_303; otherwise ON → OFF".
  - Admin: an invalid key gets a field error; a valid key creates the flag (OFF everywhere) and selects it. Toggling prod → "turned ON". Delete goes through a confirm step, and the history survives the delete.
- **Bugs found in the browser and fixed:**
  1. **Login looked stuck:** the API returned 200 but the screen stayed on the login form. `queryClient.clear()` removed the `me` query App was subscribed to, so the following `setQueryData` landed in a new query nobody watched. Logout had the same bug. Fixed with `switchSession()`, which removes everything except `me` and then sets it.
  2. **Reload after a conflict restored stale rules:** after a 409, "Reload rules" reset to the cached (stale) state, so the next save would conflict again. Fixed by refetching flags (and history) on any save error and on Discard/Reload. Re-tested: the warning appears and Reload shows the other user's 70%.
  3. History didn't refresh after an external change. It now refetches along with the flag.
  4. Disabled inputs didn't look disabled (prod rules for an editor looked editable). Styled them.
- **Designed for, then verified:** toggling a flag bumps that environment's version, which would make an in-progress rules edit fail with a false 409. The editor rebases silently when only the version moved, and reports a real conflict only when the rules themselves changed. Tested both: edit + toggle + save → 200; edit + someone else's rules change + save → 409 with a warning.
- **Testing lesson:** with the browser pane hidden, screenshots were sometimes stale frames that contradicted the DOM (one showed "No changes recorded yet" right after a successful save). I went by DOM reads and re-checked; noted in CLAUDE.md.

## Phase 5: README and a reviewer's first run

- **Prompt:** move to step 5 (README with setup, endpoint table and assumptions; clean clone → `docker compose up` → everything works).
- **README rewritten for a reviewer:** run it, logins, a two-minute walkthrough (which doubles as the video script), what's built mapped to the brief's must-haves, how evaluation works, the API, tests, assumptions, what's missing and how I'd build it, and the AI process.
- **Hardened for other machines:** host ports are overridable (`ADMIN_PORT`, `DEMO_PORT`, `BACKEND_PORT`, `POSTGRES_PORT`), and Postgres binds to `127.0.0.1:5433` so it doesn't clash with a local Postgres. The demo build now receives the same SDK keys as the backend, because Vite bakes them in. An empty build arg falls back to the default (`||`, not `??`).
- **Verified the reviewer path end to end:**
  - `git clone` into a scratch folder: 150 tracked files, no PDFs, no `.env`, nothing personal.
  - `docker compose build --no-cache`: 179 s cold. All four services up and health UP.
  - Every step of the README walkthrough checked against that stack: each demo user's reasons, `can` per role, and the admin change to dark-mode (history "rollout 25% → 100%", "turned ON") reaching every user with an ID but not anonymous visitors.
  - `./test.sh` in the clone with no `JAVA_HOME`: green in 73 s, 225 Java tests (run in the container) + 16 frontend.
- **Agent slip, caught:** my first walkthrough script's one-line Python formatter broke on shell quoting and printed syntax errors instead of results. I re-ran the checks with the formatter in a script file instead of treating the run as passed.

## Phase 6a: live updates over SSE

- **Prompt:** start phase 6 (stretch: live updates, then the TypeScript SDK).
- **Design:** `FlagService` publishes `FlagChanged` (flag key + affected environments) for create, delete, toggle and rules changes. Description edits don't publish, since they can't change a result, and no-ops never reach the publish. `ChangeStream` sends them to each environment's subscribers from a `@TransactionalEventListener`, so only committed changes are announced. Events carry the flag key, never rules. The key goes in the query string because `EventSource` can't set headers. A keepalive comment goes out every 20 s.
- **Tests over real HTTP** (`ChangeStreamApiTest`, which reads the stream line by line like EventSource): `ready` on connect; creation announced to every environment; prod changes reach prod only; denied and no-op changes never announced; events carry no rules; bad key → 401.
- **A test that couldn't fail, caught by a deliberate mutation:** I made `ChangeStream` broadcast to every environment and the suite still passed. The dev stream received the prod toggle labelled as dev for the *same flag*, which was indistinguishable from the real dev toggle that followed. Rewrote the test to use different flags for the two changes. The mutant now fails, and the real code passes.
- **Not covered by a test:** a change that rolls back *after* publishing (denied changes throw before publishing, so the denied-change test doesn't exercise `AFTER_COMMIT`). The guarantee rests on `@TransactionalEventListener`'s default phase.
- **Checked in the real browser:** with the demo open, a temporary flag created, enabled in prod and deleted via the API appeared, flipped ON and disappeared in the debug panel with no refresh.
- **Real bug found by stopping the backend:** the demo stuck at "reconnecting" forever. While the backend was down, the reconnect got nginx's 502, and per the EventSource spec an HTTP error status closes the connection *permanently* (only network errors auto-retry). Fixed by reopening it ourselves with backoff (1 s doubling to 30 s), and by refetching on every reconnect so changes made while disconnected aren't missed. Re-tested: stop the backend, start it, create a flag right away → `live → reconnecting → live → new flag shown`.
- **Your data left alone:** the running stack had changes I didn't make (dark-mode toggled in prod, and a rule `users ufajfhkj` edited to `u_102`), which look like your own review. I tested with temporary flags (`live-check`, `-2`, `-3`) instead of touching yours, and deleted them afterwards (their audit entries remain).

## Phase 6b: TypeScript SDK, and the demo moved onto it

- **Design:** `isEnabled(flag, user)` is synchronous from a per-user cache (100 users, least recently used dropped first). `load(user)` never rejects. The cache is refreshed by 30 s polling and by live `changed` events, and refetched after every reconnect. A failed refresh keeps the last results as `stale`. Optional `storage` persists results so a reload during an outage still has values. The stream is reopened with backoff after HTTP errors. `fetch` and `EventSource` are injectable, and there are no runtime dependencies.
- **21 SDK tests** with a fake server and a fake EventSource on fake timers. One failed on the first run, a **real SDK bug**: `isEnabled` reads didn't count as "use", so the least-recently-used eviction dropped users that were being read constantly. Fixed.
- **Demo moved onto the SDK:** TanStack Query, the hand-written fetch and the SSE hook are gone. It reads via `useSyncExternalStore` over the client. Packaging changed to match: the demo's Docker build context is the repo root (it needs `../sdk`), and `test.sh` runs the SDK too, mounting the whole repo on its no-Node Docker path. That path was verified with Node hidden from `PATH`.
- **Checked in the real browser:**
  - **Live updates:** a temporary flag appeared and disappeared without a refresh.
  - **Outage:** stopping the backend kept Ben's dashboard and beta card, with a "last known flags" banner. A **page reload during the outage** still rendered his flags from `localStorage` instead of all OFF. After restart it went back to "live · current" (up to ~50 s, because the stream's backoff had grown to its 30 s cap).
  - **Switching users:** the per-change log shows every switch goes `user → user · updating… → next user` with hero, beta card and debug panel always in agreement.
- **False alarm I raised and then disproved:** a first probe reported a "flicker" (a beta card flashing for users who don't have it). Two mistakes in the probe: (1) it matched `[data-flag=beta-reports]` document-wide, and the debug panel's row carries the same attribute; (2) after fixing that, the *old* observer was still attached and wrote into the same global array, interleaving its always-"+beta" readings. A detailed per-change log with both fixed showed no flicker at all. CLAUDE.md now says to scope probe selectors and disconnect old observers.
- **Two real bugs found while verifying 6b:**
  1. **Backend restarts were SIGKILLed whenever a demo was connected:** Spring Boot 3.4+ shuts down gracefully and waited for the never-ending SSE stream until Docker killed it (exit 137, 19 s). The same thing made the test JVM hang 30 s on exit ("Surefire is going to kill self fork JVM"), visible only in the full output. Fixed by closing every stream on `ContextClosedEvent`, which comes before the graceful wait. Now `docker compose stop backend` with a stream open takes 1 s with a clean exit (143), and the test JVM exits normally.
  2. **Stale classes without `-parameters` came back:** `EvaluationController.class` was rewritten without parameter names, making the stream endpoint 500 in tests. The likely source is VS Code's Java extension (running throughout the session), which compiles Maven projects straight into `target/classes`. That would also explain the identical failure in phase 2. Not proven, but `test.sh` now always builds Java **clean**, and the root pom also sets `maven.compiler.parameters` for IDE builds.

## Rule IDs: format checks and "seen" users (server side)

- **Prompt (from a review screenshot):** a rule accepted the user ID `ufajfhkj`, and IDs have to be typed from memory.
- **Asked before deciding:** the service has no user directory, so "invalid" can mean *malformed* or *never seen*. Blocking unseen IDs would stop you targeting a new customer before their first visit. **Chosen: suggest + warn.** Malformed IDs are rejected; unseen ones are allowed, with a warning in the editor.
- **Server side (committed separately from the editor UI):**
  - rule IDs must match `^[A-Za-z0-9][A-Za-z0-9_.:@-]{0,127}$`, with field-level 400s such as `rules[0].userIds[1]`;
  - `/api/evaluate` records the user ID and `customer` it sees, best effort: only well-formed IDs, recording failures never fail an evaluation, and it runs outside the read-only transaction;
  - `GET /api/contexts?kind=user|customer&query=` gives suggestions, and `GET /api/contexts/unseen?kind=&value=…` lists IDs never seen;
  - the demo users are seeded so suggestions work on a fresh start;
  - LIKE wildcards in the query are escaped (tested: `_` doesn't match everything).
- **Still to do:** the editor's chip input with autocomplete and unseen warnings.
- **Open, parked:** the test JVM occasionally takes 30 s to exit ("Surefire is going to kill self fork JVM"). It's intermittent, didn't reproduce on a re-run, and no test fails. The production shutdown fix (closing SSE streams) is verified separately.

## MCP server for agents

- **Prompt:** build an MCP server so an agent can do and read everything the admin dashboard can; think about authentication and the scope of a key's access.
- **Asked before deciding** (it changes the security model and the API): where it lives, how keys are scoped, who mints them. **Chosen:** inside the backend; each key is a fixed role (admin, editor or viewer); only admins create keys. I recommended scopes intersected with the creator's role; you chose fixed roles, which makes a key exactly "a person with that role" to the existing `AccessPolicy`, so the role matrix and its tests already cover agents.
- **Read the SDK before using it:** the MCP Java SDK is at 2.2.0, past the 0.x API I knew, so I read its sources first. It has a *stateless* servlet transport, which suits per-request bearer auth with no MCP session state to secure. The authenticated identity reaches tool handlers through the transport context, and each call runs as that identity.
- **Security model:**
  - separate stateless filter chain for `/mcp` (bearer only, no cookies or CSRF), so keys can't use `/api` and sessions can't use `/mcp`;
  - 256-bit `ffk_…` tokens, stored as SHA-256 (high-entropy, so no slow hash needed, and the lookup is indexed) and shown once;
  - expiry 1–365 days, revocation immediate, last-used throttled to once a minute;
  - audit actor `key:<name>`;
  - **defence in depth:** even an ADMIN key can't manage keys (`AppUser.viaApiKey`), so a leaked key can't mint itself a replacement.
- **Caught by testing with a real MCP client** (the SDK's Streamable HTTP client in `McpApiTest`): the SDK's built-in schema validation rejected a bad user ID, but its message listed failures against *every* `oneOf` branch ("must be the constant value 'customers'", "required property 'percent' not found"), which would mislead an agent. I switched it off and let the tools validate with the dashboard's rules and messages; the schemas are still advertised. Then I normalised Hibernate's `rules[0].userIds[1].<list element>` paths to match the REST API exactly.
- **Mutation check:** I made key lookup ignore `revoked_at`, and `revokedAndExpiredKeysStopWorkingImmediately` failed as it should. Restored.
- **Checked end to end in the browser:**
  - admin created an EDITOR key in the new **API keys** page (token shown once, only the prefix listed, a `claude mcp add` snippet pointing at the dashboard's own `/mcp`);
  - a plain JSON-RPC client using that key through nginx: 12 tools; `whoami` = editor with dev only; prod change refused ("key:agent-check (editor) may not change prod."); dev change and create allowed; delete refused;
  - history showed `key:agent-check`; "last used" was recorded; after revoking, the next request got 401;
  - the scratch flag was deleted and the test key revoked afterwards.
- **Fixed along the way:** a README test table that my phase 6b edit had mangled (the SDK row was spliced into the backend row).

## Rule editor: ID chips with suggestions

- **Prompt:** build the autocomplete (the editor half of the ID-validation work).
- **What it does:** user and customer IDs are chips. Typing suggests IDs the service has seen, most recent first. Enter adds the typed text exactly unless a suggestion was highlighted with the arrow keys, so `u_1` never silently becomes `u_102`. Comma, space and paste add several at once; Backspace on an empty box removes the last chip. Malformed entries stay in the box with the reason, and unseen IDs get a dashed amber chip and one line of explanation (still allowed). An empty new rule now shows a neutral hint instead of a red error.
- **Bug caught in the browser:** type an ID and click Save without pressing Enter, and **nothing was saved**. My first version turned the typed text into a chip on blur; that reflowed the row between mousedown and mouseup, so the click missed the button (or ran with the pre-blur state). The server still had no rules. **Fix:** typed text is part of the rule draft (`pending`): Save includes it, the "unsaved" detection sees it, a malformed pending entry blocks Save with the reason, and blur no longer changes the layout. Re-tested: type `u_303`, click Save → server has `[u_350, u_303]`, history "added rule: users u_350, u_303".
- Unit-tested as pure functions (`addIds`, `effectiveIds`, `draftProblems` severity); the component was checked by hand in the browser (suggestions, arrow + Enter, exact typed entry, unseen marking, malformed refusal, Backspace, save without Enter).

## Admin UI redesigned for product managers

- **Prompt:** the UI reads like a system of record built for agents. Design it for a human admin or PM: expandable rows with a dropdown chevron, more visuals and icons, the most important information highlighted.
- **Approach:** started from what a PM asks. (1) *What's live, and for whom?* (2) *Change it safely.* (3) *Who changed what?* The table plus side panel became one list of expandable rows. Collapsed, a row leads with a **Live / Partial / Off in prod** badge (icon + word), the flag name, and a **plain-English audience sentence**, plus quick dev/prod switches and who changed it last. Expanded: an environment switcher with status, a status card with a big switch, rules as readable cards, an activity timeline with avatars (a key icon for agents), and settings with a danger zone. Search, status filters with counts, and `?flag=&env=` in the URL for reloads and shared links. Icons from `lucide-react`, pinned to a release three weeks old rather than one published that day.
- **Logic kept testable:** `envStatus`/`audienceSentence` (what "Live/Partial/Off" and "On for …" mean) and the prod-confirmation wording are pure functions with tests, so the UI's summary follows the engine's semantics (e.g. "on" with no matching rule is *Off*, not Live).
- **Caught while reviewing in the browser:**
  - the percentage rule's slider sat beside its header: the card's class `percent` collided with the slider row's `.percent` layout (renamed to `rule-percent`);
  - the prod dialog said "Real users will start getting it right away: On, but nobody matches a rule yet", which contradicts itself. The message now depends on what will actually happen (nobody / everyone / who), with tests;
  - every switch rendered a hidden `<dialog>` (10 on one page); they now render only while asking;
  - on a phone, the header pushed the logout button off-screen. It's compact below 640 px; no horizontal overflow at 375 px.
- **Checked per role:** admin (everything, prod confirm cancel and confirm, delete via danger zone; scratch flags only), editor (note "As editor, you can change dev; prod is read-only", prod switches locked, prod details read-only, no delete), viewer (read-only everywhere).

## Activity tab: the whole audit trail, searchable

- **Prompt:** an Activity tab to see and search the audit trail and history of all flag changes.
- **Design choice:** searching *all* history can't be done in the browser on the latest 200 events, so search, filters and paging moved to the server. `GET /api/audit` gained `q`, `action`, `actor` and a `before` cursor (id-based, so new events can't shift pages), behind one `AuditQuery` record used by both REST and the MCP `get_audit_log` tool (CLAUDE.md: a dashboard capability gets a tool). The LIKE escaping from the ID suggestions moved into a shared `SqlLike` helper, and a test checks `5%` matches literally.
- **The page:** grouped by day (Today / Yesterday / date), an icon per kind of change (on, off, rules, created, deleted, description), search highlighting, filters for what/where/who (people vs agents), "Load older" via `useInfiniteQuery`, and flag names that open the flag expanded in the environment that changed. Queries sit under the key prefix that flag mutations already invalidate, so the trail refreshes after any change.
- **My test was wrong, not the code:** I expected a "rollout" search with action RULES_UPDATED to return one event, but "added rule: … 5% rollout" matches too. Fixed the expectation.
- **Checked in the browser** (as viewer, since it's read-only): day groups, a server-side search with highlights ("(all matches)"), the agents filter showing only `key:agent-check` changes with key avatars, Load older 50 → 54 ("everything"), click-through to `dark-mode` on Development, and phone width with no overflow.

## GitHub-style design principles

- **Prompt:** borrow UI design principles from a "GitHub UI design system" skill page on mcpmarket.com.
- **What the page actually gave:** only a short listing. Its concrete rules: a 4px spacing grid, Inter, ≥ 4.5:1 text contrast, ARIA labels on icon-only controls, animations only on transform/opacity, no `useEffect` for render logic, and a dark-first GitHub look. It offered two colours, one of which (accent `#030036`) wouldn't meet its own contrast rule on a dark surface. So the palette comes from **GitHub's real Primer tokens** instead; the README and CSS say which parts came from where.
- **Applied:**
  - semantic tokens for light and dark, with a header toggle (system → light → dark) stored per browser and applied before first render, so there's no flash;
  - everything on `--space-*` (4px), 6px radius, borders over shadows (overlays only), Primer-style underline env tabs, counters, flash notes and blankslate empty states;
  - Inter actually bundled (`@fontsource-variable/inter`, pinned) — the CSS named it but nothing loaded it before;
  - only `transform` animates now (the switch and row-hover colour transitions are gone);
  - the rule editor's server-sync `useEffect` replaced with React's "adjust state during render"; the dialog's effect stays because it syncs with the browser's `<dialog>` API.
- **The contrast rule is enforced by a test:** `contrast.test.ts` reads the tokens straight from `styles.css` and checks 24 text pairs at 4.5:1 and 4 icon pairs at 3:1 in both themes. **It caught a real failure on its first run:** dark-mode blue text on the blue-tinted background was 4.23:1. Darkened the tint to `#0f2645` (4.90:1). Before that, the test first *silently loaded nothing*: Vitest stubs CSS, so `styles.css?raw` was empty and the suite errored with "no :root block" rather than passing. I enabled CSS for tests.
- **Checked in the browser:** both themes; Inter loaded; an automated audit found no unlabelled controls and that `transform` was the only animated property; and, because the editor's sync logic changed, both sync paths re-run on a scratch flag (edit, toggle, save → saved with no false conflict; no edits + another admin's change → adopted). The scratch flag was deleted and the browser's theme reset to follow the system.
- **One interruption:** the turn was cut off mid-verification and you said "try again". I resumed the remaining checks rather than redoing finished ones.
