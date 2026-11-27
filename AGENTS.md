<!-- bmad:context -->
<!-- Verified 2026-11-25 against e1d1ed2. Managed by bmad-project-context; edits inside this block are replaced on refresh. Keep anything you want preserved outside the markers. -->

## feature-flags

Internal feature-flag service: admin dashboard, Java 21 / Spring Boot 3 backend on PostgreSQL, demo storefront, TypeScript SDK, and an MCP server for agents. Public repo: github.com/raghav1/feature-flag. `docs/plan.md` is the design source of truth: read it before changing architecture, the data model, the API or the role matrix. BMAD planning and implementation artifacts go in `_bmad-output/`.

## Policy

- The repo is public. Never commit a real secret: no `ffk_…` tokens, `.env` files, personal paths or emails. Seeded logins, SDK keys (`dev-sdk-key` / `prod-sdk-key`) and the Postgres password are fictional local defaults, labelled so in the README; keep it that way.
- Fictional seed data only (`acme`, `u_102`, …); no real company or personal data. The brief PDF stays out of the repo.
- QA artefacts blur tokens (`MASK_CSS`) and store relative paths only.
- Stop and ask before: changing hashing or bucketing; adding an engine dependency; changing the API shape or the role matrix; editing a committed migration; adding scope beyond what was asked.
- Changes to architecture, data model, API or roles go into `docs/plan.md` first; later additions are recorded there under "Added after the plan".
- Commit only with `./test.sh` green, using a `feat:` / `fix:` / `test:` / `docs:` / `chore:` prefix. For UI changes also re-run the affected QA cases (`qa/run.mjs <ID>`).
- Push only when asked; never force-push `main` without asking.
- Keep README (test counts, features, layout) and this file in step with user-visible changes. Record assumptions in README → Assumptions, and agent corrections in `docs/ai-log.md`.

## Where things are

- MCP server: tools in `AdminTools` under `backend/.../mcp`; agent API keys under `backend/.../apikeys`.
- Shared design tokens: `design/tokens.css`, imported by both apps' `styles.css`.
- Rule semantics in plain English for the admin: `admin/src/audience.ts`.
- BMAD team customizations and the review checklist in `_bmad/custom/`. Never edit `.claude/skills/bmad-*` or generated `_bmad/` files, which the installer overwrites; change behaviour in `_bmad/custom/`.

## Running and verifying

- `./test.sh` runs every test and builds sdk, admin and demo. It needs Docker running even with a local JDK (backend tests start Postgres via Testcontainers); without JDK 21+ / Node 20+ it runs that half in Docker.
- Engine only, while iterating: `./mvnw -pl engine test`.
- `qa/` is not part of `./test.sh`. Run browser QA against a separate stack so it never touches the developer's:
  `ADMIN_PORT=6173 DEMO_PORT=6174 BACKEND_PORT=9080 POSTGRES_PORT=6433 docker compose -p ff-qa up -d --build`, then `(cd qa && node run.mjs --reset)` or `node run.mjs <CASE-ID>`; `(cd qa && node make-video.mjs && node report.mjs)` writes `results/qa-run.mp4` and `results/REPORT.md`.
- Browser checks: trust the DOM (`read_page`, `javascript_tool`) over screenshots; a hidden browser pane can return stale frames.

## Conventions that differ from defaults

Design principles:
- Single responsibility: controllers do HTTP, services do logic, repositories do DB.
- Open/closed: a new rule type is a new class, never an edit to the evaluator; a new context attribute goes in `EvaluationContext.attributes`, never a new field.
- Constructor injection, depend on interfaces; no field injection.
- Immutable records by default; copy collections on the way in.
- Validate at the API boundary; fail fast with clear errors.
- Keep it simple: don't build what isn't needed yet. No change without a test; run the tests before saying something is done.

In `engine/`:
- JDK only; the `maven-enforcer` rule in `engine/pom.xml` guards this, never loosen it. No Spring, DB or HTTP knowledge.
- Pure code only: no I/O, clock, randomness, logging or mutable static state.
- Rollout bucketing is frozen: murmur3_x86_32, input `flagKey + ":" + userId` in UTF-8, seed 0, 10 000 buckets. Changing any of it re-buckets every user.
- Never edit the golden vectors in `BucketingTest` to make a test pass. Write the failing test first.

