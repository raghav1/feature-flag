---
title: 'Story 12.5: Demo storefront shows attribute targeting'
type: 'feature'
created: '2026-11-26'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'ff96f6fe1c87b0db99c9bf3099b662bd9b0c89fb'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-12-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-attribute-rules/ARCHITECTURE-SPINE.md'
  - '{project-root}/AGENTS.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Attribute rules work in the engine, API, MCP and admin, but nothing shows them end to end: the demo users send no country, no seeded flag uses the rule, and the README still lists three rule types.

**Approach:** Seed a `free-shipping` flag (prod: `country in [CA]`) in a new migration, give the fictional demo users countries and send them as an attribute, show a free-shipping block on the storefront, label the rule kind in the debug panel, and bring the README and PRD up to date, including the items deferred from Stories 12.2–12.4.

## Boundaries & Constraints

**Always:** New migration `V5__…sql` only; V1–V4 untouched (AD-11). Seed JSON exactly `{"type":"attribute","attribute":"country","operator":"in","values":["CA"],"serve":true}` and proven valid by a test that evaluates it. Fictional data only. Storefront block uses design tokens and keeps `data-flag` on flag-driven blocks and debug rows. Existing demo behaviour for the other flags unchanged; the top 25 QA cases and ADM-RULE-ATTR-01 still pass. Tests first.

**Never:** No engine, rule-model, admin or MCP behaviour changes. No theme toggle. No new dependencies.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Seed | fresh database | `free-shipping` ("Free shipping for Canada"): prod enabled, rule `country in [CA]`, Otherwise OFF; dev enabled, no rules, Otherwise ON | N/A |
| Ben (CA), prod | storefront as Ben | free-shipping block shown; debug "matched rule 1 (attribute)" | N/A |
| Ana, Cy (US), Dee (DE), prod | storefront | no free-shipping block; debug says Otherwise OFF | N/A |
| Eli, anonymous (no country), prod | storefront | no block (missing attribute never matches) | N/A |
| Any user, dev | storefront in dev | block shown (Otherwise ON) | N/A |
| SDK context | `sdkUser(ben)` | `{ id: "u_207", attributes: { customer: "acme", country: "CA" } }`; Eli → `{ id: "u_412", attributes: { customer: "zenith" } }` | N/A |
| Dropdown label | Ben | "Ben · u_207 (acme, CA)"; anonymous unchanged | N/A |

</frozen-after-approval>

## Code Map

- `backend/src/main/resources/db/migration/` -- V1–V4 exist; add `V5__free_shipping_seed.sql` in the style of `V2__seed.sql` L13-30 (insert flag, then one `flag_environment` row per env via `SELECT … JOIN (VALUES …)`).
- `backend/src/test/java/dev/flags/backend/evaluation/EvaluateApiTest.java` -- `eachDemoUserTakesTheirOwnPath` (L47) is the per-user seed oracle: add free-shipping expectations (proves the seeded JSON loads and evaluates; an invalid stored operator would throw since 12.2). `flags/FlagApiTest.seedDataIsThere` (L32) for the seeded rule shape.
- `demo/src/users.ts` -- `DemoUser` gains `country?`; Ana US, Ben CA, Cy US, Dee DE, Eli and anonymous none; `label()` and `sdkUser()` include it. `demo/src/users.test.ts` -- update the `sdkUser` expectations.
- `demo/src/explain.ts` L4-8 `RULE_LABELS` -- add `attribute: "attribute"` so the panel reads "matched rule 1 (attribute)"; `explain.test.ts` covers it.
- `demo/src/Storefront.tsx` -- add a `free-shipping` section (`data-flag="free-shipping"`, `FlagNote`, a lucide `Truck` icon) after beta-reports; `demo/src/styles.css` -- tokens only.
- `qa/run.mjs` L304 collects every `main [data-flag]` for the flicker check and L328-341 checks the prod oracle per user: confirm the new block doesn't break them; extend the oracle with free-shipping if it lists every flag.
- `README.md` -- L37 walkthrough (optional one line), L115 rule types, L149-170 rule JSON and `ruleType` values, L200-210 demo users table (add a country column and free-shipping), L234 MCP `set_flag_rules` row, L252-260 test counts (re-run to get them), L273 Assumption 2, plus a new assumption that attribute names are lowercase so SDK callers must send lowercase keys.
- `_bmad-output/planning-artifacts/prd.md` -- FR-4 and FR-7 (attribute rule exists), §5 Non-Goals (drop "generic attribute rules"), §6.1 scope.

## Tasks & Acceptance

**Execution:**
- [x] `V5__free_shipping_seed.sql` + seed tests (EvaluateApiTest oracle, FlagApiTest shape).
- [x] `demo/src/users.ts`, `users.test.ts` -- countries, label, SDK attributes.
- [x] `demo/src/explain.ts`, `explain.test.ts` -- "attribute" label.
- [x] `demo/src/Storefront.tsx`, `styles.css` -- free-shipping block.
- [x] `qa/run.mjs` -- keep existing cases passing; add free-shipping to the prod oracle if applicable.
- [x] `README.md`, `prd.md` -- as in the Code Map.

