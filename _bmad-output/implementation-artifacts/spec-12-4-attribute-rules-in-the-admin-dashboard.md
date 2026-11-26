---
title: 'Story 12.4: Attribute rules in the admin dashboard'
type: 'feature'
created: '2026-11-26'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '1a8e151781e50becf40d421b27bed19a5e263d5d'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-12-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-attribute-rules/ARCHITECTURE-SPINE.md'
  - '{project-root}/AGENTS.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The backend and MCP accept attribute rules, but the admin can't create them, and a flag that already has one breaks the dashboard: `toDraft` and `ruleAudience` return `undefined` for the type.

**Approach:** Add the attribute rule to the admin's rule model, editor and plain-English audience, reusing the ID-chip input for values (without seen-ID suggestions, a SPEC non-goal) and the existing design tokens. Product managers can add, edit, reorder and read attribute rules like any other rule.

## Boundaries & Constraints

**Always:** Wording follows AD-16: `in` → "users with country US or CA", `not_in` → "users whose country isn't US", more than two values → "users with country in N values". Add-rule button "Users by attribute"; operator select "is one of" / "is not one of"; accessible names "Rule N attribute name", "Rule N operator", "Rule N values". Client checks mirror the server (`AttributeNames.PATTERN`, `ContextIds.PATTERN`) for instant feedback; the server stays the authority. Colours only from tokens (icon: `attention-fg` on `attention-subtle`, already contrast-tested). Existing labels and behaviour unchanged. Tests first.

**Never:** No suggestions or "never seen" warnings for attribute names or values. No backend, MCP, demo, seed or README changes. No new dependencies. No `useEffect` for render logic.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Load existing | env has `country in [US, CA]` | editor shows the rule; row reads "On for users with country US or CA" | N/A |
| Add and save | add "Users by attribute", name `country`, "is one of", values US, CA, Save | saved JSON `{"type":"attribute","attribute":"country","operator":"in","values":["US","CA"],"serve":true}` | N/A |
| Not in | `not_in [US]` | "users whose country isn't US" | N/A |
| Many values | `in [US, CA, MX]` | "users with country in 3 values" | N/A |
| Many values, not in | `not_in [US, CA, MX]` | "users whose country isn't in 3 values" | N/A |
| New, unfinished | name or values empty | hint "Add an attribute name and at least one value."; Save disabled | blocks save |
| Bad name | `Country` | error naming the rule; Save disabled | "Use lowercase letters, digits and _, starting with a letter (max 64)." |
| Bad value typed | `"C#A"` stays in the box | error like ID chips; Save disabled; Discard clears it | blocks save |
| Spaces in values | `" CA"` / `"C A"` | a space separates values, like ID chips: `CA` / `C` and `A` | N/A |
| Reorder | move attribute rule up/down | order saved as shown | N/A |
| Mixed rules | users, attribute, percent | audience joins all: "On for user u_102, users with country US or CA and 10% of users" | N/A |

**Decisions (user, 2026-11-26, at the step-3 matrix audit):** keep the existing "user u_102" wording (the original row was a typo); spaces separate values like ID chips; "users whose country isn't in N values" for `not_in` with more than two values.

</frozen-after-approval>

## Code Map

- `admin/src/api.ts` L25-28 -- `Rule` union: add `{ type: "attribute"; attribute: string; operator: "in" | "not_in"; values: string[]; serve: boolean }`.
- `admin/src/rules.ts` -- `DraftRule` union, `RULE_LABELS`, `toDraft`/`fromDraft`/`newDraft`, `hasRejectedText`, `draftProblems`: add the attribute case. Reuse `addIds`/`effectiveIds`/`isValidId` for values (same pattern as IDs). Add `ATTRIBUTE_NAME_PATTERN` mirroring `AttributeNames.PATTERN`.
- `admin/src/audience.ts` -- `ruleAudience` switch: add attribute wording; `list()` joins with "and", attribute values need "or".
- `admin/src/RuleEditor.tsx` -- per-rule body branch (percent vs ID list) gains an attribute body: name `<input>`, operator `<select>`, `IdListInput` for values; `RULE_ICONS` gains `Tag` (lucide, already a dependency); add-rule button list `["users","customers","percent"]` gains `"attribute"`.
- `admin/src/IdListInput.tsx` -- fetches suggestions/unseen by `kind`. Make `kind` optional: when absent, no queries, no suggestion list, no unseen note.
- `admin/src/styles.css` L242-246 -- add `.rule-icon.attribute { background: var(--attention-subtle); color: var(--attention-fg); }`.
- Tests: `admin/src/rules.test.ts`, `admin/src/audience.test.ts` (vitest, pure functions; no component-test library in the repo).
- `qa/run.mjs` -- finds elements by accessible name; must still pass unchanged.

