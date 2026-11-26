# Epic 12 Context: Attribute targeting rules

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Product managers can target users by any context attribute (country, plan, …) being in or not in a list of values, from the admin dashboard, the REST API and MCP agents, and the demo storefront shows it working. Today only user IDs, customers and percentages can be targeted, although the engine and SDK already carry open-ended attributes. This is also the first feature built end to end through the BMAD method in this repo.

## Stories

- Story 12.1: Engine attribute rule
- Story 12.2: Attribute rules in the admin API and evaluation
- Story 12.3: Attribute rules for agents over MCP
- Story 12.4: Attribute rules in the admin dashboard
- Story 12.5: Demo storefront shows attribute targeting

## Requirements & Constraints

- Operators are exactly `in` and `not in`.
- An absent or blank attribute value never matches, for either operator.
- Values match exactly and case-sensitively.
- Attribute names are lowercase: `^[a-z][a-z0-9_]{0,63}$`. Values use the existing rule-ID format (letters, digits, `_ . : @ -`, max 128). At least one value.
- Validation happens at the API boundary; errors are problem+json naming the field (`rules[0].attribute`, `rules[0].operator`, `rules[0].values[1]`).
- Evaluation responses expose only the matched rule's index and kind (`attribute`), never the name or values.
- The role matrix is unchanged: editors change dev only.
- An unknown operator, or a value with surrounding spaces, is a 400 naming the field; MCP returns the same field path and message as REST.
- Rules saved before this epic must still load, evaluate and save unchanged.
- Attribute rules can be edited and reordered like other rule types.
- Existing flags, rules and stored JSON keep working unchanged.
- Out of scope: other operators, an attribute-name registry, suggestions or "never seen" warnings for attributes, combining attributes in one rule, server-side attribute lookup.
- Done for every story: tests written first and seen failing; `./test.sh` green.

## Technical Decisions

- Engine: one rule `AttributeIn(String attribute, Operator operator, Set<String> values, boolean serve)` with engine enum `Operator { IN, NOT_IN }`. Pure and JDK-only; constructor rejects a blank name and empty or blank values. The evaluator, `EvaluationContext` and `EngineMapper` must not change — a new rule type is a new class.
- Backend: a new `RuleSpec` record `AttributeRule` registered with one `@JsonSubTypes` line; JSON `{"type":"attribute","attribute":"country","operator":"in"|"not_in","values":[…],"serve":true}`. `operator` is required (no default); `serve` defaults to ON like other rules. `describe()` gives "country in US, CA" / "country not in US", plus " (serves OFF)".
- Validation constants `AttributeNames.PATTERN` / `MESSAGE` live beside `ContextIds`; REST validation and the MCP schema both use these constants, never literals.
- MCP's `set_flag_rules` input schema is hand-written and must gain the attribute variant; a new test asserts every `RuleSpec` subtype appears in that schema and in the unknown-type message.
- Every mutation keeps writing its audit row in the same transaction; MCP tools reuse the services.
- Seed data goes in a new migration `V5__`; committed migrations are never edited.
- `docs/plan.md` records the new rule type and JSON shape before backend code changes.

## UX & Interaction Patterns

- Rule editor: attribute name field, operator select reading "is one of" / "is not one of", value chips validated like ID chips; accessible names "Rule N attribute name" and "Rule N values"; existing labels unchanged (the QA runner finds elements by accessible name).
- Audience wording: "users with country US or CA"; "users whose country isn't US"; more than two values → "users with country in N values".
- Storefront debug label for the kind: "attribute". Demo users: Ana and Cy US, Ben CA, Dee DE, Eli and the anonymous visitor without a country; seeded flag `free-shipping` (prod: `country in [CA]`, Otherwise OFF; dev: enabled, no rules, Otherwise ON) with its own storefront block.

## Cross-Story Dependencies

- 12.2 depends on 12.1 (maps to the engine rule). 12.3 depends on 12.2 (same `RuleSpec`, constants). 12.4 depends on 12.2 (API shape). 12.5 depends on 12.2 and 12.4 (seed via API shape; storefront label).
