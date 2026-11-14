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
- **Order-dependent test:** the MockMvc check for the XSRF cookie passed alone and failed in the full suite. Probably MockMvc's `csrf()` post-processor changing the CSRF filter in the shared Spring context (not proven). Replaced it with `CsrfRoundTripTest`: a real server on a random port and a real cookie jar, covering cookie → header → accepted, header missing → 403, and forged token → 403. That's a stronger test than the one it replaced.