## Tasks & Acceptance

**Execution:**
- [x] `admin/src/api.ts` -- attribute variant of `Rule`.
- [x] `admin/src/rules.ts` + `rules.test.ts` -- draft model, validation, round trip; tests for every I/O row that is pure logic.
- [x] `admin/src/audience.ts` + `audience.test.ts` -- AD-16 wording, including the mixed sentence.
- [x] `admin/src/IdListInput.tsx` -- optional `kind`.
- [x] `admin/src/RuleEditor.tsx`, `styles.css` -- attribute body, icon, add button.

**Acceptance Criteria:**
- Given `npm --prefix admin test` and `npm --prefix admin run build`, then both pass (TypeScript strict, no `any`).
- Given the running admin, when an editor adds, saves, reloads, reorders and removes an attribute rule in dev, then each step works and the row reads per AD-16 (checked in a browser).
- Given the top 25 QA cases, when run against the `ff-qa` stack, then all pass.

## Implementation Notes

- Built by a context-free dev subagent from this spec. Tests first: 12 failed, then passed; dev mutants (name check removed, `fromDraft` key order swapped) each caught. Attribute values reuse the ID chips' `ids`/`pending` fields, so `hasRejectedText` and Discard work unchanged. `fromDraft` writes keys in server order so a loaded rule isn't "dirty".
- Matrix audit found 3 rows the code didn't match (wording "user u_102", spaces in values, `not_in` > 2 values); the user decided all three (recorded in the frozen block).
- Review patches (same subagent): body classes renamed `.attribute-rule*` (the generic `.attribute` overrode the icon's `display:grid`); "Fix the values first." for attribute drafts; `autoComplete`/`autoCorrect` off on the name; new Playwright case ADM-RULE-ATTR-01 in `qa/run.mjs` (+ row in `docs/qa-test-plan.md`) that drives the real editor, checks the stored JSON, row text and that no suggestions appear — it fails when the values box gets `kind="user"`; mutants on the name pattern and `hasRejectedText` each fail a test.
- Verification: `./test.sh` green (admin 111 tests); top 25 QA 25/25 (dev run, results reverted per user); ADM-RULE-ATTR-01 1/1; screenshot `qa/results/screenshots/26-ADM-RULE-ATTR-01-saved.png` shows the centred icon, "On for users whose country isn't US or CA" and the audit "added rule: country not in US, CA".

## Spec Change Log

## Review Triage Log

Layers: Blind Hunter, Edge Case Hunter, Verification Gap, Repo Invariants (context-free, same model). No intent_gap or bad_spec.

- medium, patch — `.attribute` class overrode the icon's centring (found by the orchestrator reading the diff; BH flagged the generic names).
- medium, patch — no automated check of the editor UI (VG, pre-verified; BH): ADM-RULE-ATTR-01 added, proven able to fail.
- low, patch — "IDs" wording on attribute values (BH, ECH).
- low, patch — Safari autocorrect on the name (BH).
- low, patch — RI FAIL 15 mutation evidence for the name pattern and `hasRejectedText`.
- low, patch — stray blank line (BH, RI note).
- low, defer — one problem shown per rule (BH, ECH).
- low, defer — double negative for serve-OFF `not_in` under Otherwise ON (BH): needs a wording decision.
- low, defer — client patterns are hand copies of the server's (BH): pre-existing approach.
- false — ">2 values hides which values" (BH): AD-16, user-approved.
- false — "US" and "us" both allowed (BH): matching is case-sensitive by design (epic context).
- low, reject — trim/lowercase the name automatically (ECH, BH): the message explains; Safari fix removes the common cause.
- low, reject — hint doesn't say which part is missing (BH): one short hint covers both; Save stays blocked.
- low, reject — aria-invalid/aria-describedby on the name (BH): ID inputs don't do it either; separate a11y pass.
- low, reject — client cap at 1000 values (ECH): the server rejects with a field error; rare.
- low, reject — empty name/values or unknown operator in stored data (ECH): only reachable by bypassing the API; the backend now throws on an unknown operator (12.2).
- low, reject — dead `kind ?` branch in IdListInput queryFn (BH): there for the type checker; harmless.

## Verification

**Commands:**
- `npm --prefix admin test` -- expected: all pass.
- `npm --prefix admin run build` -- expected: typecheck and build succeed.
- `./test.sh` -- expected: `==> All green`.

**Manual checks:**
- In the browser (admin on the running stack), the I/O rows "Load existing", "Add and save", "Reorder" and "Bad value typed" behave as stated.
