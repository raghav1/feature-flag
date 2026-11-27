---
status: final
provenance: backfilled
stepsCompleted: []
inputDocuments:
  - _bmad-output/planning-artifacts/prd.md
  - _bmad-output/planning-artifacts/architecture.md
  - docs/plan.md
---

# feature-flags - Epic Breakdown

## Overview

Backfilled on 2026-11-25 from the shipped work: phases 0–6 of `docs/plan.md` plus the additions recorded under "Added after the plan". Every epic here is **done**; each lists the commits that delivered it and the tests that prove its acceptance criteria. New work starts at Epic 12 and goes through `bmad-create-epics-and-stories` → `bmad-sprint-planning` → `bmad-build`.

## Requirements Inventory

### Functional Requirements

FR-1 – FR-19 as defined in `prd.md` §4.

### NonFunctional Requirements

- NFR-1: Evaluation is deterministic across runs, environments and servers (AD-3).
- NFR-2: Authorization is enforced on the server for every role-matrix cell (AD-4).
- NFR-3: Text contrast ≥ 4.5:1 (icons 3:1) in light and dark themes.
- NFR-4: Clients keep working during a flag-service outage (cached values or all OFF, stated on the page).
- NFR-5: A clean clone needs only Docker to run and test (`docker compose up`, `./test.sh`).

### Additional Requirements

Architecture invariants AD-1 – AD-11 in `architecture.md` bind every story.

### UX Design Requirements

No separate UX document; the admin and storefront follow the conventions in `AGENTS.md` (product-manager-first admin, shared design tokens).

### FR Coverage Map

| FR | Epic |
| --- | --- |
| FR-1 – FR-3 | 2 |
| FR-4 | 2, 7 |
| FR-5, FR-7 | 1 |
| FR-6, FR-15 | 3 |
| FR-8, FR-9 | 2 |
| FR-10 | 9 |
| FR-11, FR-12 | 4, 9 |
| FR-13 | 7 |
| FR-14 | 10 |
| FR-16 | 6 |
| FR-17 | 6 |
| FR-18, FR-19 | 8 |
| FR-4, FR-7 extended by SPEC-attribute-rules CAP-1 – CAP-5 | 12 |

## Epic List

| # | Epic | Status | Commits |
| --- | --- | --- | --- |
| 0 | Scaffold and clean-machine test runner | done | f0b47bb, 98bcb2a |
| 1 | Evaluation engine | done | db53d9a |
| 2 | Admin API with roles and audit | done | aaf2de0, 2c12558, d7cbf33 |
| 3 | Evaluation API and demo storefront | done | c515b29 |
| 4 | Admin UI | done | 3735e3b |
| 5 | Reviewer-ready README | done | 9cc2a40, 4fd685d |
| 6 | Live updates and TypeScript SDK | done | 3a990a5, 7fb6f24 |
| 7 | Rule-ID checks and suggestions | done | a0f67d1, a4b4dbf |
| 8 | MCP server and API keys | done | 84a88dd |
| 9 | Admin for product managers and Activity | done | 1ceca1f, cb2bc2a |
| 10 | Shared design system | done | 433513d, 627cb78 |
| 11 | Browser QA | done | 2b6deb3, 4fd0b41, c94556e, bbbf544, 4b4cc13 |
| 12 | Attribute targeting rules | in progress | (BMAD pilot: SPEC-attribute-rules) |

## Epic 0: Scaffold and clean-machine test runner

Every module builds and runs from one command, on any machine with Docker.

### Story 0.1: One-command stack

As a reviewer, I want `docker compose up` to start everything, so that I can try the service without setup.

**Given** a clean clone **When** I run `docker compose up --build` **Then** Postgres, backend (health UP), admin and demo all start **And** ports can be overridden by env vars.

### Story 0.2: test.sh without local toolchains

As a reviewer, I want `./test.sh` to work with only Docker, so that I can verify the build.

**Given** no local JDK 21 or Node 20 **When** I run `./test.sh` **Then** that half runs in Docker containers and all tests really execute.

