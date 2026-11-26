---
title: Feature Flag Service
created: 2026-11-13
updated: 2026-11-26
status: final
provenance: backfilled
---

# PRD: Feature Flag Service

## 0. Document Purpose

This PRD was backfilled on 2026-11-25 for a product that was already built, as part of moving the repo onto the BMAD method. It records the requirements the shipped code satisfies, so new work (epics, stories, `bmad-build` runs) can reference stable FR numbers. It does not replace `docs/plan.md`, which stays the design source of truth; the architecture lives in `architecture.md` next to this file. The original brief is a PDF kept out of the repo, so its must-haves are reconstructed from README → "What's built". Assumptions refer to README → Assumptions by number (A-1 … A-20) instead of copying them.

## 1. Vision

A small internal feature-flag and progressive-rollout service, much like a minimal LaunchDarkly. Product managers turn features on for specific users, specific customers or a percentage of users, separately in dev and prod, and can always see who gets a feature and who changed it. Applications ask the service whether a flag is on for a user and get the same answer every time.

Two things are fixed: the evaluation engine is plain Java with no framework dependencies so it can be tested in isolation, and percentage rollouts are deterministic per user. Since the first build, AI agents have become first-class users through an MCP server that can do everything the dashboard can.

## 2. Target User

### 2.1 Jobs To Be Done

- As a product manager, release a feature to a chosen audience and widen it gradually without a deploy.
- As a product manager, know at a glance whether a feature is live in prod and for whom, in plain words.
- As an engineer, gate code paths behind flags and get a fast, safe answer even when the service is down.
- As a team lead, keep prod changes restricted and every change attributable.
- As an AI agent operator, let an agent inspect and change flags with the same rules and audit as a person.

### 2.2 Non-Users (v1)

- External customers: there is no customer-facing flag UI.
- Server-side SDK consumers that evaluate locally (see Non-Goals).

### 2.3 Key User Journeys

- **UJ-1. A PM widens a rollout.** Signed in as admin, the PM expands `dark-mode`, changes the prod rollout 25% → 100% and saves; the storefront picks it up with no refresh, and the history reads "admin · prod · rollout 25% → 100%".
- **UJ-2. An editor is stopped at prod.** Signed in as editor, the prod switches are locked; dev is editable. A direct API call to change prod returns 403.
- **UJ-3. A shopper sees the right storefront.** Viewing as Ben (customer acme) shows the new dashboard via rule 1; Dee gets it via the % rollout; Eli matches nothing and sees the classic page. The debug panel says why for each.
- **UJ-4. The flag service goes down.** The storefront keeps its last known flags, marked stale, even across a reload; with nothing cached it renders everything OFF and says so.
- **UJ-5. An agent turns a flag on.** An MCP client with an editor key lists flags, sets dev rules and enables the flag in dev; the audit names the key as actor. An attempt on prod is denied exactly as for a human editor.

## 3. Glossary

- **Flag** — a boolean feature switch with an immutable key and an editable description. Has one Flag Environment per Environment.
- **Environment** — `dev` or `prod` (exactly two, A-9).
- **Flag Environment** — a Flag's state in one Environment: enabled, ordered Rules, Otherwise value, version.
- **Rule** — a targeting condition that serves a value when it matches: user-ID list, customer list, or Percentage Rollout.
- **Percentage Rollout** — a Rule matching users whose Bucket is below the percentage.
- **Bucket** — a user's fixed position (0–9 999) for a Flag, from murmur3 of `flagKey:userId`.
- **Otherwise** — the value served when the Flag is enabled and no Rule matches (default OFF).
- **Evaluation** — computing a Flag's value and Reason for an Evaluation Context.
- **Evaluation Context** — a `userId` plus open-ended attributes (e.g. `customer`).
- **Reason** — why an Evaluation returned its value: FLAG_OFF, RULE_MATCH, OTHERWISE, FLAG_NOT_FOUND.
- **Role** — ADMIN, EDITOR or VIEWER; decides what a User or API Key may change.
- **Audit Event** — a record of one change: actor, Flag, Environment, plain-words summary, before/after.
- **SDK Key** — a public per-Environment key used to call Evaluation; decides the Environment.
- **API Key** — a secret key for agents on `/mcp`, acting as one fixed Role.
- **Seen Context** — a user or customer ID the service has evaluated, with first/last seen.

