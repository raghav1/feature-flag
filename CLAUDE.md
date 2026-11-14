# CLAUDE.md

Internal feature-flag service: admin dashboard, Java backend on PostgreSQL, and a demo web app. **`docs/plan.md` is the design source of truth.** Read it before changing architecture, the data model, the API or the role matrix.

## Layout

| Path | What |
|---|---|
| `engine/` | Evaluation engine. Plain Java 21, JDK only. |
| `backend/` | Spring Boot 3 REST API, Postgres via Flyway, auth, audit. Depends on `engine`. |
| `admin/` | React + TS + Vite admin dashboard (port 5173). |
| `demo/` | React + TS + Vite mock storefront (port 5174). Reads flags only through the SDK. |
| `sdk/` | TypeScript client SDK (no runtime deps). The demo depends on it via `file:../sdk`. |
| `backend/.../mcp`, `apikeys` | The MCP server at `/mcp` (tools in `AdminTools`) and agent API keys. |
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
- DB↔engine mapping only in `EngineMapper`; each `RuleSpec` maps itself via `toEngineRule()`, so a new rule type doesn't touch the mapper. Authorization only in `AccessPolicy`, enforced on the server and never in the UI alone.
- Every mutation writes its audit row in the same transaction, with a plain-words summary ("rollout 5% → 10%") and the logged-in user as actor.
- Flyway migrations are append-only once committed.
- Errors are `ProblemDetail` (`application/problem+json`).
- **MCP tools call the same services as the REST controllers and never re-implement logic.** A new dashboard capability needs a tool too (`McpApiTest.everyDashboardActionIsATool` lists them). Tool results use the shared views (`FlagView`), so agents and the dashboard see the same JSON.
- API keys authenticate only on `/mcp` (`McpSecurityConfig`); sessions only on `/api`. A key is an `AppUser` with `viaApiKey = true` and a fixed role; keys never manage keys.
- Long-lived responses (the SSE stream) must be closed on shutdown (`ChangeStream.closeAll`); otherwise graceful shutdown waits until Docker SIGKILLs the process.
- Mutations that can change evaluation results publish `FlagChanged`; listeners act after commit only.
- **Nulls stop at the boundary.** Request records normalise in their compact constructors (absent → `""`, empty list, or `Optional`), query params arrive as `Optional` with blank treated as absent, and the engine's `EvaluationContext` exposes `Optional` accessors. Services, rules and repositories never receive null; internal APIs `requireNonNull` instead of accepting "null means none". (We hit `Set.of(...).contains(null)` three times before fixing the cause.)
- Don't assert on the real `XSRF-TOKEN` cookie in MockMvc tests: `.with(csrf())` changes the shared filter (see docs/ai-log.md, known issue). Real CSRF behaviour lives in `CsrfRoundTripTest`.
- New HTTP behaviour needs an `ApiTest` (real Postgres via Testcontainers). Anything about roles also needs a row in `RoleMatrixApiTest`.

## Frontend

- TypeScript `strict`, no `any`. API types live in one `api.ts` per app.
- TanStack Query for server state. Plain CSS; icons from `lucide-react` (pinned).
- **Admin design system (GitHub/Primer-style):** colour only via the semantic tokens in `admin/src/styles.css`, defined for light and dark; `contrast.test.ts` fails if a text/background pair drops below 4.5:1 in either theme, so add new pairs there. Spacing via `--space-*` (4px grid); 6px radius; borders over shadows; animate only `transform`/`opacity`; every icon-only control has an `aria-label`; no `useEffect` for render logic (derive, or adjust state during render; effects only to sync with external systems).
- The admin is for product managers, not a system of record. Lead with what matters (is it live, for whom), in plain words from `audience.ts` (unit-tested so the summary can't drift from the engine's semantics), with status always shown as icon + word, not colour alone. Changes to prod confirm first, saying who's affected.
- The admin UI never decides permissions itself: it enables controls from `can` on `/api/auth/me` (computed by `AccessPolicy`; `PermissionsMatchEnforcementApiTest` guards the two from drifting).
- Switching users in the admin app goes through `switchSession()`, not `queryClient.clear()` (that detaches the `me` query from its observer).
- Mutation-check new tests that "just pass": break the code on purpose and make sure the test fails (a stream test once passed against a broadcast-everything mutant).
- Browser probes: scope selectors to the region you mean (`.store [data-flag=…]`, not the whole document; the debug panel reuses `data-flag`), and disconnect old MutationObservers before attaching new ones.
- Browser checks: trust the DOM (`read_page`, `javascript_tool`) over screenshots. When the browser pane is hidden, screenshots can be stale frames.
- `/api/evaluate` is public by design (SDK keys ship to browsers): it must never return rules or targeting data. `EvaluateApiTest.responseContainsResultsOnlyNeverRules` guards this.
- Treat the flag service as fallible: time out, render with everything OFF, and say so.

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