## Epic 1: Evaluation engine

A pure, deterministic engine that is tested hard in isolation (FR-5, FR-7; AD-1 – AD-3).

### Story 1.1: Rule evaluation

As an engineer, I want first-match rule evaluation with an Otherwise value, so that targeting is predictable.

**Given** a flag off in an environment **When** it is evaluated **Then** the result is false with FLAG_OFF **And** with rules, the first match wins; with none matching, Otherwise applies (`EvaluatorTest`).

### Story 1.2: Deterministic rollouts

As a PM, I want percentage rollouts that keep users stable, so that widening a rollout never flips anyone off.

**Given** a user and a flag **When** evaluated repeatedly or at a higher percentage **Then** the answer is stable and monotonic **And** golden vectors from an independent murmur3 match (`BucketingTest`, `Murmur3Test`).

### Story 1.3: Open-ended context

As an engineer, I want to add rules on new attributes without changing the engine, so that targeting can grow.

**Given** a rule reading an attribute the engine has never seen **When** evaluated **Then** it works with no change to the context or evaluator (`CustomRuleTest`).

## Epic 2: Admin API with roles and audit

Flags, environments, rules, roles and audit over REST (FR-1 – FR-4, FR-8, FR-9).

### Story 2.1: Flag and rule management

As an editor, I want to create flags and edit rules per environment, so that I can control releases.

**Given** valid input **When** I create a flag or save rules with the current version **Then** it is stored **And** a stale version returns 409, bad input returns 400 problem+json.

### Story 2.2: Server-enforced roles

As a team lead, I want prod restricted to admins, so that editors can't change production.

**Given** each role and action **When** the API is called **Then** it allows or denies per the role matrix (`RoleMatrixApiTest`, every cell).

### Story 2.3: Plain-words audit

As a PM, I want every change recorded with who and what in plain words, so that I can trace changes.

**Given** any mutation **When** it commits **Then** an audit row with actor and summary such as "rollout 5% → 10%" is written in the same transaction.

### Story 2.4: Nulls normalised at the boundary

As a maintainer, I want nulls stopped at the API boundary, so that the `contains(null)` NPE can't recur.

**Given** absent fields or params **When** a request arrives **Then** they are normalised before reaching services, rules or repositories.

## Epic 3: Evaluation API and demo storefront

Applications read flags safely (FR-6, FR-15).

### Story 3.1: Results-only evaluation

As an engineer, I want an evaluation endpoint keyed by SDK key, so that browsers get answers without seeing rules.

**Given** an SDK key and a context **When** I call `/api/evaluate` **Then** I get values and reasons only (`EvaluateApiTest.responseContainsResultsOnlyNeverRules`) **And** an unknown flag is false with FLAG_NOT_FOUND, HTTP 200.

### Story 3.2: Storefront with debug panel

As a demo viewer, I want to switch users and see why each flag has its value, so that targeting is visible.

**Given** the storefront **When** I switch "Viewing as" **Then** the page and debug panel change together with no flicker before first render.

## Epic 4: Admin UI

The wireframe flow for each role (FR-11, FR-12).

### Story 4.1: Login and role-aware controls

As an editor, I want controls I can't use to be disabled, so that I'm not misled.

**Given** a signed-in user **When** the dashboard loads **Then** controls follow `can` from `/api/auth/me` (`PermissionsMatchEnforcementApiTest`).

## Epic 5: Reviewer-ready README

### Story 5.1: Clean-clone walkthrough

As a reviewer, I want setup, endpoints, assumptions and logins documented, so that a clean clone works first time.

**Given** a clean clone and the README **When** I follow it **Then** everything runs (verified and logged in `docs/ai-log.md`).

## Epic 6: Live updates and TypeScript SDK

Changes appear without refresh; clients survive outages (FR-16, FR-17).

### Story 6.1: Server-sent events

As a demo viewer, I want admin changes to appear without refreshing, so that the effect is immediate.

