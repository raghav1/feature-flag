# QA: top 25 test cases

The 25 most important cases from the full [QA test plan](qa-test-plan.md), all P0. They were picked to cover what the service promises: roles enforced on the server, safe prod changes, no lost updates, deterministic rollouts, a storefront that never flickers and survives outages, and agents held to the same rules as people.

**Latest execution: 25 of 25 passed.** Report, screenshots and video in [qa/results/REPORT.md](../qa/results/REPORT.md); the runner is [qa/run.mjs](../qa/run.mjs).

Start from seed data (`docker compose down -v`, then `docker compose up --build`). Logins are in the README. Expected per-user results are in the plan, §2.

| Area | Cases |
|---|---|
| Admin dashboard | 8 |
| Demo storefront | 7 |
| MCP (agents) | 7 |
| End-to-end | 3 |

## Admin dashboard

| # | ID | Test | Expected |
|---|---|---|---|
| 1 | ADM-ROLE-01 | Sign in as **viewer** and visit every page | All switches, rule controls, New flag, edit and Delete are disabled or absent, with a note saying why; no API keys tab |
| 2 | ADM-LIST-02 | Read the flags list on seed data | Plain-English status: `new-dashboard` "On for users u_102 and u_207, customer acme and 10% of users" (Partial); `beta-reports` "On for customer acme" (Partial); `dark-mode` "Off for everyone" (Off) |
| 3 | ADM-TOG-02 | As admin, flip a **prod** switch | A confirm dialog says who will be affected before anything changes; nothing changes until confirmed |
| 4 | ADM-RULE-03 | Type a user ID into a rule and click Save **without** pressing Enter | The typed ID is saved too |
| 5 | ADM-RULE-04 | Type `bad id!` as a user ID | Marked invalid with a message naming it and the allowed characters; Save disabled |
| 6 | ADM-RULE-14 | Two admins edit the same prod rules; A saves, then B saves | B is told "Someone else changed these rules while you were editing" and offered Discard; B's save isn't silently applied |
| 7 | ADM-ACT-02 | Activity tab: search "rollout" | Server-side search across all history; matches highlighted; entries read like "admin · prod · rollout 10% → 20%" |
| 8 | ADM-KEY-01 | As admin, create an API key | Token shown **once** with copy buttons and ready-to-paste client config; never shown again after reload |

## Demo storefront

| # | ID | Test | Expected |
|---|---|---|---|
| 9 | DEMO-LOAD-01 | Throttle the network to Slow 3G and hard-reload | The first paint is already correct: never the classic home flipping to the new dashboard |
| 10 | DEMO-USER-01 | In prod, pick each user under **Viewing as** | Storefront and debug panel match the expected table: e.g. Ben ON via rule 1, Dee ON via the 10% rollout, Eli and Anonymous get the classic home |
| 11 | DEMO-ENV-02 | Switch to **Dev** | Every flag ON and the store turns dark because the `dark-mode` flag is ON, in the same palette as the admin's dark theme |
| 12 | DEMO-DBG-04 | Inspect the `/api/evaluate` response in the network tab | Only value, reason and rule position/type per flag; **no** user lists, customer lists or percentages |
| 13 | DEMO-LIVE-01 | Demo in prod as Eli; in the admin, add u_412 to `new-dashboard` rule 1 | Within seconds, with no reload, Eli gets the new dashboard and the panel says rule 1 |
| 14 | DEMO-OUT-01 | Stop the backend (`docker compose stop backend`) | A banner says the last known flags are being shown; the storefront doesn't change or break |
| 15 | DEMO-OUT-03 | Backend still down: clear site data and reload | Red banner "every feature is OFF"; classic home; nothing crashes. After `docker compose start backend` it recovers on its own |

## MCP (agents)

| # | ID | Test | Expected |
|---|---|---|---|
| 16 | MCP-AUTH-05 | Revoke a key in the admin, then call any tool with it | 401 on the very next request |
| 17 | MCP-SEC-01 | Use an **admin** key against `/api/keys` | Rejected: keys work only on `/mcp` and no tool manages keys, so an agent can never mint or revoke keys |
| 18 | MCP-ROLE-03 | **Editor** key: `set_flag_enabled` on prod | `isError`, "… (editor) may not change prod."; nothing changes |
| 19 | MCP-CHG-04 | Admin key: `set_flag_enabled` with an old `version` | "… changed since you loaded version N … Reload and try again."; nothing overwritten |
| 20 | MCP-CHG-06 | Admin key: `set_flag_rules` with an invalid ID, percent 101, or an empty list | One clear message naming the field, e.g. `rules[0].userIds[0]` |
| 21 | MCP-AUD-01 | After agent changes, open Activity → Who: Agents | Every change listed as `key:<name>` with a key avatar and a plain-words summary |
| 22 | MCP-AGT-01 | In Claude Code: "Roll out new-dashboard in prod to 20%." | The agent reads the flag, updates the % rule with the current version and reports back; audit says "rollout 10% → 20%"; the storefront updates live |

## End-to-end

| # | ID | Test | Expected |
|---|---|---|---|
| 23 | E2E-02 | Progressive rollout: create `qa-banner`, then prod 10% → 50% → 100% | The set of demo users who have it only grows: nobody who had it loses it; the audit tells the story in order |
| 24 | E2E-03 | Kill switch: turn a prod flag at 100% OFF | Every demo user loses it live; debug says "flag is OFF in prod"; rules are kept for when it's turned back on |
| 25 | E2E-04 | Editor tries to change prod three ways: the UI, a direct API call, an MCP editor key | All three refused; prod unchanged; no audit entry |

Clean up afterwards: delete `qa-…` flags and revoke `qa-…` API keys (plan §11).
