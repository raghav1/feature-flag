---
id: SPEC-attribute-rules
companions:
  - brownfield.md
  - ../../planning-artifacts/architecture/architecture-attribute-rules/ARCHITECTURE-SPINE.md
  - ../../planning-artifacts/architecture.md
  - ../../planning-artifacts/prd.md
sources: []
---

> **Canonical contract.** This SPEC and the files in `companions:` are the complete, preservation-validated contract for what to build, test, and validate. Source documents listed in frontmatter are for traceability — consult them only if you need narrative rationale or prose color this contract intentionally omits.

# Attribute Targeting Rules

## Why

Opportunity: product managers can target only user IDs, customers or a percentage, so releasing by country, plan or any other trait needs code. The engine already accepts open-ended context attributes (FR-7, AD-2) and the SDK already sends them; only a rule that reads them is missing. This is also the BMAD pilot's first feature built end to end through the method.

## Capabilities

- **CAP-1**
  - **intent:** An editor or admin can target users whose value for a named attribute is in, or not in, a list of values.
  - **success:** For a rule `country in [US, CA]`, users with country US or CA match, others don't; for `not in [US]`, users with any other country match; users with no country match neither. Covered by engine and API tests.
- **CAP-2**
  - **intent:** The admin rule editor creates, edits and reorders attribute rules, and the flag's audience sentence and audit summary describe them in plain words.
  - **success:** In the admin, an editor adds "country is one of US, CA" in dev and saves; the row reads "On for users with country US or CA", and Activity shows "added rule: country in US, CA".
- **CAP-3**
  - **intent:** Agents create and change attribute rules through the MCP `set_flag_rules` tool with the same validation and audit as the dashboard.
  - **success:** An MCP call with an attribute rule succeeds for an editor key in dev and is denied in prod; a malformed name or value returns the same field error as the REST API.
- **CAP-4**
  - **intent:** Evaluation results name the matched rule's kind as `attribute`, and the storefront debug panel labels it, without exposing the attribute name or values.
  - **success:** `/api/evaluate` returns `ruleType: "attribute"` for a match; `EvaluateApiTest.responseContainsResultsOnlyNeverRules` still passes with an attribute rule present.
- **CAP-5**
  - **intent:** The demo storefront shows an attribute rule working.
  - **success:** Each fictional demo user has a country; a seeded flag targets one country; switching users changes the storefront and the debug panel says "matched rule 1 (attribute)".

## Constraints

- The evaluator, `EvaluationContext` and `EngineMapper` don't change: the rule is a new engine `Rule` class and a new backend `RuleSpec` with one `@JsonSubTypes` line (AD-2).
- The engine rule stays pure and JDK-only (AD-1).
- Operators are exactly `in` and `not in`.
- A missing attribute never matches, for either operator.
- Validation at the API boundary: attribute name `^[a-z][a-z0-9_]{0,63}$`; at least one value; each value uses the rule-ID pattern (letters, digits, `_ . : @ -`, max 128). Errors name the field, e.g. `rules[0].values[1]`.
- `/api/evaluate` exposes only the rule's index and kind (AD-6).
- MCP's hand-written `set_flag_rules` input schema and its unknown-type message must include the new type (AD-7).
- Seed changes go in a new migration `V5__`; V1–V4 are never edited (AD-11).
- Existing flags, rules and stored JSON keep working unchanged.

## Non-goals

- Other operators (equals-ignoring-case, starts-with, regex, numeric or date comparisons).
- A registry or allowed list of attribute names.
- Suggestions or "never seen" warnings for attribute names or values.
- Combining several attributes in one rule (AND/OR); use separate rules.
- Looking up attributes on the server (e.g. from a user profile); clients send them.

## Success signal

Viewing the demo as a user in the targeted country shows the seeded feature with "matched rule 1 (attribute)", a user in another country or with no country doesn't, and the admin and Activity describe the rule in plain words — with `./test.sh` green and the existing 25 QA cases still passing.

## Assumptions

- Values match exactly and case-sensitively, like user and customer IDs.
- Values reuse the rule-ID format.
- Attribute names are lowercase (`^[a-z][a-z0-9_]{0,63}$`).
- `customer` is allowed as an attribute name even though a customers rule exists.
