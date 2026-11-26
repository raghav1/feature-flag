# feature-flags review checklist

Used by the `repo-invariants` review layer in `bmad-build` and `bmad-code-review`
(see `_bmad/custom/bmad-build.toml` and `bmad-code-review.toml`). Each item names the
rule it protects; the rules themselves live in `AGENTS.md` and
`_bmad-output/planning-artifacts/architecture.md`.

For every item, answer PASS, FAIL (with file and line from the diff) or N/A.

## Stop-and-ask (any hit is a FAIL unless the spec records the user's approval)

1. Hashing or bucketing changed (`Bucketing`, `Murmur3`, the `flagKey:userId` input, seed, 10 000 buckets) — AD-3.
2. Golden vectors in `BucketingTest` edited.
3. A dependency added to `engine/pom.xml`, or the enforcer rule loosened — AD-1.
4. API shape or role matrix changed without `docs/plan.md` being updated in the same diff.
5. A committed Flyway migration (`V1__`… already on `main`) edited instead of a new `V<n>__` file — AD-11.

## Architecture invariants

6. `engine/` code does I/O, reads a clock, uses randomness, logs, or imports Spring/JDBC/HTTP — AD-1.
7. A new rule type edits `Evaluator` or `EngineMapper` instead of adding a class and a `toEngineRule()` — AD-2.
8. An authorization decision made outside `AccessPolicy` (in a controller, tool or the UI) — AD-4.
9. A mutation that doesn't write its audit row in the same transaction, or a summary that isn't plain words — AD-5.
10. `/api/evaluate` returning rules, ID lists or anything beyond value, reason, rule index and kind — AD-6.
11. A new dashboard capability without a matching MCP tool, or a tool that re-implements service logic — AD-7.
12. A null passed into a service, rule or repository, or `contains(null)` on an immutable collection — AD-8.
13. A mutation that can change evaluation results without publishing `FlagChanged` — AD-10.

## Tests

14. New HTTP behaviour without an `ApiTest`; a role-related change without a `RoleMatrixApiTest` row.
15. A new test that was never seen failing (ask: was it mutation-checked?).
16. A new text/background colour pair not added to `contrast.test.ts`; a hardcoded colour in an app stylesheet.
17. A renamed label or button without `qa/run.mjs` updated.

## Repo hygiene (public repo)

18. A real secret, `ffk_…` token, `.env` file, personal path or email in the diff.
19. Assumptions made but not added to README → Assumptions; user-visible changes without README updated.