**Acceptance Criteria:**
- Given `./test.sh`, then it is green and README test counts match its output.
- Given the `ff-qa` stack rebuilt and reset, when the top 25 cases and ADM-RULE-ATTR-01 run, then all pass.
- Given the storefront in a browser as Ben (prod), then the free-shipping block and "matched rule 1 (attribute)" show; as Ana, neither.

## Implementation Notes

- Built by a context-free dev subagent. Seen failing first: EvaluateApiTest free-shipping rows and `freeShippingIsForCanadaInProdAndEveryoneInDev` (before V5), `FlagApiTest.freeShippingSeedTargetsCanadaInProd` (404), `users.test.ts` country/label/sdkUser. Mutant: seeded operator `inn` → 18 EvaluateApiTest failures ("Unknown attribute rule operator"), thanks to the 12.2 operator fix. `explain.test.ts` "attribute" passed first time (raw-type fallback already printed it). QA runner: free-shipping added to the seed restore, the per-user prod oracle and the dev check; ADM-ROLE-01 switch count 6 → 8.
- Review patches (same subagent): V5 made idempotent and non-destructive (`ON CONFLICT (key) DO NOTHING`; environment rows only when the flag has none) with a new `FreeShippingSeedMigrationTest` that migrates to V4, creates a user's own `free-shipping`, migrates to latest and checks it's untouched — it failed on the old V5 (`flag_key_key`) and again with only the NOT EXISTS guard removed (`flag_environment_pkey`); `qa/top15.mjs` updated (8 switches, four flags); `restoreSeed()` re-enables free-shipping in prod; QA plan §2 oracle and ADM-LIST-01; README "four flags" and Assumption 20 (attribute names/values never suggested or flagged unseen); tighter EvaluateApiTest assertions (no ruleType/ruleIndex on OTHERWISE; RULE_MATCH for anonymous in CA).
- Verification (orchestrator): `./test.sh` green; README counts match the run exactly (engine 103 + backend 266 + sdk 21 + admin 111 + demo 9 = 510); full QA `node run.mjs --reset` 26/26 on a rebuilt ff-qa; Ben's DEMO-USER-01 screenshot shows the free-shipping block and "matched rule 1 (attribute)". Regenerated qa/results reverted. `qa/top15.mjs` edits are syntax-checked only (it can't run a single case).

## Spec Change Log

## Review Triage Log

Layers: Blind Hunter, Edge Case Hunter, Verification Gap, Repo Invariants. No intent_gap or bad_spec.

- high, patch — V5 would fail Flyway (unique key) on an existing database that already has `free-shipping`, so the backend wouldn't start (BH, ECH): idempotent and non-destructive now, with an upgrade-path test.
- medium, patch — `qa/top15.mjs` still expected 6 switches and three flags (ECH): updated.
- medium, patch — QA plan §2 oracle and ADM-LIST-01 didn't know free-shipping (BH, ECH): updated.
- low, patch — `restoreSeed()` didn't re-enable free-shipping in prod (VG other, ECH).
- low, patch — README said three seed flags (ECH); attribute values never suggested/flagged not stated (BH): Assumption 20.
- low, patch — OTHERWISE rows didn't assert absent ruleType/ruleIndex; duplicate `{}` evaluation; anonymous CA case checked only `value` (BH, RI note).
- low, patch — RI FAIL 15 evidence recorded above.
- false — "privacy claim untested for free-shipping" (BH): `attributeRuleNameAndValuesNeverReachTheResponse` (12.2) covers attribute rules on both match and non-match paths.
- false — "README counts untraceable" (BH, RI note): they match this `./test.sh` run exactly (510).
- false — "seeded flag has no audit history" (BH): V2's seed flags have none either (V2 writes no `audit_event` rows); existing pattern.
- false — debug text "(attribute)" too thin (BH): AD-6 keeps names and values out of `/evaluate`; the label is the approved wording.
- low, reject — hand-built attribute JSON in a test (BH): readable at two attributes.
- low, reject — switch count literal 8 (BH): commented, and the run proves it.
- defer — storefront block covered only by the QA runner, not `./test.sh` (VG): the repo keeps browser tests out of test.sh for every block.

## Verification

**Commands:**
- `./test.sh` -- expected: `==> All green`.
- `ADMIN_PORT=6173 DEMO_PORT=6174 BACKEND_PORT=9080 POSTGRES_PORT=6433 docker compose -p ff-qa up -d --build` then `(cd qa && node run.mjs --reset)` -- expected: all cases pass. Do not keep regenerated `qa/results/` files.