**Given** a connected client **When** a flag changes in its environment **Then** a `changed` event arrives after commit, only for that environment **And** the client reconnects after outages.

### Story 6.2: Resilient SDK

As an engineer, I want `isEnabled` from a cache that survives outages, so that my app keeps working.

**Given** the backend is down **When** the page reloads **Then** the SDK serves last known values from `localStorage`, or all OFF with nothing cached, and says so.

## Epic 7: Rule-ID checks and suggestions

(FR-4, FR-13)

### Story 7.1: Validate and remember IDs

As an editor, I want malformed IDs rejected and seen IDs remembered, so that rules target real users.

**Given** a malformed ID **When** I save **Then** a 400 names the field (e.g. `rules[0].userIds[1]`) **And** evaluated IDs are recorded as seen.

### Story 7.2: ID chips with suggestions

As an editor, I want suggestions and an "unseen" warning while typing IDs, so that typos are caught.

**Given** I type an ID **When** suggestions appear **Then** Enter adds exactly what I typed unless I picked a suggestion **And** an unseen ID shows a warning but is allowed.

## Epic 8: MCP server and API keys

Agents get the dashboard's capabilities with the same rules (FR-18, FR-19; AD-7).

### Story 8.1: Tools for every dashboard action

As an agent operator, I want MCP tools mirroring the dashboard, so that agents can manage flags.

**Given** an API key **When** an agent calls the 12 tools **Then** they use the same services and views as REST (`McpApiTest.everyDashboardActionIsATool`).

### Story 8.2: Admin-managed keys

As an admin, I want to issue and revoke fixed-role keys, so that agent access is controlled.

**Given** I create a key **When** it is shown **Then** it appears once, is stored hashed, works only on `/mcp`, and can't manage keys.

## Epic 9: Admin for product managers and Activity

(FR-10, FR-11, FR-12)

### Story 9.1: Expandable rows in plain English

As a PM, I want each flag to say whether it's live in prod and for whom, so that I understand it at a glance.

**Given** the flag list **When** it loads **Then** each row shows Live / Partial / Off (icon + word) and an audience sentence from `audience.ts` **And** prod switches confirm first, saying who's affected.

### Story 9.2: Searchable Activity tab

As a PM, I want to search the whole audit trail, so that I can find who changed what.

**Given** the Activity tab **When** I search or filter by action and actor **Then** results are grouped by day with "Load older" paging.

## Epic 10: Shared design system

(FR-14)

### Story 10.1: Tokens and themes

As a user, I want readable light and dark themes in both apps, so that the UI is accessible.

**Given** any text/background pair used **When** `contrast.test.ts` runs **Then** it meets 4.5:1 (icons 3:1) in both themes **And** the storefront's theme is driven by the `dark-mode` flag.

## Epic 11: Browser QA

### Story 11.1: Automated top 25 cases

As a maintainer, I want the 25 most important cases run in a real browser with evidence, so that demos are trustworthy.

**Given** the `ff-qa` stack reset to seed data **When** `qa/run.mjs` runs **Then** all 25 pass with video, screenshots and `qa/results/REPORT.md` (run 1 found the Discard bug, fixed in c94556e).

## Epic 12: Attribute targeting rules

Product managers target users by any attribute (country, plan…) being in or not in a list, from the dashboard, the API and agents, and the demo shows it working. Contract: `_bmad-output/specs/spec-attribute-rules/SPEC.md` (CAP-1 – CAP-5) and its architecture spine (AD-12 – AD-16, inheriting AD-1 – AD-11). Stories run in order; each ends with `./test.sh` green.

### Story 12.1: Engine attribute rule

As an engineer,
I want an engine rule that matches on an attribute being in or not in a list,
So that targeting by any context attribute needs no change to the evaluator.

**Acceptance Criteria:**

**Given** `AttributeIn("country", IN, {US, CA})` **When** evaluated for country US, CA, DE and no country **Then** it matches US and CA only
**And** `AttributeIn("country", NOT_IN, {US})` matches DE but not US, not a blank value and not a missing attribute (AD-12)
**And** a blank name, empty values or a blank value is rejected by the constructor
**And** `Evaluator`, `EvaluationContext` and the enforcer rule are unchanged, and the tests were written first and seen failing (AD-1, AD-2)

