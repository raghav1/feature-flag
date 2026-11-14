# AI log

How the coding agent (Claude Code) was directed, and where it needed correcting.

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
