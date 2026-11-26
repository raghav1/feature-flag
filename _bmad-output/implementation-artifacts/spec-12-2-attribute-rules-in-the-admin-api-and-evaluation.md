---
title: 'Story 12.2: Attribute rules in the admin API and evaluation'
type: 'feature'
created: '2026-11-25'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'ac812f1265e2febaa87a8a7e3bda395cec3e6c47'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-12-context.md'
  - '{project-root}/AGENTS.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The engine has `AttributeIn` (Story 12.1), but the admin API can't store or validate attribute rules, so editors and evaluation can't use them.

**Approach:** Record the rule type in `docs/plan.md` first, then add a backend `RuleSpec` `AttributeRule` (JSON type `attribute`) that validates at the boundary, describes itself in plain words for the audit, and maps to `AttributeIn`. Evaluation needs no new code: `ruleType` already comes from `typeName()`.

## Boundaries & Constraints

**Always:** `docs/plan.md` is updated before any backend code. JSON is `{"type":"attribute","attribute":"country","operator":"in"|"not_in","values":[…],"serve":true}`; `operator` is required, `serve` defaults to ON (AD-13). Name pattern `^[a-z][a-z0-9_]{0,63}$` and message live in a new `AttributeNames` beside `ContextIds`; values use `ContextIds.PATTERN` (AD-14). Errors name the field. Role matrix and existing rule JSON unchanged (AD-4). Tests first, seen failing.

**Never:** No change to `Evaluator`, `EvaluationContext`, `EngineMapper` or the role matrix. No MCP changes (Story 12.3), no admin or demo UI (12.4, 12.5), no migration, no README changes (12.5).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Save in dev as editor | `country in [US, CA]` | 200; stored; audit "added rule: country in US, CA" | N/A |
| `not_in`, serve OFF | `country not_in [US]`, `serve:false` | audit "added rule: country not in US (serves OFF)" | N/A |
| Evaluate | context country CA / DE / none | CA → `true`, `RULE_MATCH`, `ruleType:"attribute"`; DE and none fall through | N/A |
| Missing operator | no `operator` | 400 | field `rules[0].operator` |
| Unknown operator | `"equals"` or `"not in"` | 400 | field `rules[0].operator` |
| Bad name | `"Country"`, `"1x"`, `""` | 400 | field `rules[0].attribute` |
| No values | `values: []` | 400 | field `rules[0].values` |
| Bad value | `["US", " CA"]` | 400 | field `rules[0].values[1]` |
| Editor in prod | attribute rule, prod | 403 problem+json | unchanged role matrix |
| Unknown rule type | `"type":"region"` | 400 listing users, customers, percent, attribute | derived from `@JsonSubTypes` |

</frozen-after-approval>

## Code Map

- `docs/plan.md` -- L55 built-in rules list, L140 `ruleType` values, L171 decision 2 ("no generic attribute rules yet"): update all three; add the JSON shape to the REST API section.
- `backend/.../flags/rules/RuleSpec.java` -- add one `@JsonSubTypes.Type(AttributeRule.class)`; add a static `typeNames()` reading the `@JsonSubTypes` names, for error messages (Story 12.3 reuses it for MCP).
- `backend/.../flags/rules/CustomersRule.java` -- pattern to copy: compact constructor `serve = RuleSpec.defaultServe(serve)`, `describe()` with `RuleSpec.withServe`, element-level `@Pattern`.
- `backend/.../contexts/ContextIds.java` -- pattern for the new `AttributeNames` (PATTERN, MESSAGE).
- `backend/.../web/ApiExceptionHandler.java` L66-L72 -- hard-coded "Use users, customers or percent."; build it from `RuleSpec.typeNames()`.
- `backend/.../evaluation/EvaluationService.java` L54 -- `ruleType` from `typeName()`; no change expected.
- `backend/.../audit/AuditDiff.java` -- uses `describe()`; no change expected.
- `engine/.../rules/AttributeIn.java` -- target of `toEngineRule()`; nested `Operator.IN` / `NOT_IN`.
- Tests: `flags/FlagApiTest.java` (L105-L133 validation and field-path style, L161 audit wording), `audit/AuditDiffTest.java`, `evaluation/EvaluateApiTest.java` (L73 results-only), `access/EditorProdApiTest.java`, `evaluation/EngineMapperTest.java`.

## Tasks & Acceptance

**Execution:**
- [x] `docs/plan.md` -- record the attribute rule type, its JSON and operators -- AGENTS.md: API changes go into the plan first.
- [x] `backend/.../contexts/AttributeNames.java` -- PATTERN `^[a-z][a-z0-9_]{0,63}$`, MESSAGE, `isValid` -- AD-14.
- [x] `backend/.../flags/rules/AttributeRule.java` -- record `(String attribute, String operator, List<String> values, Boolean serve)`; `@NotNull @Pattern(regexp="in|not_in")` on operator so an unknown value is a field error (an enum would fail JSON parsing and lose the field path); `@NotEmpty @Size(max=1000)` values with element `@Pattern(ContextIds.PATTERN)`; `describe()` "country in US, CA" / "country not in US"; `toEngineRule()` → `AttributeIn` -- AD-13.
- [x] `backend/.../flags/rules/RuleSpec.java` -- register the subtype; add `typeNames()`.
- [x] `backend/.../web/ApiExceptionHandler.java` -- unknown-type message from `RuleSpec.typeNames()`.
- [x] Tests -- one per I/O matrix row, in the files above; plus a round trip mixing users, customers, percent and attribute rules in one save.