## 4. Features

### 4.1 Flags and Environments

**Description:** Users with the right Role create, describe and delete Flags. Each Flag has independent state per Environment. Realizes UJ-1.

#### FR-1: Create and describe flags
An ADMIN or EDITOR can create a Flag with a key and description, and edit the description.
**Consequences (testable):**
- Key must match `^[a-z0-9][a-z0-9-]{0,62}$`; otherwise 400 problem+json naming the field.
- Creating a Flag creates one disabled Flag Environment per Environment.
- The key can't be changed after creation (A-5).

#### FR-2: Delete flags
An ADMIN can delete a Flag permanently; its Audit Events survive (A-6).

#### FR-3: Toggle per environment
A permitted User can enable or disable a Flag in one Environment without affecting the other.
**Consequences (testable):**
- A stale `version` returns 409; nothing is overwritten silently.
- A no-op change is accepted without bumping the version or writing an Audit Event (A-10).

### 4.2 Targeting and Evaluation

**Description:** Rules run top to bottom and the first match wins; if none match, Otherwise applies. Realizes UJ-3.

#### FR-4: Edit ordered rules
A permitted User can add, remove and reorder Rules and set Otherwise, saved whole per Flag Environment and guarded by `version`.
**Consequences (testable):**
- User and customer IDs are validated (letters, digits, `_ . : @ -`, max 128); a bad one is a 400 naming e.g. `rules[0].userIds[1]` (A-18).
- Percent is 0–100.
- An attribute rule (added in Epic 12) needs `operator` `in` or `not_in`, a lowercase attribute name (`^[a-z][a-z0-9_]{0,63}$`, A-19) and at least one value in the ID format; a bad field is a 400 naming e.g. `rules[0].operator` or `rules[0].values[1]`.

#### FR-5: Deterministic evaluation
The service evaluates Flags for an Evaluation Context with the semantics above.
**Consequences (testable):**
- Disabled → `false`, FLAG_OFF. Unknown key → `false`, FLAG_NOT_FOUND, HTTP 200.
- The same (Flag, user) always gets the same answer, in every Environment and on every server (A-4).
- Raising a rollout keeps everyone already in it (monotonic); flags bucket independently; no `userId` skips Percentage Rollouts (A-3).
- 100k users land within ±1% of the target at 10/25/50%.

#### FR-6: Results-only evaluation API
Clients call `/api/evaluate` with an SDK Key, which decides the Environment (A-13), and get values and Reasons only.
**Consequences (testable):**
- Responses never contain Rules or targeting lists; they may name the matched rule's position and kind (A-14).

#### FR-7: Extensible targeting
A new Rule type or context attribute can be added without changing the evaluator, mapper or Evaluation Context.
**Consequences (testable):**
- Epic 12 added the attribute rule this way: a context attribute (e.g. `country`) in or not in a list of values, exact and case-sensitive; an absent or blank attribute never matches. Evaluation reports its kind as `attribute`, never the name or values. The seeded `free-shipping` flag (`country in [CA]` in prod) shows it on the demo storefront.

### 4.3 Access Control and Audit

**Description:** The server enforces Roles; every change is attributable. Realizes UJ-2.

#### FR-8: Role-based access
The server allows actions per the role matrix in `docs/plan.md` → Auth and roles: all Roles read; EDITOR changes dev only and can't delete; ADMIN does everything (A-7).
**Consequences (testable):**
- A denied action returns 403 problem+json, whatever the UI shows.
- The UI's enabled controls come from the server's `can`, and can't drift from enforcement.

#### FR-9: Audit trail
Every change writes an Audit Event in the same transaction, with the logged-in User or API Key as actor and a plain-words summary ("rollout 5% → 10%").