### Story 12.2: Attribute rules in the admin API and evaluation

As an editor,
I want to save attribute rules through the API and have evaluation honour them,
So that flags can target by attribute in each environment.

**Acceptance Criteria:**

**Given** a valid `{"type":"attribute","attribute":"country","operator":"in","values":["US","CA"]}` rule **When** I save it in dev as an editor **Then** it is stored, the audit summary reads "added rule: country in US, CA", and `/api/evaluate` returns the expected values with `ruleType: "attribute"` (AD-13)
**And** a missing operator, a name not matching `AttributeNames.PATTERN`, no values or a malformed value returns 400 problem+json naming the field, e.g. `rules[0].values[1]` (AD-14)
**And** `EvaluateApiTest.responseContainsResultsOnlyNeverRules` passes with an attribute rule present (AD-6)
**And** an unknown operator (e.g. `"equals"`, `"not in"` with a space) returns 400 naming `rules[0].operator`, and a value with surrounding spaces (e.g. `" US"`) returns 400 naming the value
**And** flags saved before this change (users, customers and percent rules already in `flag_environment.rules`) still load, evaluate and save unchanged
**And** the role matrix is unchanged: the same rule in prod is 403 for an editor
**And** before any backend code changes, `docs/plan.md` records the new rule type and its JSON shape (AGENTS.md: API changes go into the plan first); the user approved the API change in SPEC-attribute-rules

### Story 12.3: Attribute rules for agents over MCP

As an agent operator,
I want `set_flag_rules` to accept attribute rules,
So that agents can do everything the dashboard can.

**Acceptance Criteria:**

**Given** an editor API key **When** an agent sets an attribute rule in dev **Then** it succeeds with the same audit as the dashboard, and in prod it is denied
**And** the `set_flag_rules` input schema and unknown-type message include `attribute`, built from the shared constants (AD-14)
**And** a malformed attribute name or value over MCP is rejected with the same field path and message as the REST API (e.g. `rules[0].values[1]`)
**And** a new test fails if any `RuleSpec` `@JsonSubTypes` name is missing from the schema or the message (AD-15)

### Story 12.4: Attribute rules in the admin dashboard

As a product manager,
I want to add and read attribute rules in the rule editor,
So that I can release by country without asking an engineer.

**Acceptance Criteria:**

**Given** the dev rules of a flag **When** I add a rule, enter `country`, pick "is one of" and add US and CA, then save **Then** it is saved and the row reads "On for users with country US or CA" (AD-16)
**And** "is not one of" US reads "users whose country isn't US", and more than two values read "users with country in N values"
**And** an attribute rule can be edited (name, operator, values) and moved up or down among other rules like existing rule types, and the saved order is what evaluation uses
**And** a malformed name or value is rejected inline like ID chips, and Discard clears it
**And** controls have accessible names "Rule N attribute name" and "Rule N values"; existing labels are unchanged so `qa/run.mjs` still passes; `audience.test.ts` and `rules.test.ts` cover the new type

### Story 12.5: Demo storefront shows attribute targeting

As a demo viewer,
I want to see a flag targeted by country,
So that the feature is visible end to end.

**Acceptance Criteria:**

**Given** migration `V5__` seeds `free-shipping` ("Free shipping for Canada") with `country in [CA]` enabled in prod, Otherwise OFF, and in dev enabled with no rules and Otherwise ON, like the other seed flags **When** I view the storefront as Ben (CA) **Then** the free-shipping block shows and the debug panel says "matched rule 1 (attribute)"
**And** Ana and Cy (US), Dee (DE), Eli and the anonymous visitor (no country) don't see it
**And** existing storefront behaviour for the other flags is unchanged, and the top 25 QA cases still pass
**And** README (rule types, assumptions, API) and the PRD (FR-4, FR-7) describe the new rule type