**Acceptance Criteria:**
- Given flags saved before this change, when the suite runs, then seed-data and existing rule tests pass unchanged.
- Given an attribute rule in prod, when `/api/evaluate` responds, then `EvaluateApiTest.responseContainsResultsOnlyNeverRules` still passes (AD-6).
- Given any `RuleSpec` subtype, when the unknown-type message is built, then it names every subtype.

## Implementation Notes

- Implemented by a context-free dev subagent from this spec alone. `docs/plan.md` was updated before backend code.
- Seen failing first: compile errors, then — with the classes present but `AttributeRule` not yet registered — behavioural failures (400 instead of 200/403, the old unknown-type message, `typeNames()` mismatch). That covers the RoleMatrix attribute rows, `EditorProdApiTest` and the leak test, whose setup saves an attribute rule. Dev mutants: always "in" in describe, always IN in mapping, uppercase-first names — each caught.
- Review patches (same subagent): explicit operator switch that throws on unknown stored values (test added first, seen failing); leak test also on the matching path; four more boundary rows; imports instead of FQNs; RoleMatrix rows re-aligned (whitespace only); SDK `ruleType` comment includes "attribute".
- Gap in this spec: `context:` didn't list the epic spine, so the dev saw AD-13/AD-14 cited but not defined in `architecture.md` (it worked from the epic context). Future specs in Epic 12 should list `ARCHITECTURE-SPINE.md`.
- Same IDE-compiler interference as 12.1 hit `backend/target`; `clean` fixed it.
- `./test.sh` green after patches.

## Spec Change Log

## Review Triage Log

Layers: Blind Hunter, Edge Case Hunter, Verification Gap, Repo Invariants (context-free subagents, same model). No intent_gap or bad_spec, so no loopback.

- medium, patch — unknown stored operator silently became IN (ECH): rules read from the DB skip @Valid and the 12.5 seed writes raw JSON; now an explicit switch that throws.
- medium, patch — leak test covered only the non-matching path (BH, ECH; ECH's claim that `responseContainsResultsOnlyNeverRules` never sees an attribute rule is the same root): match path added.
- low, patch — missing boundary rows: attribute/values missing, operator "IN", 65-char name (BH).
- low, patch — FQNs in tests, RoleMatrix misalignment (BH, RI nit).
- low, patch — SDK `ruleType` comment stale (VG other).
- false — RI FAIL 15 "never seen failing": the dev saw them fail before registration (400 vs 200/403); evidence now recorded above.
- false — "not_in with a missing attribute untested end to end" (BH): `AttributeInTest.missingAttributeNeverMatchesEitherOperator` and `worksThroughTheEvaluator` cover it; the API passes attributes through unchanged.
- false — `ruleTypeChoices()` on an empty list / subtype without `@JsonTypeName` (BH, ECH): four subtypes are registered and all annotated; `typeNamesListsEverySubtypeInRegistrationOrder` would fail loudly in tests first.
- false — "an existing test's expected message changed, so tests didn't pass unchanged" (ECH): the AC is about seed data and existing rules; the unknown-type message change is the I/O matrix's last row.
- low, reject — reflection on each bad request isn't cached: negligible cost on an error path.
- low, reject — duplicate values audited as "US, US": same behaviour as users and customers rules; engine dedupes.
- low, reject — RoleMatrix attribute rows duplicate rule-type-agnostic checks; 403-before-400 ordering is pre-existing for every rule type.
- medium, defer — admin UI breaks on attribute rules until 12.4; MCP schema/message until 12.3 (VG, ECH, BH, RI note): ship 12.2–12.4 together.
- medium, defer — README Assumption 2 and counts vs plan.md until 12.5 (RI FAIL 19, BH): README was excluded from this story by the approved spec.
- medium, defer — camelCase SDK keys can never be targeted (ECH): approved AD-14; document lowercase keys in 12.5.
- low, defer — 1000-item cap untested (VG): pre-existing for all rule types.
- low, defer — "" may yield two errors (BH): pre-existing pattern; unverified.
- low, defer — unbounded audit summary with many values (BH): same as users/customers rules.
- low, defer — `AttributeNames.isValid` unused, not null-safe (BH, RI): use in 12.3 or remove.

## Verification

**Commands:**
- `JAVA_HOME=/opt/homebrew/opt/openjdk ./mvnw -q -B clean verify` -- expected: green (backend tests need Docker running).
- `./test.sh` -- expected: `==> All green`.