#### FR-10: Search activity
Any signed-in User can search the whole audit trail by text, action and actor, newest first, with paging.

### 4.4 Admin Dashboard

**Description:** A dashboard for product managers rather than a system of record. Realizes UJ-1, UJ-2.

#### FR-11: Flag list for product managers
Each Flag is an expandable row leading with Live / Partial / Off in prod (icon + word) and a plain-English audience sentence.

#### FR-12: Safe prod changes
Prod changes ask for confirmation first and say who will be affected.

#### FR-13: ID suggestions and warnings
The rule editor suggests Seen Context IDs and warns, without blocking, when an ID has never been seen.

#### FR-14: Accessible themes
Light, dark and system themes; every text/background pair meets 4.5:1 contrast (icons 3:1) in both themes.

### 4.5 Demo Storefront and SDK

**Description:** A mock storefront that reads Flags only through the TypeScript SDK. Realizes UJ-3, UJ-4.

#### FR-15: Storefront with debug panel
The storefront evaluates all Flags before first render, has a "Viewing as" switcher and a Dev/Prod switch, and shows each Flag's value and Reason.

#### FR-16: Live updates
Changes reach connected clients over server-sent events after commit, without a refresh; clients reconnect and catch up after outages (A-16).

#### FR-17: Resilient SDK
`isEnabled(flag, user)` answers from cache, refreshed by polling and the live stream; during an outage it keeps the last known values, even across a reload, otherwise everything OFF (A-15).

### 4.6 Agents (MCP)

**Description:** Agents get the dashboard's capabilities with the same rules. Realizes UJ-5.

#### FR-18: MCP tools
`/mcp` exposes a tool for every dashboard action, calling the same services and returning the same views.

#### FR-19: API keys
An ADMIN can issue, list and revoke API Keys, each a fixed Role with optional expiry; a key is shown once, stored hashed, authenticates only on `/mcp`, and can't manage keys (A-17).

## 5. Non-Goals (Explicit)

- Server-side local evaluation (rules leaving the service).
- Operators beyond `in` / `not in`, combining attributes in one rule, and an attribute-name registry (attribute rules themselves shipped in Epic 12, FR-7).
- More than two Environments; environment management.
- User management; users are seeded.
- Multi-instance scale-out.
- Experimentation or analytics (A/B metrics, exposure tracking).

## 6. MVP Scope

### 6.1 In Scope
All of §4. Must-haves from the brief: FR-1, FR-3, FR-4, FR-5, FR-9, FR-11 (list, toggle, edit), FR-15, and engine unit tests. Stretch items delivered: FR-8, FR-16, FR-17. Added after the plan: FR-10, FR-13, FR-14, FR-18, FR-19, and attribute rules under FR-4 and FR-7 (Epic 12).

### 6.2 Out of Scope for MVP
See README → "What's missing": a server SDK, scale-out, MCP OAuth and rate limits, production hardening (secrets, login rate limiting, CI, durable sessions).

## 7. Success Metrics

- **SM-1**: Rollout determinism — golden bucket vectors and the monotonicity/distribution tests stay green. Validates FR-5.
- **SM-2**: Authorization correctness — every role-matrix cell has a passing API test. Validates FR-8.
- **SM-3**: Demo flow — the top 25 QA cases pass in a real browser. Validates FR-11 – FR-17.
- **SM-C1**: Test count — don't optimize; a test that can't fail adds nothing. Counterbalances SM-1 – SM-3.

## 8. Open Questions

1. The backend test JVM sometimes takes ~30 s to exit after tests pass; cause not diagnosed.
2. Why MockMvc `csrf()` makes the XSRF cookie disappear in the shared context; trigger confirmed, cause not explained.
3. CI for the QA runner. (`./test.sh` runs in GitHub Actions since the BMAD pilot, phase 3.)

## 9. Assumptions Index

README → Assumptions A-1 … A-18 are the confirmed decisions behind this PRD; `docs/plan.md` → "Decisions on unclear points in the brief" holds the original nine.
