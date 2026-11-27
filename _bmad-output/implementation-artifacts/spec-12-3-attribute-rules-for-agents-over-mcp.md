---
title: 'Story 12.3: Attribute rules for agents over MCP'
type: 'feature'
created: '2026-11-26'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-12-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-attribute-rules/ARCHITECTURE-SPINE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** MCP `set_flag_rules` already accepts attribute rules through the shared `RuleSpec`, but its input schema and unknown-type message still list only users, customers and percent, so agents can't discover the type and get a wrong list in errors.

**Approach:** Add the attribute variant to the hand-written `set_flag_rules` schema, built from `AttributeNames` and `ContextIds` constants (the existing `ID` literal too) (AD-14); build the unknown-type message from the shared rule-type list used by REST; add a test that fails if any `RuleSpec` type is missing from the schema or the message (AD-15). Prove an editor key can save in dev, is denied in prod, and gets the same field errors as REST.

</frozen-after-approval>

## Implementation Notes

- Planned: `RuleSpec.typeChoices()` ("users, customers, percent or attribute") moves the joining out of `ApiExceptionHandler.ruleTypeChoices()` so REST and MCP share one sentence; `AdminTools` schema `oneOf` gains `{"type":{"const":"attribute"}, "attribute": {pattern: AttributeNames.PATTERN}, "operator": {"enum":["in","not_in"]}, "values": array of ID, minItems 1, "serve"}` with required `type, attribute, operator, values`; `ID` reads `ContextIds.PATTERN`; L339 message uses `RuleSpec.typeChoices()`.
- Tests (`McpApiTest`): AD-15 coverage (every `RuleSpec.typeNames()` entry is a `"const"` in the schema and appears in the unknown-type message); editor key saves an attribute rule in dev (audit actor is the key, summary "added rule: country in US, CA") and is denied in prod; bad value and unknown operator give the REST field paths and messages; update the L354 literal.
- `AttributeNames.isValid` (deferred from 12.2): kept — it mirrors `ContextIds.isValid` and is unit-tested; neither is used in production. Not worth a change here.
- Done as planned. `RuleSpec.typeChoices()` now owns the sentence; `ApiExceptionHandler.ruleTypeChoices()` removed. `AdminTools`: `ID` reads `ContextIds.PATTERN`, new `ATTRIBUTE_NAME` reads `AttributeNames.PATTERN`, attribute variant added to the `oneOf`, unknown-type message from `RuleSpec.typeChoices()`.
- Tests first: 3 failed (schema coverage, shared patterns, the updated L354 literal). The editor save/deny and error-parity tests passed on the first run — MCP already accepted attribute rules through the shared `RuleSpec` (as the 12.2 reviewers said). Mutation: disabling MCP rule validation makes all 3 parity rows fail (plus 2 existing tests). The prod-deny assertion is a regression guard on the shared `AccessPolicy`, already covered for every rule type.
- Ran with `clean` (IDE compiler interference again). McpApiTest 29, FlagApiTest 39, EngineMapperTest 4: green.
- Review patches: MCP server instructions (`McpConfig.INSTRUCTIONS`) now mention attribute rules; `maxItems: 1000` on userIds, customerIds and values; attribute description says names and values come from the app's SDK; `docs/plan.md` records the MCP side; prod-deny test also checks rules, version and audit are untouched; `RuleSpec.typeChoices()` unit test; imports instead of FQNs; stray blank line removed. Mutation for the dev-save test: changing the audit wording ("in" → "is") fails `anEditorAgentSavesAttributeRulesInDevButNotProd`.

## Review Triage Log

Layers: Blind Hunter, Repo Invariants (oneshot; context-free subagents, same model).

- medium, patch — MCP server instructions still said rules target only users, customers and percent (BH): agents read this first; updated.
- medium, patch — RI FAIL 4: MCP schema change not in `docs/plan.md`; bullet added.
- low, patch — RI FAIL 15: dev-save assertions never seen failing; audit-wording mutant now fails the test (recorded above).
- low, patch — schema lacked `maxItems: 1000` (BH, RI note): added for all three ID arrays; the server already enforced it.
- low, patch — prod-deny checked only the message (BH): rules, version and audit count now asserted.
- low, patch — `typeChoices()` untested (BH): unit test added. Its empty-list case is false: four types are registered.
- low, patch — FQNs in test, blank line in ApiExceptionHandler (BH, RI notes).
- low, patch — attribute description now says names/values come from the SDK (BH "no discovery tool"); a discovery tool itself is a SPEC non-goal, rejected.
- false — regex pasted into JSON could break (BH): `attributeRuleSchemaUsesTheSharedValidationRules` parses the schema and compares each pattern to the constant, so an escaping problem fails the test.
- low, reject — parity test hardcodes messages instead of calling REST (BH): both paths use the same validator and constants, and REST pins the same strings in `FlagApiTest`.
- low, reject — more invalid cases over MCP (empty values, missing fields, >1000) (BH): same validator as REST, where they're tested.
- low, reject — `ID` rewrite not asserted for users/customers (BH): it's the same constant the attribute assertion checks.
- false — status mismatch (BH): `in-progress` is correct until this step finishes. Spec line references (BH): rejected, the fix edits this spec.
- defer — README MCP table and test counts (RI FAIL 19): Story 12.5 README pass.
- false — untracked QA screenshot: pre-existing, explained in deferred-work.
