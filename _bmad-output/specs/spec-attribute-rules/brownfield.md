# Brownfield touch points: attribute rules

Where each capability lands in the existing code (checked at `a17d07e`). The architecture step confirms or changes the shapes marked *proposed*.

| Area | File(s) | Change | CAP |
| --- | --- | --- | --- |
| Engine rule | `engine/src/main/java/dev/flags/engine/rules/` | new `AttributeIn` record (name, operator, values, serve); pattern of `CustomerIdIn`, `IdSets.copyOf` | 1 |
| Engine tests | `engine/src/test/java/dev/flags/engine/rules/` | match / miss / missing attribute for both operators; `CustomRuleTest` already proves unknown attributes reach rules | 1 |
| Backend rule spec | `backend/.../flags/rules/` + `RuleSpec` `@JsonSubTypes` | new `AttributeRule`; *proposed* JSON `{"type":"attribute","attribute":"country","operator":"in"\|"not_in","values":[...],"serve":true}`; `describe()` → "country in US, CA" | 1, 2 |
| API tests | backend `ApiTest`s | save + evaluate with attribute rules; validation errors name fields; role matrix unchanged | 1, 4 |
| Evaluate | `backend/.../evaluation` | `ruleType` "attribute" via `typeName()`; no other change | 4 |
| MCP | `backend/.../mcp/AdminTools.java` (~L279 schema, ~L339 unknown-type message) | add the attribute variant to the hand-written schema and message | 3 |
| Admin rules | `admin/src/rules.ts`, `RuleEditor.tsx` | new draft variant; name field, operator select, value chips | 2 |
| Admin audience | `admin/src/audience.ts` (+ test) | "users with country US or CA" / "users whose country isn't US" (AD-16) | 2 |
| Admin labels | `qa/run.mjs` selectors | only if existing labels change | 2 |
| Demo | `demo/src/users.ts`, `explain.ts` `RULE_LABELS` | add `country` to each user and send it as an attribute; label "attribute" | 4, 5 |
| Seed | `backend/src/main/resources/db/migration/V5__…sql` | a flag with an attribute rule (fictional) | 5 |
| Docs | `docs/plan.md`, README (rule types, assumptions 2, API), PRD FR-4/FR-7 | record the new rule type | all |
