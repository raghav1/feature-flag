# Top 15 QA cases: video report

**Result: 15 of 15 passed.** Video: [top-15-demo.mp4](top-15-demo.mp4), **3:13** (193.3 s, under 10:00), **1920×1080**, H264, 30 fps.

Recorded 2026-11-14 on build `035777d` against a separate copy of the stack (compose project `ff-qa`, ports 6173/6174) reset to seed data. No product source or configuration was changed for this recording. Runner: [qa/top15.mjs](../top15.mjs).

## Video structure

| Time | Section |
|---|---|
| 0:00 | Architecture and the 15 cases |
| 0:18 | Admin dashboard, cases 1–6 |
| 1:19 | Demo storefront, cases 7–12 |
| 2:08 | MCP agent tools and end-to-end, cases 13–15 |
| 2:46 | Summary: 15/15 passed (25 s) |

## Cases

| # | Case | Result | Video | Observed evidence |
|---|---|---|---|---|
| 1 | Viewer has read-only access | ✅ PASS | 0:24 | 6/6 switches disabled; read-only notes shown; no Add rule, Save, Edit description, Delete or API keys. |
| 2 | Flag list explains the effective production audience | ✅ PASS | 0:32 | new-dashboard: Partial, 'On for users u_102 and u_207, customer acme and 10% of users'; beta-reports: Partial, 'On for customer acme'; dark-mode: Off, 'Off for everyone'. |
| 3 | Production toggle requires confirmation and explains impact | ✅ PASS | 0:41 | Dialog text before any change: 'Real users start getting it right away: 25% of users.'; server still OFF while asking; Cancel kept it OFF; Confirm turned it ON; the off-dialog warned 'Everyone in prod loses this feature right away.' |
| 4 | Rules can be edited, validated and saved | ✅ PASS | 0:52 | 'Fix "bad#id" first…' shown and Save disabled; after Discard and Save, server rule 1 = u_102, u_207, u_501. |
| 5 | Activity search finds changes across all flag history | ✅ PASS | 1:02 | 2 results, all containing "rollout" (e.g. "rollout 10% → 20%"), footer "(all matches)". |
| 6 | A new MCP API-key token is shown only once | ✅ PASS | 1:09 | Token panel 'Copy this key now. It won't be shown again.' after create; after reload the key is listed and the token appears nowhere in the page. |
| 7 | Ana demonstrates direct user targeting | ✅ PASS | 1:24 | Storefront: 'Welcome back, Ana' (new dashboard), no beta report. Debug: new-dashboard ON 'matched rule 1 (user ID list)'; beta-reports OFF 'no rule matched → Otherwise OFF'. |
| 8 | Cy demonstrates customer targeting | ✅ PASS | 1:30 | Debug: new-dashboard ON 'matched rule 2 (customer list)'; beta-reports ON 'matched rule 1 (customer list)'; storefront shows 'Spending by category for acme'. |
| 9 | Dee demonstrates deterministic percentage rollout | ✅ PASS | 1:36 | ON 'matched rule 3 (% rollout)' on first load and after 2 reloads; 50/50 API evaluations ON via rule index 2. murmur3('new-dashboard:u_303') mod 10000 = 628, inside the first 10% (&lt; 1000). |
| 10 | Eli demonstrates the Otherwise OFF path | ✅ PASS | 1:46 | Classic home 'Welcome to Corner Shop'; new-dashboard and beta-reports OFF 'no rule matched → Otherwise OFF'; dark-mode OFF 'flag is OFF in prod'. |
| 11 | Switching Eli to dev shows environment differences and dark mode | ✅ PASS | 1:52 | prod: light, classic home, all OFF. dev: data-theme=dark, new dashboard + beta report, all three flags ON 'no rule matched → Otherwise ON'. |
| 12 | Admin changes reach the storefront live without refreshing | ✅ PASS | 2:00 | Eli changed from classic home to 'Welcome back, Eli' 0.2 s after Save (live stream, no reload); debug 'matched rule 1 (user ID list)'. |
| 13 | An editor MCP key cannot change production | ✅ PASS | 2:13 | whoami role EDITOR, changeEnvironments [dev]; set_flag_enabled prod → isError: "key:qa-editor-agent (editor) may not change prod."; prod enabled still false. |
| 14 | A stale version causes a conflict rather than overwriting | ✅ PASS | 2:23 | First write (version 0) accepted; second write with version 0: isError "'beta-reports' in dev changed since you loaded version 0 (now version 1). Reload and try again."; dev enabled stays false. |
| 15 | An admin MCP agent changes a prod rollout; audit shows key:&lt;name>; storefront updates | ✅ PASS | 2:32 | set_flag_rules ok; Eli's storefront switched in 0.3 s with 'matched rule 3 (% rollout)'; get_audit_log latest = {summary: "rollout 10% → 40%", actor: "key:qa-admin-agent"}; same entry in Activity → Agents. |

## Run history

| Attempt | Result | Notes |
|---|---|---|
| 1 | 14 / 15 | Case 5 failed in the runner, not the product: its own caption contained "(all matches)", so the check for that text matched both the caption and the page. Fixed by scoping the check to the results footer. Frames also showed the 1.25 device-pixel-ratio approach recorded only 1536×864 of the frame, so recording switched to a true 1920×1080 with a runtime CSS zoom. |
| 2 | **15 / 15** | This video. No product code or configuration was changed between attempts. |

## How each case was checked

Every PASS is an assertion in the runner, not a visual judgement: the UI state (roles, labels, debug-panel text, `data-flag` blocks, theme attribute), the server state read back through the API, and the MCP responses. The caption bar shows the case, the current action, the expected result and the verdict; highlighted outlines mark the evidence on screen.

## Credentials

- Passwords are typed into password fields, so the video shows dots. The logins are the fictional seed accounts.
- The new API key's token and its ready-to-paste config are blurred (case 6), as is the key-prefix column of the keys table.
- The MCP console never renders the token: it shows `Authorization: Bearer ffk_••••••••`, and any token-shaped text in a response would be masked.
- No cookies or headers are shown. Every key created for the recording was revoked at the end.

## Limitations

- **Captions, no voice narration.** Each case states its action, expected result and PASS/FAIL on screen.
- **The MCP "agent" is scripted.** Cases 13–15 send the exact MCP tool calls an agent sends, live from the browser to `/mcp`, but no LLM chose them.
- **Highlights and the 125% zoom are added at runtime** (an outline on the evidence, a CSS zoom on the page); the product's code and styles are untouched.
- **Seed data and a separate stack:** results reflect the fictional seed configuration on a fresh database; each case restores the seed state afterwards so cases don't depend on each other.
- **Live timings are local:** admin → storefront propagation was measured on one machine over the local stream.
- **1080p:** recorded at a true 1920×1080 (Playwright screencast), with the app pages drawn at 125% through a runtime CSS zoom so UI text stays readable, then re-encoded to H.264 (CRF 18).

## Reproduce

```bash
ADMIN_PORT=6173 DEMO_PORT=6174 BACKEND_PORT=9080 POSTGRES_PORT=6433 docker compose -p ff-qa up -d --build
cd qa && npm ci && node top15.mjs --reset
```
