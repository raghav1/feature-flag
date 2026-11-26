---
title: 'Story 12.1: Engine attribute rule'
type: 'feature'
created: '2026-11-25'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-12-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The engine can target only user IDs, customers and percentages, although `EvaluationContext` already carries open-ended attributes.

**Approach:** Add one pure, JDK-only engine rule, `AttributeIn(attribute, operator, values, serve)` with an `IN` / `NOT_IN` operator, that matches on an attribute value being in or not in a set. An absent or blank value never matches. `Evaluator`, `EvaluationContext`, the enforcer rule and existing rules don't change (AD-1, AD-2, AD-12). Tests first, seen failing.

</frozen-after-approval>

## Implementation Notes

- Planned files: `engine/src/main/java/dev/flags/engine/rules/AttributeIn.java` (record with nested `enum Operator { IN, NOT_IN }`, pattern of `CustomerIdIn`; values via `IdSets.copyOf(values, "values")`; `requireNonNull` on name and operator, `IllegalArgumentException` on a blank name) and `engine/src/test/java/dev/flags/engine/rules/AttributeInTest.java` (style of `CustomerIdInTest`, using `Contexts`).
- Test cases: `in` matches listed values only; `not in` matches other values; both miss a missing attribute, a blank value and anonymous; matching is case-sensitive; the same value under another attribute name misses; `serve` defaults to true via the 3-arg constructor and `false` is carried; constructor rejects blank name, empty values, blank value, null operator.
- Operator nested in `AttributeIn` (not top-level): it only means something for this rule; the backend maps `in`/`not_in` to it in Story 12.2.
- Done: `AttributeIn.java` and `AttributeInTest.java` (11 tests) as planned. Tests were seen failing first (compile errors: `AttributeIn` missing). Engine suite 91 → 102, all green. No change to `Evaluator`, `EvaluationContext`, `IdSets` or `engine/pom.xml`.
- Mutation check (clean builds): removing the blank filter → 1 failure; missing attribute matching `not in` → 2 failures; ignoring the operator → 2 failures.
- Surprise: the first mutation run showed `java.lang.Error` in every case, including the restored code. VS Code's Java extension (Eclipse compiler) was compiling the mutant into `engine/target/` in parallel. `clean test` fixed it; this is why `test.sh` uses `clean verify`.
- Local JDK: `java` isn't on PATH; ran with `JAVA_HOME=/opt/homebrew/opt/openjdk` (JDK 24, `--release 21`), as noted in docs/ai-log.md phase 0.
- Customization fix during this run: `oneshot_review_layers` lacked the repo-invariants reviewer; added to `_bmad/custom/bmad-build.toml`.

## Review Triage Log

Layers run: Blind Hunter, Repo Invariants Reviewer (both context-free subagents, same model). Repo Invariants: 19/19 PASS or N/A.

- medium — SPEC CAP-2 vs AD-16 audience wording differ. Deferred (spec edit; before 12.4).
- low — status mismatch: spec/sprint `in-progress` are correct mid-workflow (false); epics.md Epic List said `planned` while sprint said `in-progress` → patched to `in progress`.
- false (for this change) — stray `07-ADM-ACT-02-failure.png`: untracked before the pilot, not part of this change. Deferred as pre-existing.
- low — no test through `Evaluator` → patched: `worksThroughTheEvaluator` (serve OFF with index 0, IN at index 1, missing attribute falls through to Otherwise).
- low — `ignoresTheFlagKey` couldn't fail → patched to assert `isTrue()` for both keys.
- low — null element in values untested → patched; exception-message checks rejected (adds noise, guards already distinct by type); inline `java.util.HashSet` → patched to an import.
- low — " US" accepted but never matches: unreachable via API (ContextIds.PATTERN forbids spaces); engine failing loudly isn't required for unreachable states. Deferred as a Story 12.2 API test.
- false — "seen failing was only a compile error": compile-red is the normal first red in test-first; behavioural red is covered by three mutants, each failing tests.
- medium — missing ACs (reorder, MCP field error parity, stored-JSON compatibility, unknown operator). Deferred (epic edits; before 12.2–12.4).
- medium — oneshot reviewer scope omits docs/, qa/, README, _bmad-output/. Deferred (customization edit; ask user).
- low — duplicated reviewer prompt in two layers. Folded into the deferred scope item.
- false — sprint-status date format: owned by `sprint_plan.py`, which parses `MM-DD-YYYY HH:MM`.
- low — spine binds omit AD-4. Deferred (spine edit).
- low — FR coverage row format in epics.md. Rejected: cosmetic, readers understand it.
- medium — free-shipping dev state unspecified. Deferred (Story 12.5 edit).