In `backend/`:
- Java 21, no Lombok; records for DTOs.
- DB↔engine mapping only in `EngineMapper`; each `RuleSpec` maps itself via `toEngineRule()`, so a new rule type never touches the mapper.
- Authorization only in `AccessPolicy`, enforced on the server, never in the UI alone.
- Every mutation writes its audit row in the same transaction, with a plain-words summary ("rollout 5% → 10%") and the logged-in user as actor.
- Flyway migrations are append-only once committed; add a new `V<n>__` file instead.
- Errors are `ProblemDetail` (`application/problem+json`).
- MCP tools call the same services as the REST controllers and never re-implement logic. A new dashboard capability needs a tool too (`McpApiTest.everyDashboardActionIsATool`). Tool results use the shared views (`FlagView`).
- API keys authenticate only on `/mcp` (`McpSecurityConfig`), sessions only on `/api`. A key is an `AppUser` with `viaApiKey = true` and a fixed role; keys never manage keys.
- Close long-lived responses on shutdown (`ChangeStream.closeAll`), or graceful shutdown waits until Docker SIGKILLs the process.
- Mutations that can change evaluation results publish `FlagChanged`; listeners act after commit only.
- Nulls stop at the boundary: request records normalise in compact constructors (absent → `""`, empty list, or `Optional`), query params arrive as `Optional` with blank as absent, `EvaluationContext` exposes `Optional` accessors. Services, rules and repositories never receive null; internal APIs `requireNonNull`.
- New HTTP behaviour needs an `ApiTest` (real Postgres via Testcontainers); anything about roles also needs a row in `RoleMatrixApiTest`.
- `/api/evaluate` is public by design (SDK keys ship to browsers): never return rules or targeting data (`EvaluateApiTest.responseContainsResultsOnlyNeverRules`).

In `admin/` and `demo/`:
- TypeScript `strict`, no `any`. API types live in one `api.ts` per app. TanStack Query for server state. Plain CSS; icons from `lucide-react` (pinned).
- Colour only via the semantic tokens in `design/tokens.css` (light on `:root`, dark on any element with `data-theme="dark"`; the admin sets it on `<html>` from its theme toggle); never hardcode a colour in an app stylesheet. Add every new text/background pair to `contrast.test.ts` (4.5:1, icons 3:1, both themes).
- Spacing via `--space-*` (4px grid); 6px radius; borders over shadows; animate only `transform`/`opacity`; every icon-only control has an `aria-label`; no `useEffect` for render logic (derive, or adjust state during render).
- `demo/` reads flags only through the SDK (`file:../sdk`), never by calling the API directly.
- The admin is for product managers: lead with whether it's live and for whom, in plain words from `audience.ts`; status is icon + word, never colour alone; prod changes confirm first, saying who's affected.
- The admin never decides permissions itself: it enables controls from `can` on `/api/auth/me` (`PermissionsMatchEnforcementApiTest`).
- Switch users in the admin through `switchSession()`, never `queryClient.clear()` (it detaches the `me` query from its observer).
- Treat the flag service as fallible: time out, render with everything OFF, and say so.
- The storefront has no theme toggle on purpose: its theme is the `dark-mode` flag (sets `data-theme` on `.page`). Keep the `data-flag` attributes on flag-driven blocks and debug rows.
- `qa/run.mjs` finds elements by role and accessible name ("Save prod rules", "Rule 1 user IDs", "<flag> in <env>"). If you rename a label or button, update the runner and re-run the affected cases.

## Known pitfalls

- Mutation-check any new test that passes first time: break the code on purpose and confirm it fails. A stream test once passed against a broadcast-everything mutant, and an enforcer probe once couldn't fail.
- Never change flags or rules in the developer's running stack, which may hold their in-progress review; test with temporary flags or the `ff-qa` stack.
- Don't assert on the real `XSRF-TOKEN` cookie in MockMvc tests: `.with(csrf())` changes the shared filter (`docs/ai-log.md`, known issue). Real CSRF behaviour lives in `CsrfRoundTripTest`.
- `List.of(...)` / `Set.of(...).contains(null)` throws NPE; it bit three times before nulls were stopped at the boundary.
- Browser probes: scope selectors to the region you mean (`.store [data-flag=…]`, not document-wide; the debug panel reuses `data-flag`), and disconnect old MutationObservers before attaching new ones.

<!-- /bmad:context -->
