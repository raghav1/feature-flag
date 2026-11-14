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
