# CLAUDE.md

Internal feature-flag service: admin dashboard, Java backend on PostgreSQL, and a demo web app. **`docs/plan.md` is the design source of truth.** Read it before changing architecture, the data model, the API or the role matrix.

## Layout

| Path | What |
|---|---|
| `engine/` | Evaluation engine. Plain Java 21, JDK only. |
| `backend/` | Spring Boot 3 REST API, Postgres via Flyway, auth, audit. Depends on `engine`. |
| `admin/` | React + TS + Vite admin dashboard (port 5173). |
| `demo/` | React + TS + Vite mock storefront (port 5174). |
| `docs/` | `plan.md` (design), `ai-log.md` (how the agents were directed). |

## Commands

```bash
docker compose up --build          # everything: postgres, backend :8080, admin :5173, demo :5174
./test.sh                          # all tests + frontend builds; needs only Docker; must be green before a commit
./mvnw -pl engine test             # engine tests only
./mvnw -pl backend spring-boot:run # backend against a local postgres
npm --prefix admin run dev         # admin with hot reload
npm --prefix demo run dev          # demo with hot reload
```

## Design principles (follow them)

1. **Single responsibility.** Controllers do HTTP, services do logic, repositories do DB.
2. **The engine knows nothing about Spring, the DB or HTTP.**
3. **Open/closed.** A new rule type is a new class, not an edit to the evaluator. The same goes for a new context attribute: it goes in `EvaluationContext.attributes`, not a new field.
4. **Constructor injection; depend on interfaces.** No field injection.
5. **Immutable records by default.** Copy collections on the way in.
6. **Validate at the API boundary; fail fast with clear errors.**
7. **Keep it simple.** Don't build what we don't need yet.
8. **No change without a test.** Run the tests before saying something is done.

## Engine rules

- JDK only. The `maven-enforcer` rule in `engine/pom.xml` guards this; don't loosen it.
- Pure code only: no I/O, clock, randomness, logging or mutable static state.
- Rollout bucketing is **frozen**: murmur3_x86_32, input `flagKey + ":" + userId` in UTF-8, seed 0, 10 000 buckets. Changing any of it re-buckets every user.
- Never edit the golden vectors in `BucketingTest` to make a test pass.
- Write the failing test first.

## Backend

- Java 21, no Lombok. Records for DTOs.
- DB↔engine mapping only in `EngineMapper`. Authorization only in `AccessPolicy`, enforced on the server and never in the UI alone.
- Every mutation writes its audit row in the same transaction, with a plain-words summary ("rollout 5% → 10%") and the logged-in user as actor.
- Flyway migrations are append-only once committed.
- Errors are `ProblemDetail` (`application/problem+json`).
- Null-check before `Set.of(...)`/`List.of(...).contains(x)`: immutable collections throw NPE on null. This has bitten us three times.
- Don't assert on the real `XSRF-TOKEN` cookie in MockMvc tests: `.with(csrf())` changes the shared filter (see docs/ai-log.md, known issue). Real CSRF behaviour lives in `CsrfRoundTripTest`.
- New HTTP behaviour needs an `ApiTest` (real Postgres via Testcontainers). Anything about roles also needs a row in `RoleMatrixApiTest`.

## Frontend

- TypeScript `strict`, no `any`. API types live in one `api.ts` per app.
- TanStack Query for server state. Plain CSS; polished design is out of scope.

## Data

- Fictional seed data only (`acme`, `u_102`, …). No real company or personal data.
- The brief PDF stays out of the repo (`*.pdf` is git-ignored).

## Workflow

- Work one phase at a time from `docs/plan.md`. A phase is either finished or not started.
- At the end of a phase, run `./test.sh` until it's green, then commit with a `feat:` / `fix:` / `test:` / `docs:` / `chore:` prefix.
- When you make an assumption, add it to README → Assumptions. When an agent goes wrong and needs correcting, note it in `docs/ai-log.md`.

## Stop and ask before

- changing hashing or bucketing
- adding an engine dependency
- changing the API shape or the role matrix
- editing a committed migration
- adding scope beyond the current phase
