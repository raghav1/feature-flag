# QA execution report: top 25 test cases

**Result: 25 of 25 passed.** Run finished 2026-11-14 21:34 UTC on build `c94556e`.

The 25 cases come from [docs/qa-top-25.md](../../docs/qa-top-25.md). Each was executed in Chromium by [qa/run.mjs](../run.mjs) against a
separate copy of the stack (compose project `ff-qa`, ports 6173/6174), reset to seed data before the run. Every case was
recorded; the clips are joined in **[qa-run.mp4](qa-run.mp4)** (2:28), where a caption bar shows the case, the current step and the
verdict. Screenshots are in [screenshots/](screenshots/).

| Area | Passed |
|---|---|
| Admin | 8 / 8 |
| Storefront | 7 / 7 |
| MCP | 7 / 7 |
| End-to-end | 3 / 3 |
| **Total** | **25 / 25** |

## Results

| # | ID | Test | Result | Video | Evidence |
|---|---|---|---|---|---|
| 1 | [ADM-ROLE-01](#1-adm-role-01) | Viewer is read-only everywhere | ✅ PASS | 0:04 | 2 screenshots |
| 2 | [ADM-LIST-02](#2-adm-list-02) | Flags list says who gets each flag in plain English | ✅ PASS | 0:06 | 1 screenshot |
| 3 | [ADM-TOG-02](#3-adm-tog-02) | A prod switch asks first and says who is affected | ✅ PASS | 0:08 | 2 screenshots |
| 4 | [ADM-RULE-03](#4-adm-rule-03) | A typed ID is saved even without pressing Enter | ✅ PASS | 0:12 | 1 screenshot |
| 5 | [ADM-RULE-04](#5-adm-rule-04) | A malformed ID is blocked with a clear message | ✅ PASS | 0:14 | 1 screenshot |
| 6 | [ADM-RULE-14](#6-adm-rule-14) | Two admins edit the same rules: no silent overwrite | ✅ PASS | 0:17 | 1 screenshot |
| 7 | [ADM-ACT-02](#7-adm-act-02) | Activity search finds changes across all history | ✅ PASS | 0:25 | 1 screenshot |
| 8 | [ADM-KEY-01](#8-adm-key-01) | A new API key's token is shown once only | ✅ PASS | 0:27 | 2 screenshots |
| 9 | [DEMO-LOAD-01](#9-demo-load-01) | No flicker on first load, even on slow 3G | ✅ PASS | 0:30 | 1 screenshot |
| 10 | [DEMO-USER-01](#10-demo-user-01) | Each demo user gets exactly the expected flags | ✅ PASS | 0:42 | 6 screenshots |
| 11 | [DEMO-ENV-02](#11-demo-env-02) | Dev turns the store dark via the dark-mode flag | ✅ PASS | 0:45 | 1 screenshot |
| 12 | [DEMO-DBG-04](#12-demo-dbg-04) | The evaluate API returns results only, never rules | ✅ PASS | 0:47 | 2 screenshots |
| 13 | [DEMO-LIVE-01](#13-demo-live-01) | An admin change reaches the storefront without a reload | ✅ PASS | 0:48 | 2 screenshots |
| 14 | [DEMO-OUT-01](#14-demo-out-01) | Backend down: the store keeps its last known flags | ✅ PASS | 0:51 | 1 screenshot |
| 15 | [DEMO-OUT-03](#15-demo-out-03) | Nothing cached and backend down: all OFF, then recovers | ✅ PASS | 1:22 | 2 screenshots |
| 16 | [MCP-AUTH-05](#16-mcp-auth-05) | A revoked key fails on the very next call | ✅ PASS | 1:53 | 2 screenshots |
| 17 | [MCP-SEC-01](#17-mcp-sec-01) | Even an admin key can't manage keys | ✅ PASS | 1:56 | 1 screenshot |
| 18 | [MCP-ROLE-03](#18-mcp-role-03) | An editor key can't change prod | ✅ PASS | 1:57 | 1 screenshot |
| 19 | [MCP-CHG-04](#19-mcp-chg-04) | A stale version is a conflict, not an overwrite | ✅ PASS | 1:59 | 1 screenshot |
| 20 | [MCP-CHG-06](#20-mcp-chg-06) | Bad rules get one clear message naming the field | ✅ PASS | 2:00 | 1 screenshot |
| 21 | [MCP-AUD-01](#21-mcp-aud-01) | Agent changes are in the audit log as key:&lt;name> | ✅ PASS | 2:01 | 1 screenshot |
| 22 | [MCP-AGT-01](#22-mcp-agt-01) | Agent rolls new-dashboard in prod out to 20% | ✅ PASS | 2:04 | 2 screenshots |
| 23 | [E2E-02](#23-e2e-02) | Progressive rollout 10% → 50% → 100% only ever adds users | ✅ PASS | 2:06 | 4 screenshots |
| 24 | [E2E-03](#24-e2e-03) | Kill switch: turning a prod flag off removes it for everyone, live | ✅ PASS | 2:16 | 2 screenshots |
| 25 | [E2E-04](#25-e2e-04) | Editor can't change prod: UI, API or MCP | ✅ PASS | 2:20 | 2 screenshots |

## Run history: what failed and what was fixed

Three full runs, each from fresh seed data. Logs: [run-1.log](run-1.log), [run-2.log](run-2.log), [run-3.log](run-3.log).

| Run | Result | What happened |
|---|---|---|
| 1 | 16 / 25 | 1 product bug, 8 failures from one runner bug (below) |
| 2 | 25 / 25 | After the product fix and the runner fix |
| 3 | 25 / 25 | Final run, recorded here: evidence framing improved, no product change |

**Product bug found and fixed**

- **ADM-RULE-04: Discard stayed disabled after typing a malformed ID.** With only rejected text in an ID box (`bad#id`), no rule had changed, so the editor treated the draft as clean: Save was correctly blocked, but Discard was greyed out too, and the only way out was deleting the text by hand. Fixed in commit `c94556e`: Discard is enabled whenever a box holds rejected text (`hasRejectedText`, with a unit test). Re-run: pass.

**Runner problems (not product bugs), fixed in the runner**

- **8 cases (MCP-AUTH-05 to E2E-04) failed with 401 after the outage tests.** The outage cases restart the backend, and dashboard sessions live in the backend's memory, so the runner's setup session ended (expected behaviour; see the QA plan, E2E-06). The MCP calls themselves had worked. The runner's API helper now signs in again on a 401.
- **The first reset tried to bind the default ports**, which the developer's own stack was using; the runner's `docker compose` calls now always pass the QA ports.
- **Timing notes said "0.0 s"** for live updates because the clock started after the click had already finished. It now starts before the click (live updates measured at 0.2–0.3 s).
- **The proof was below the fold** in the side-by-side screenshots: the runner now scrolls the storefront's debug row into view, and evidence pages are captured at full length.

**How the cases were executed**

- MCP-AGT-01 is driven by the exact MCP tool calls an agent makes (`get_flag`, `set_flag_rules`, `get_audit_log`) from a script; no LLM was in the loop.
- API tokens are blurred in recordings and screenshots, and every key created for the run was revoked at the end.
- E2E-02 measures the rollout with 400 synthetic user IDs through `/api/evaluate`; DEMO-LOAD-01 throttles the network to 2 s latency and 400 kbit/s.

## Details

### Admin

<a id="1-adm-role-01"></a>

#### 1. ADM-ROLE-01: Viewer is read-only everywhere

- **Result:** ✅ PASS in 2.9 s; in the video at 0:04
- **Expected:** No New flag, edit, delete, API keys; switches disabled; read-only notes say why

![ADM-ROLE-01 01-ADM-ROLE-01-list.png](screenshots/01-ADM-ROLE-01-list.png)

![ADM-ROLE-01 01-ADM-ROLE-01-expanded.png](screenshots/01-ADM-ROLE-01-expanded.png)

<a id="2-adm-list-02"></a>

#### 2. ADM-LIST-02: Flags list says who gets each flag in plain English

- **Result:** ✅ PASS in 2.0 s; in the video at 0:06
- **Expected:** Partial/Partial/Off in prod with the seed audience sentences

![ADM-LIST-02 02-ADM-LIST-02-list.png](screenshots/02-ADM-LIST-02-list.png)

<a id="3-adm-tog-02"></a>

#### 3. ADM-TOG-02: A prod switch asks first and says who is affected

- **Result:** ✅ PASS in 3.2 s; in the video at 0:08
- **Expected:** Dialog before any change; Cancel changes nothing; Confirm turns it on

![ADM-TOG-02 03-ADM-TOG-02-dialog.png](screenshots/03-ADM-TOG-02-dialog.png)

![ADM-TOG-02 03-ADM-TOG-02-on.png](screenshots/03-ADM-TOG-02-on.png)

<a id="4-adm-rule-03"></a>

#### 4. ADM-RULE-03: A typed ID is saved even without pressing Enter

- **Result:** ✅ PASS in 2.5 s; in the video at 0:12
- **Expected:** u_501 saved into prod rule 1
- **Observed:** Server rule 1 after save: u_102, u_207, u_501

![ADM-RULE-03 04-ADM-RULE-03-saved.png](screenshots/04-ADM-RULE-03-saved.png)

<a id="5-adm-rule-04"></a>

#### 5. ADM-RULE-04: A malformed ID is blocked with a clear message

- **Result:** ✅ PASS in 2.7 s; in the video at 0:14
- **Expected:** bad#id stays in the box, message names it, Save disabled

![ADM-RULE-04 05-ADM-RULE-04-blocked.png](screenshots/05-ADM-RULE-04-blocked.png)

<a id="6-adm-rule-14"></a>

#### 6. ADM-RULE-14: Two admins edit the same rules: no silent overwrite

- **Result:** ✅ PASS in 4.0 s; in the video at 0:17
- **Expected:** B is told someone else changed them; A's change stands
- **Observed:** Server kept A's rules: customers acme, globex

![ADM-RULE-14 06-ADM-RULE-14-conflict.png](screenshots/06-ADM-RULE-14-conflict.png)

<a id="7-adm-act-02"></a>

#### 7. ADM-ACT-02: Activity search finds changes across all history

- **Result:** ✅ PASS in 2.5 s; in the video at 0:25
- **Expected:** "rollout" finds "rollout 10% → 20%", highlighted, (all matches)
- **Observed:** 2 matching changes, all containing "rollout"

![ADM-ACT-02 07-ADM-ACT-02-search.png](screenshots/07-ADM-ACT-02-search.png)

<a id="8-adm-key-01"></a>

#### 8. ADM-KEY-01: A new API key's token is shown once only

- **Result:** ✅ PASS in 3.0 s; in the video at 0:27
- **Expected:** Token + client config shown once; gone after reload
- **Observed:** Token blurred in the recording and screenshots.

![ADM-KEY-01 08-ADM-KEY-01-shown-once.png](screenshots/08-ADM-KEY-01-shown-once.png)

![ADM-KEY-01 08-ADM-KEY-01-after-reload.png](screenshots/08-ADM-KEY-01-after-reload.png)

### Storefront

<a id="9-demo-load-01"></a>

#### 9. DEMO-LOAD-01: No flicker on first load, even on slow 3G

- **Result:** ✅ PASS in 12.3 s; in the video at 0:30
- **Expected:** First paint is already the new dashboard; classic home never appears
- **Observed:** Loaded in 10.8 s throttled; storefront blocks seen in order: new-dashboard, beta-reports

![DEMO-LOAD-01 09-DEMO-LOAD-01-first-paint.png](screenshots/09-DEMO-LOAD-01-first-paint.png)

<a id="10-demo-user-01"></a>

#### 10. DEMO-USER-01: Each demo user gets exactly the expected flags

- **Result:** ✅ PASS in 2.7 s; in the video at 0:42
- **Expected:** All six users match the prod oracle (storefront + debug reasons)

![DEMO-USER-01 10-DEMO-USER-01-ana.png](screenshots/10-DEMO-USER-01-ana.png)

![DEMO-USER-01 10-DEMO-USER-01-ben.png](screenshots/10-DEMO-USER-01-ben.png)

![DEMO-USER-01 10-DEMO-USER-01-cy.png](screenshots/10-DEMO-USER-01-cy.png)

![DEMO-USER-01 10-DEMO-USER-01-dee.png](screenshots/10-DEMO-USER-01-dee.png)

![DEMO-USER-01 10-DEMO-USER-01-eli.png](screenshots/10-DEMO-USER-01-eli.png)

![DEMO-USER-01 10-DEMO-USER-01-anonymous.png](screenshots/10-DEMO-USER-01-anonymous.png)

<a id="11-demo-env-02"></a>

#### 11. DEMO-ENV-02: Dev turns the store dark via the dark-mode flag

- **Result:** ✅ PASS in 1.8 s; in the video at 0:45
- **Expected:** All flags ON (Otherwise ON); data-theme=dark; admin's dark palette
- **Observed:** Dark background rgb(21, 27, 35) = shared token --canvas-subtle #151b23

![DEMO-ENV-02 11-DEMO-ENV-02-dev-dark.png](screenshots/11-DEMO-ENV-02-dev-dark.png)

<a id="12-demo-dbg-04"></a>

#### 12. DEMO-DBG-04: The evaluate API returns results only, never rules

- **Result:** ✅ PASS in 1.5 s; in the video at 0:47
- **Expected:** Only value/reason/ruleIndex/ruleType; no IDs, lists or percentages

![DEMO-DBG-04 12-DEMO-DBG-04-storefront.png](screenshots/12-DEMO-DBG-04-storefront.png)

![DEMO-DBG-04 12-DEMO-DBG-04-response.png](screenshots/12-DEMO-DBG-04-response.png)

<a id="13-demo-live-01"></a>

#### 13. DEMO-LIVE-01: An admin change reaches the storefront without a reload

- **Result:** ✅ PASS in 3.4 s; in the video at 0:48
- **Expected:** Eli gets the new dashboard within seconds of the save
- **Observed:** Storefront updated 0.3 s after Save, with no reload

![DEMO-LIVE-01 13-DEMO-LIVE-01-before-save.png](screenshots/13-DEMO-LIVE-01-before-save.png)

![DEMO-LIVE-01 13-DEMO-LIVE-01-after-save.png](screenshots/13-DEMO-LIVE-01-after-save.png)

<a id="14-demo-out-01"></a>

#### 14. DEMO-OUT-01: Backend down: the store keeps its last known flags

- **Result:** ✅ PASS in 31.9 s; in the video at 0:51
- **Expected:** Stale banner; storefront unchanged
- **Observed:** Stale banner appeared 29 s after the backend stopped, without user action

![DEMO-OUT-01 14-DEMO-OUT-01-stale.png](screenshots/14-DEMO-OUT-01-stale.png)

<a id="15-demo-out-03"></a>

#### 15. DEMO-OUT-03: Nothing cached and backend down: all OFF, then recovers

- **Result:** ✅ PASS in 34.1 s; in the video at 1:22
- **Expected:** Red banner, classic home, no crash; recovers by itself after restart
- **Observed:** Recovered on its own 26 s after the backend was healthy

![DEMO-OUT-03 15-DEMO-OUT-03-unavailable.png](screenshots/15-DEMO-OUT-03-unavailable.png)

![DEMO-OUT-03 15-DEMO-OUT-03-recovered.png](screenshots/15-DEMO-OUT-03-recovered.png)

### MCP

<a id="16-mcp-auth-05"></a>

#### 16. MCP-AUTH-05: A revoked key fails on the very next call

- **Result:** ✅ PASS in 3.1 s; in the video at 1:53
- **Expected:** whoami works, revoke in the admin, next call is 401

![MCP-AUTH-05 16-MCP-AUTH-05-revoked.png](screenshots/16-MCP-AUTH-05-revoked.png)

![MCP-AUTH-05 16-MCP-AUTH-05-evidence.png](screenshots/16-MCP-AUTH-05-evidence.png)

<a id="17-mcp-sec-01"></a>

#### 17. MCP-SEC-01: Even an admin key can't manage keys

- **Result:** ✅ PASS in 1.5 s; in the video at 1:56
- **Expected:** /api/keys rejects the key; no MCP tool manages keys

![MCP-SEC-01 17-MCP-SEC-01-evidence.png](screenshots/17-MCP-SEC-01-evidence.png)

<a id="18-mcp-role-03"></a>

#### 18. MCP-ROLE-03: An editor key can't change prod

- **Result:** ✅ PASS in 1.5 s; in the video at 1:57
- **Expected:** set_flag_enabled on prod is refused with a plain message; nothing changes

![MCP-ROLE-03 18-MCP-ROLE-03-evidence.png](screenshots/18-MCP-ROLE-03-evidence.png)

<a id="19-mcp-chg-04"></a>

#### 19. MCP-CHG-04: A stale version is a conflict, not an overwrite

- **Result:** ✅ PASS in 1.7 s; in the video at 1:59
- **Expected:** Second write with the old version is refused; first write stands

![MCP-CHG-04 19-MCP-CHG-04-evidence.png](screenshots/19-MCP-CHG-04-evidence.png)

<a id="20-mcp-chg-06"></a>

#### 20. MCP-CHG-06: Bad rules get one clear message naming the field

- **Result:** ✅ PASS in 1.5 s; in the video at 2:00
- **Expected:** Invalid ID, percent 101, empty list, unknown type: each one plain message

![MCP-CHG-06 20-MCP-CHG-06-evidence.png](screenshots/20-MCP-CHG-06-evidence.png)

<a id="21-mcp-aud-01"></a>

#### 21. MCP-AUD-01: Agent changes are in the audit log as key:&lt;name>

- **Result:** ✅ PASS in 2.4 s; in the video at 2:01
- **Expected:** Activity → Who: Agents lists the agent's changes
- **Observed:** 1 agent changes listed, e.g. key:qa-admin-agent

![MCP-AUD-01 21-MCP-AUD-01-agents.png](screenshots/21-MCP-AUD-01-agents.png)

<a id="22-mcp-agt-01"></a>

#### 22. MCP-AGT-01: Agent rolls new-dashboard in prod out to 20%

- **Result:** ✅ PASS in 2.7 s; in the video at 2:04
- **Expected:** Reads the flag, updates the % rule with the current version; audit says rollout 10% → 20%
- **Observed:** Driven by the MCP tool calls an agent makes (scripted, no LLM in the loop).

![MCP-AGT-01 22-MCP-AGT-01-tool-calls.png](screenshots/22-MCP-AGT-01-tool-calls.png)

![MCP-AGT-01 22-MCP-AGT-01-dashboard.png](screenshots/22-MCP-AGT-01-dashboard.png)

### End-to-end

<a id="23-e2e-02"></a>

#### 23. E2E-02: Progressive rollout 10% → 50% → 100% only ever adds users

- **Result:** ✅ PASS in 9.2 s; in the video at 2:06
- **Expected:** Each step's users are a superset of the last; nobody loses the feature
- **Observed:** Users with it: 10% → 55/400, 50% → 210/400, 100% → 400/400; nobody lost it between steps
- **Observed:** Audit (oldest first): added rule: 10% rollout · turned ON · rollout 10% → 50% · rollout 50% → 100%

![E2E-02 23-E2E-02-10pct.png](screenshots/23-E2E-02-10pct.png)

![E2E-02 23-E2E-02-50pct.png](screenshots/23-E2E-02-50pct.png)

![E2E-02 23-E2E-02-100pct.png](screenshots/23-E2E-02-100pct.png)

![E2E-02 23-E2E-02-evidence.png](screenshots/23-E2E-02-evidence.png)

<a id="24-e2e-03"></a>

#### 24. E2E-03: Kill switch: turning a prod flag off removes it for everyone, live

- **Result:** ✅ PASS in 3.8 s; in the video at 2:16
- **Expected:** Storefront shows OFF live; rules kept
- **Observed:** Storefront showed OFF 0.2 s after the switch, no reload
- **Observed:** 50 sampled users all OFF; the 100% rule is kept

![E2E-03 24-E2E-03-dialog.png](screenshots/24-E2E-03-dialog.png)

![E2E-03 24-E2E-03-off.png](screenshots/24-E2E-03-off.png)

<a id="25-e2e-04"></a>

#### 25. E2E-04: Editor can't change prod: UI, API or MCP

- **Result:** ✅ PASS in 2.6 s; in the video at 2:20
- **Expected:** All three refused; prod unchanged; no audit entry

![E2E-04 25-E2E-04-ui-locked.png](screenshots/25-E2E-04-ui-locked.png)

![E2E-04 25-E2E-04-evidence.png](screenshots/25-E2E-04-evidence.png)

## Reproduce

Needs Docker and Node 20+. From the repo root:

```bash
ADMIN_PORT=6173 DEMO_PORT=6174 BACKEND_PORT=9080 POSTGRES_PORT=6433 docker compose -p ff-qa up -d --build
cd qa && npm ci && npx playwright install chromium
node run.mjs --reset      # all 25; or name cases: node run.mjs ADM-RULE-04 E2E-02
node make-video.mjs       # joins the clips into results/qa-run.mp4 (ffmpeg runs in a Docker container)
node report.mjs           # writes this report
```

The run stops and restarts the QA copy's backend (outage cases), so it never touches a stack on the default ports.
