# QA test plan

Manual test plan for the three ways people and agents use the service: the **admin dashboard**, the **demo storefront** and the **MCP server**. It complements the automated suite (`./test.sh`, see README → Tests), which covers the engine, the API's role matrix, the SDK and UI logic but has no browser end-to-end tests. This plan covers what only a person at a browser or an MCP client can check: the flows, the wording, the visuals, and the systems working together.

For a short run (a demo or a smoke test), start with the [top 25](qa-top-25.md).

## 1. Scope

| In scope | Out of scope |
|---|---|
| Admin UI: sign-in, roles, flags, rules, prod safety, activity, API keys, theme, accessibility, phone layout | Load and soak testing (single instance by design) |
| Demo storefront: first render, user and env switching, debug panel, dark mode via flag, live updates, outages | Browsers other than current Chrome, Firefox and Safari |
| MCP: auth, every tool, the role matrix through keys, validation, conflicts, audit attribution, key lifecycle | Publishing the SDK; OAuth for MCP (not built) |
| Cross-system: a change in the admin or by an agent shows up in the storefront and the audit log | Engine maths beyond spot checks (covered by 91 unit tests and golden vectors) |

## 2. Environment and test data

**Start from seed data** before a full run, so the expected results below hold:

```bash
docker compose down -v
```

```bash
docker compose up --build
```

| What | Where |
|---|---|
| Admin | http://localhost:5173 |
| Demo storefront | http://localhost:5174 |
| MCP endpoint | http://localhost:5173/mcp (proxied) or http://localhost:8080/mcp |
| Logins | `admin`, `editor`, `viewer`, with the dev passwords listed in README → Logins |

**Seeded flags:**

| Flag | dev | prod |
|---|---|---|
| `new-dashboard` | ON, no rules, Otherwise ON | ON: users u_102, u_207 → customer acme → 10% → Otherwise OFF |
| `beta-reports` | ON, no rules, Otherwise ON | ON: customer acme → Otherwise OFF |
| `dark-mode` | ON, no rules, Otherwise ON | **OFF**; rule 25% (inactive while off) |
| `free-shipping` | ON, no rules, Otherwise ON | ON: country in [CA] → Otherwise OFF |

**Demo users and their expected prod results** (the oracle for most storefront tests):

| User | Customer | Country | new-dashboard | beta-reports | dark-mode | free-shipping |
|---|---|---|---|---|---|---|
| Ana · u_102 | – | US | ON, rule 1 (user ID list) | OFF, Otherwise | OFF, flag is OFF | OFF, Otherwise |
| Ben · u_207 | acme | CA | ON, rule 1 (user ID list) | ON, rule 1 (customer list) | OFF, flag is OFF | ON, rule 1 (attribute) |
| Cy · u_350 | acme | US | ON, rule 2 (customer list) | ON, rule 1 (customer list) | OFF, flag is OFF | OFF, Otherwise |
| Dee · u_303 | zenith | DE | ON, rule 3 (% rollout) | OFF, Otherwise | OFF, flag is OFF | OFF, Otherwise |
| Eli · u_412 | zenith | – | OFF, Otherwise | OFF, Otherwise | OFF, flag is OFF | OFF, Otherwise (no country) |
| Anonymous | – | – | OFF, Otherwise (a % rule needs a user ID) | OFF, Otherwise | OFF, flag is OFF | OFF, Otherwise (no country) |

In **dev**, every user gets every flag ON ("no rule matched → Otherwise ON"), so the store is dark.

**Conventions.** IDs are `ADM-`, `DEMO-`, `MCP-`, `E2E-`, `SEC-`. Priority: **P0** blocks release, **P1** must pass before a demo, **P2** polish. Use scratch flags named `qa-…` for anything destructive, and delete them afterwards. Use two browser profiles (or one normal and one private window) when a test needs two people signed in at once.

## 3. Entry and exit criteria

- **Entry:** `./test.sh` is green on the build under test; `docker compose up --build` starts all four containers; backend health is UP.
- **Exit:** every P0 passes; no open P1 without a written reason; every failure is logged with steps, expected vs actual, role, environment, browser and a screenshot (or the MCP request and response).

---

## 4. Admin dashboard

### 4.1 Sign-in and session

| ID | P | Steps | Expected |
|---|---|---|---|
| ADM-AUTH-01 | P0 | Open the admin signed out | Login page; nothing else reachable |
| ADM-AUTH-02 | P0 | Sign in as each of admin, editor, viewer | Lands on Flags; header shows the username, an avatar and the role |
| ADM-AUTH-03 | P0 | Sign in with a wrong password, then an unknown user | "Wrong username or password." both times (no hint which part was wrong); stays on login |
| ADM-AUTH-04 | P1 | Submit with empty fields | Can't submit, or a clear "required" message; no request sent with blanks |
| ADM-AUTH-05 | P0 | Sign out | Back to login; Back button doesn't show flag data; reload stays signed out |
| ADM-AUTH-06 | P1 | Sign in as admin in tab A; sign out in tab B; act in tab A | Tab A drops to login on its next request (401), no broken half-state |
| ADM-AUTH-07 | P1 | Sign out as admin and sign in as viewer without reloading | No admin data or admin-only controls left over from the earlier session |
| ADM-AUTH-08 | P2 | Press Enter in the password field | Submits |

### 4.2 Role matrix in the UI (the server enforces it too; see SEC-)

| ID | P | Role | Steps | Expected |
|---|---|---|---|---|
| ADM-ROLE-01 | P0 | viewer | Look at every page | All switches, rule controls, "New flag", edit description and Delete are disabled or absent; read-only notes say why; no API keys tab |
| ADM-ROLE-02 | P0 | editor | Flags list | Dev switches work; prod switches locked with the tooltip "Your role can't change prod" |
| ADM-ROLE-03 | P0 | editor | Expand a flag → Production tab | Rules read-only with "Read-only: your role can't change prod"; Development tab is editable |
| ADM-ROLE-04 | P0 | editor | Expand a flag → settings | Can edit the description; no Delete |
| ADM-ROLE-05 | P0 | editor | Header | No API keys tab; `GET /api/keys` with the editor's session returns 403 |
| ADM-ROLE-06 | P0 | admin | All pages | Everything enabled, including prod, Delete and API keys |
| ADM-ROLE-07 | P1 | editor | Create a flag | Allowed; the new flag appears and is OFF in both environments |

### 4.3 Flags list

| ID | P | Steps | Expected |
|---|---|---|---|
| ADM-LIST-01 | P0 | Open Flags with seed data | Four rows (`new-dashboard`, `beta-reports`, `dark-mode`, `free-shipping`). Each shows a **Live / Partial / Off in prod** badge (icon + word), key, description, an "On for …" sentence, dev and prod switches, last change (avatar, who, when) |
| ADM-LIST-02 | P0 | Read the seed sentences | `new-dashboard`: "On for users u_102 and u_207, customer acme and 10% of users" (Partial). `beta-reports`: "On for customer acme" (Partial). `dark-mode`: "Off for everyone" (Off) |
| ADM-LIST-03 | P1 | Type in Search (key, then words from a description) | Filters as you type; "No flags match" empty state with a way to clear |
| ADM-LIST-04 | P1 | Click the Live / Partial / Off filters | Counts are right; list filters; "All" resets |
| ADM-LIST-05 | P1 | Click a row, then its chevron | Expands and collapses; only the clicked row changes; URL gets `?flag=<key>&env=<env>` |
| ADM-LIST-06 | P1 | Reload with `?flag=dark-mode&env=prod` | Opens with `dark-mode` expanded on Production |
| ADM-LIST-07 | P2 | Delete every flag (scratch DB) | "No flags yet" empty state with a create action (admin/editor) |

### 4.4 Turning flags on and off

| ID | P | Steps | Expected |
|---|---|---|---|
| ADM-TOG-01 | P0 | admin: flip a **dev** switch | Changes at once, no dialog; badge, sentence and "last change" update |
| ADM-TOG-02 | P0 | admin: flip a **prod** switch | Confirm dialog first, saying who will be affected ("nobody", "everyone", or the audience sentence). Nothing changes until confirmed |
| ADM-TOG-03 | P0 | Cancel the prod dialog (button, Esc, click outside) | Switch stays as it was; no audit entry |
| ADM-TOG-04 | P1 | Turn ON prod `dark-mode` with its 25% rule | Dialog says it goes to 25% of users, not "everyone" |
| ADM-TOG-05 | P1 | Turn ON a flag with no rules and Otherwise OFF | Dialog/sentence say nobody matches yet ("On, but nobody matches a rule yet"), not "Live" |
| ADM-TOG-06 | P1 | Flip the same switch twice fast | Ends in the last state; no error toast; two audit entries at most |
| ADM-TOG-07 | P1 | Stop the backend, flip a switch | Clear error; switch returns to the real state |

### 4.5 Rule editor

| ID | P | Steps | Expected |
|---|---|---|---|
| ADM-RULE-01 | P0 | Expand `new-dashboard` → Production | Three rule cards in order, "If" then "Else if", each with an icon, a label and gets ON/OFF; an "Everyone else" row with its own ON/OFF |
| ADM-RULE-02 | P0 | Add a users rule, type `u_999`, Enter, Save | Chip appears; Save becomes "Save prod rules"; saves; audit says "added rule: users u_999" |
| ADM-RULE-03 | P0 | Type an ID and click Save **without** pressing Enter | The typed ID is saved too (pending text is part of the draft) |
| ADM-RULE-04 | P0 | Type `bad id!` | Chip/draft marked invalid; message naming the ID and the allowed characters; Save disabled |
| ADM-RULE-05 | P1 | Focus an ID field and type `u_` | Suggestions list of seen IDs; pick one with mouse and with arrows + Enter |
| ADM-RULE-06 | P1 | Add an ID never evaluated, e.g. `u_000` | Allowed, with a warning that the service has never seen it |
| ADM-RULE-07 | P1 | Remove a chip with its × and with Backspace | Removed; × has an accessible name "Remove u_…" |
| ADM-RULE-08 | P0 | Percent rule: drag the slider, then type 37 | Both stay in sync; values outside 0–100 or decimals show "Use a whole number from 0 to 100." and block Save |
| ADM-RULE-09 | P0 | Reorder with the up/down arrows, Save | Order saved; audit "rules reordered"; the first and last arrows are disabled |
| ADM-RULE-10 | P1 | Delete a rule, then Discard | Draft returns to the saved rules; Discard and Save disabled when nothing changed |
| ADM-RULE-11 | P1 | Add an empty users rule | Hint "Add at least one user ID."; Save disabled |
| ADM-RULE-12 | P0 | Change Otherwise to ON, Save | Badge goes Live (if no OFF rules); audit "otherwise OFF → ON" |
| ADM-RULE-13 | P1 | Change a rollout 10 → 20, Save | Audit reads "rollout 10% → 20%" |
| ADM-RULE-14 | P0 | **Conflict:** two admins edit the same prod rules; A saves, then B saves | B sees "Someone else changed these rules while you were editing" with Discard; B's save is not silently applied (409) |
| ADM-RULE-15 | P1 | **No false conflict:** A edits rules (unsaved); B toggles the same flag in the same env; A saves | A's save succeeds (only the version moved) |
| ADM-RULE-16 | P1 | A has no unsaved edits; B changes the rules | A's editor shows B's rules without a reload |
| ADM-RULE-17 | P1 | Switch between the Development and Production tabs with unsaved edits | Behaviour is clear: edits kept per tab or a warning; never saved to the wrong env |
| ADM-RULE-ATTR-01 | P0 | As editor, on a temporary flag ON in Development: add "Users by attribute", name `country`, "is not one of", values `US CA`, Save | Stored rule `{"type":"attribute","attribute":"country","operator":"not_in","values":["US","CA"],"serve":true}`; row reads "On for users whose country isn't US or CA"; no suggestion list in the values box |

### 4.6 Create, edit, delete

| ID | P | Steps | Expected |
|---|---|---|---|
| ADM-FLAG-01 | P0 | New flag `qa-checkout` with a description | Created OFF in both envs; audit "created" |
| ADM-FLAG-02 | P0 | Key `QA Checkout`, `-qa`, 64+ characters | Rejected: "must be lowercase letters, digits and dashes, max 63 characters" |
| ADM-FLAG-03 | P0 | Key that already exists | "A flag with key '…' already exists."; nothing overwritten |
| ADM-FLAG-04 | P1 | Edit description (pencil icon), save; then cancel an edit | Saved / unchanged; audit "description changed"; key not editable |
| ADM-FLAG-05 | P1 | Description over 500 characters | Blocked or rejected with a clear message |
| ADM-FLAG-06 | P0 | admin: Delete `qa-checkout` | Dialog explains it disappears everywhere and code gets OFF; after confirm the row is gone; audit keeps its history (deleted flag shown un-clickable in Activity) |
| ADM-FLAG-07 | P1 | Create again with a deleted key | Allowed, starts fresh (OFF) |

### 4.7 Activity tab

| ID | P | Steps | Expected |
|---|---|---|---|
| ADM-ACT-01 | P0 | Open Activity after a few changes | Newest first, grouped Today / Yesterday / date; each entry has an icon for the kind of change, a plain-words summary, flag, env tag, avatar + actor, time |
| ADM-ACT-02 | P0 | Search "rollout" | Server-side search over summary, flag and actor; matches highlighted; "(all matches)" when everything's loaded |
| ADM-ACT-03 | P1 | Filters: What changed / Environment / Who (People, Agents) | Combine correctly; "Clear filters" resets all |
| ADM-ACT-04 | P1 | Search `5%` | Literal match (no SQL wildcard behaviour) |
| ADM-ACT-05 | P1 | With 50+ events, Load older | Appends the next page, no duplicates or gaps; button disappears at the end |
| ADM-ACT-06 | P1 | Click a flag name | Opens Flags with that flag expanded on the env that changed |
| ADM-ACT-07 | P1 | Make a change in another tab | Activity list refreshes |
| ADM-ACT-08 | P2 | Search that matches nothing | "No changes match" empty state with clear-filters link |

### 4.8 API keys (admin only)

| ID | P | Steps | Expected |
|---|---|---|---|
| ADM-KEY-01 | P0 | Create key `qa-viewer`, role viewer, 7 days | Token `ffk_…` shown **once**, with copy buttons and ready-to-paste client config; role help text matches the role |
| ADM-KEY-02 | P0 | Reload the page | Token is never shown again; the list shows name, role, creator, created, expiry, last used, status |
| ADM-KEY-03 | P1 | Create with an empty name, or 65+ characters | Blocked with a message |
| ADM-KEY-07 | P1 | Create a second active key with the same name | "An active key named '…' already exists." |
| ADM-KEY-04 | P0 | Revoke → "Revoke now" | Status Revoked; the token fails on the next MCP request (MCP-AUTH-05) |
| ADM-KEY-05 | P1 | Revoke → Cancel | Nothing changes |
| ADM-KEY-06 | P1 | Use a key, then reload the list | "Last used" updates |

### 4.9 Design, theme, accessibility, layout

| ID | P | Steps | Expected |
|---|---|---|---|
| ADM-UX-01 | P1 | Theme toggle: system → light → dark | Applies at once; remembered after reload; no flash of the wrong theme on load |
| ADM-UX-02 | P1 | Set the OS to dark with the toggle on "system" | Follows the OS |
| ADM-UX-03 | P1 | Every page in both themes | Text readable everywhere; status shown with icon + word, never colour alone |
| ADM-UX-04 | P1 | Keyboard only: sign in, expand a flag, toggle dev, edit a rule, save, use a dialog | Everything reachable; visible focus; Esc closes dialogs and focus returns |
| ADM-UX-05 | P1 | Screen reader / accessibility tree | Every icon-only button has a name (e.g. "Edit description", "Move rule 2 up"); switches are named "<flag> in <env>" |
| ADM-UX-06 | P1 | 375 px width | No horizontal scroll; header (incl. sign-out) visible; rows and rule editor usable |
| ADM-UX-07 | P2 | Reduced motion on | No essential motion |

---

## 5. Demo storefront

### 5.1 First render and user switching

| ID | P | Steps | Expected |
|---|---|---|---|
| DEMO-LOAD-01 | P0 | Open with network throttled (Slow 3G), hard reload | Never shows the classic home and then flips to the new dashboard: the first paint already has the right content |
| DEMO-LOAD-02 | P0 | Default load | Ben, prod; footer says "First flags resolved before first render (N ms)" |
| DEMO-USER-01 | P0 | Pick each user in **Viewing as** (prod) | Storefront and debug panel match the table in §2 exactly, including the "why" text |
| DEMO-USER-02 | P0 | Ben vs Ana | Ben sees "Spending by category for acme" with "Shown because beta-reports is ON for acme."; Ana doesn't see it |
| DEMO-USER-03 | P0 | Eli and Anonymous | Classic "Welcome to Corner Shop"; no beta section |
| DEMO-USER-04 | P1 | Switch users rapidly (5 changes in 2 s) | Ends on the last pick; no mix of two users' content; panel dims ("updating…") while loading |
| DEMO-USER-05 | P1 | Reload | Same user and env (URL `?user=&env=`); an unknown `?user=` falls back to the default |
| DEMO-USER-06 | P1 | Determinism: note Dee's result, reload 5 times, restart the backend | Same result every time |

### 5.2 Environment and theme

| ID | P | Steps | Expected |
|---|---|---|---|
| DEMO-ENV-01 | P0 | Dev/Prod segmented control → Dev | Every flag ON, "no rule matched → Otherwise ON"; env label in the panel says dev |
| DEMO-ENV-02 | P0 | In dev | Store is **dark** (dark-mode flag), using the same palette as the admin's dark theme |
| DEMO-ENV-03 | P0 | Back to prod | Light again |
| DEMO-ENV-04 | P1 | OS dark mode on, demo in prod | Stays light: the theme follows the flag, not the OS |
| DEMO-ENV-05 | P1 | Keyboard: Tab to the segmented control | Announced as a radio group "Environment"; current option checked |

### 5.3 Debug panel

| ID | P | Steps | Expected |
|---|---|---|---|
| DEMO-DBG-01 | P0 | Read each row | Flag key, ON/OFF as icon + word, reason with an icon: "flag is OFF in prod", "matched rule N (user ID list / customer list / % rollout)", "no rule matched → Otherwise ON/OFF" |
| DEMO-DBG-02 | P1 | A rule that serves OFF matches (set one up in the admin) | "matched rule N (…), which serves OFF" |
| DEMO-DBG-03 | P1 | Footer | "Live updates on · results are current" when healthy |
| DEMO-DBG-04 | P0 | Network tab → `/api/evaluate` response | Only `value`, `reason`, rule index and type per flag; **no** user lists, customer lists or percentages |

### 5.4 Live updates, refresh and outages

| ID | P | Steps | Expected |
|---|---|---|---|
| DEMO-LIVE-01 | P0 | Demo in prod as Eli; in the admin add u_412 to `new-dashboard` prod rule 1 and save | Within a couple of seconds, without a reload, Eli gets the new dashboard and the panel says rule 1 |
| DEMO-LIVE-02 | P0 | Turn prod `dark-mode` ON at 100% in the admin | Every user with an ID goes dark live; Anonymous stays light |
| DEMO-LIVE-03 | P1 | Refresh button | Icon spins while fetching (no spin with reduced motion); button named "Refresh flags"; values update |
| DEMO-OUT-01 | P0 | `docker compose stop backend` | Within 30 s: warning banner "The flag service is unreachable; showing the last known flags."; storefront unchanged; footer shows reconnecting |
| DEMO-OUT-02 | P0 | Backend still down: reload the page | Still shows last known flags from storage, marked stale |
| DEMO-OUT-03 | P0 | Backend down, clear site data, reload | Red banner "Couldn't reach the flag service, so every feature is OFF."; classic home; nothing crashes |
| DEMO-OUT-04 | P0 | `docker compose start backend` | Recovers on its own within ~30 s; banner disappears; changes made while down are picked up |
| DEMO-OUT-05 | P1 | During the outage, switch to a user never loaded | Shown as unavailable (all OFF), with the banner |

### 5.5 Layout and accessibility

| ID | P | Steps | Expected |
|---|---|---|---|
| DEMO-UX-01 | P1 | 375 px width, both themes | Header wraps (select full width); no horizontal scroll; debug panel below the store |
| DEMO-UX-02 | P1 | 860–1100 px | Two columns down to 860 px, one below |
| DEMO-UX-03 | P1 | Keyboard and screen reader | All controls reachable and named; flag notes readable; banners announced (alert / status) |
| DEMO-UX-04 | P2 | Inter font loads; no layout jump after load | |

---

## 6. MCP server

### 6.1 Setup

Create keys in the admin (**API keys**): `qa-admin` (admin), `qa-editor` (editor), `qa-viewer` (viewer). Keep each token only in your shell for the session, and revoke all three at the end.

Connect a real client:

```bash
claude mcp add --transport http feature-flags-qa http://localhost:5173/mcp --header "Authorization: Bearer $FF_KEY"
```

Or drive it with curl (stateless JSON-RPC over Streamable HTTP):

```bash
curl -s http://localhost:5173/mcp \
  -H "Authorization: Bearer $FF_KEY" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"whoami","arguments":{}}}'
```

Tool errors come back as a normal result with `"isError": true` and a plain message, which is what an agent reads.

### 6.2 Authentication and access

| ID | P | Steps | Expected |
|---|---|---|---|
| MCP-AUTH-01 | P0 | No `Authorization` header | 401; no tool runs |
| MCP-AUTH-02 | P0 | Wrong / malformed token (`ffk_nope`, `Bearer` only) | 401, same response for both (no hint which keys exist) |
| MCP-AUTH-03 | P0 | Admin dashboard session cookie, no key | Rejected: sessions don't work on `/mcp` |
| MCP-AUTH-04 | P0 | A valid key against `/api/flags` | Rejected: keys work only on `/mcp` |
| MCP-AUTH-05 | P0 | Revoke a key, call again | 401 on the very next request |
| MCP-AUTH-06 | P1 | Expired key (set `expires_at` in the past in the DB) | 401 |
| MCP-AUTH-07 | P0 | `whoami` with each key | Name, role and a `can` object matching the role exactly |

### 6.3 Discovery

| ID | P | Steps | Expected |
|---|---|---|---|
| MCP-DISC-01 | P0 | `tools/list` (the server is stateless, so `initialize` is optional for curl; real clients send it) | 12 tools: `whoami`, `list_environments`, `list_flags`, `get_flag`, `get_audit_log`, `suggest_ids`, `find_unseen_ids`, `create_flag`, `update_flag_description`, `delete_flag`, `set_flag_enabled`, `set_flag_rules` |
| MCP-DISC-02 | P1 | Annotations | Read tools `readOnlyHint: true`; `delete_flag` and `set_flag_rules` `destructiveHint: true` |
| MCP-DISC-03 | P1 | Ask Claude Code "what can you do with feature flags?" | It describes the tools accurately from their descriptions |

### 6.4 Read tools (viewer key)

| ID | P | Steps | Expected |
|---|---|---|---|
| MCP-READ-01 | P0 | `list_environments` | dev, prod in that order |
| MCP-READ-02 | P0 | `list_flags`, `get_flag new-dashboard` | Same data the dashboard shows, including each env's `version` and ordered rules |
| MCP-READ-03 | P1 | `get_flag no-such-flag` | `isError`, "not found" message |
| MCP-READ-04 | P0 | `get_audit_log` with `query`, `flag`, `environment`, `action`, `actor: "key"`, `limit`, `before` | Same results and order as the Activity page with the same filters; paging has no gaps |
| MCP-READ-05 | P1 | `get_audit_log` `limit: 0`, `limit: 201`, `query` of 201 characters | `isError` naming the field and limit |
| MCP-READ-06 | P1 | `suggest_ids kind=user query=u_` | Seen IDs, most recent first |
| MCP-READ-07 | P1 | `find_unseen_ids kind=user ids=["u_102","u_typo"]` | `unseen: ["u_typo"]` |

### 6.5 Change tools and the role matrix

| ID | P | Key | Call | Expected |
|---|---|---|---|---|
| MCP-ROLE-01 | P0 | viewer | any change tool | `isError`, e.g. "key:qa-viewer (viewer) may not change dev."; nothing changed; no audit entry |
| MCP-ROLE-02 | P0 | editor | `set_flag_enabled` / `set_flag_rules` on **dev** | Works |
| MCP-ROLE-03 | P0 | editor | `set_flag_enabled` / `set_flag_rules` on **prod** | `isError`, forbidden |
| MCP-ROLE-04 | P0 | editor | `create_flag`, `update_flag_description` | Works |
| MCP-ROLE-05 | P0 | editor | `delete_flag` | `isError`, forbidden |
| MCP-ROLE-06 | P0 | admin | every tool, including prod and delete | Works |
| MCP-CHG-01 | P0 | admin | `create_flag key=qa-agent` | Created OFF in both envs; visible in the dashboard without reload (or after one) |
| MCP-CHG-02 | P0 | admin | `create_flag key="Bad Key"` | `isError`: "'key' must be lowercase letters, digits and dashes, max 63 characters." |
| MCP-CHG-03 | P0 | admin | `set_flag_enabled` with the current `version` | Works; version increments |
| MCP-CHG-04 | P0 | admin | Repeat with the **old** version | `isError`: "'<key>' in <env> changed since you loaded version N… Reload and try again."; nothing overwritten |
| MCP-CHG-05 | P0 | admin | `set_flag_rules` with users, customers and percent rules, `otherwise` | Saved in order; `get_flag` returns them; the dashboard shows the same cards |
| MCP-CHG-06 | P0 | admin | Rules with an invalid ID (`"bad id"`), percent 101, empty `userIds`, unknown `type` | One clear message naming the field, e.g. `rules[0].userIds[0]`, not a wall of schema errors |
| MCP-CHG-07 | P1 | admin | `update_flag_description` over 500 characters | `isError` with the limit |
| MCP-CHG-08 | P0 | admin | `delete_flag key=qa-agent confirm_key=qa-agen` | `isError`: confirm_key must equal key; not deleted |
| MCP-CHG-09 | P0 | admin | `delete_flag` with matching keys | Deleted; audit kept |
| MCP-CHG-10 | P1 | admin | No-op change (turn ON a flag that's ON) | Accepted; no version bump, no audit entry |

### 6.6 Audit attribution and keys can't manage keys

| ID | P | Steps | Expected |
|---|---|---|---|
| MCP-AUD-01 | P0 | After MCP-CHG tests, open Activity → Who: Agents | Every agent change listed as `key:qa-admin` / `key:qa-editor` with a key avatar and plain-words summary |
| MCP-AUD-02 | P1 | `get_audit_log actor=key` | Same set |
| MCP-SEC-01 | P0 | With the admin key, try `/api/keys` (GET, POST) | Rejected; there is no tool for keys, so an agent can never create or revoke keys |

### 6.7 Agent scenarios (Claude Code connected with the admin key unless stated)

| ID | P | Prompt | Expected |
|---|---|---|---|
| MCP-AGT-01 | P0 | "Roll out new-dashboard in prod to 20%." | Agent reads the flag, changes the % rule using the current version, reports what it did; audit "rollout 10% → 20%"; demo updates live |
| MCP-AGT-02 | P0 | Editor key: "Turn dark-mode on in prod." | Agent reports it isn't allowed for an editor; nothing changes |
| MCP-AGT-03 | P1 | "Add customer acmee to beta-reports in prod." | Agent uses `find_unseen_ids` or `suggest_ids` and flags the likely typo before saving |
| MCP-AGT-04 | P1 | "Who changed beta-reports this week?" | Accurate answer from `get_audit_log` |
| MCP-AGT-05 | P1 | Change a flag in the dashboard while the agent is mid-task | Agent's stale write gets a conflict, re-reads, and asks or retries instead of overwriting |
| MCP-AGT-06 | P1 | "Delete beta-reports." | Client asks for confirmation (destructive hint); agent passes `confirm_key` only after confirmation |

---

## 7. End-to-end scenarios

| ID | P | Scenario | Expected |
|---|---|---|---|
| E2E-01 | P0 | **README walkthrough**, all five steps | Every stated result holds |
| E2E-02 | P0 | **Progressive rollout:** admin creates `qa-banner` → dev ON for everyone → prod 10% → 50% → 100% | At each step the set of demo users with it ON only grows (monotonic): nobody who had it loses it; audit tells the story in order |
| E2E-03 | P0 | **Kill switch:** prod flag at 100%, turn it OFF in prod | Every demo user drops it live; debug says "flag is OFF in prod"; rules kept for when it's turned back on |
| E2E-04 | P0 | **Editor in prod, three ways:** UI, direct API call, MCP editor key | All three refused; prod unchanged; no audit entry |
| E2E-05 | P1 | **Agent and person together:** agent sets rules while a person edits the same env | Exactly one wins; the other gets a conflict; no lost update |
| E2E-06 | P1 | **Restart everything** (`docker compose restart`) | Data intact; demo recovers on its own; admin requires sign-in again or keeps a valid session |
| E2E-07 | P1 | **Fresh clone:** `git clone`, `docker compose up --build` on a machine without Java or Node | Everything starts; `./test.sh` green |

## 8. API security spot checks (curl)

The automated suite covers the role matrix over HTTP; these confirm the deployed build.

| ID | P | Check | Expected |
|---|---|---|---|
| SEC-01 | P0 | Change request without the `X-XSRF-TOKEN` header (signed in) | 403 |
| SEC-02 | P0 | Editor session: `PUT /api/flags/new-dashboard/envs/prod/enabled` | 403 problem+json |
| SEC-03 | P0 | `POST /api/evaluate` without or with a wrong `X-SDK-Key` | 401 |
| SEC-04 | P0 | Dev SDK key returns dev results; prod key prod results | The key decides the env |
| SEC-05 | P0 | `/api/evaluate` response for any user | Results only; no rules or targeting data |
| SEC-06 | P1 | Error responses (400/403/404/409) | `application/problem+json`, no stack traces |
| SEC-07 | P1 | Postgres port | Bound to `127.0.0.1` only |
| SEC-08 | P1 | `GET /api/keys` | Never includes a token or its hash |

## 9. Regression list (bugs found and fixed during the build)

Re-run these whenever the related area changes.

| ID | Area | Was | Check |
|---|---|---|---|
| REG-01 | Rule editor | A typed ID was lost on Save when the field's blur moved the button | ADM-RULE-03 |
| REG-02 | Rule editor | After a 409, Reload restored stale rules | ADM-RULE-14, then Reload shows the other person's rules |
| REG-03 | Login | Switching user looked stuck after sign-in | ADM-AUTH-07 |
| REG-04 | Prod dialog | Said "Real users will start getting it right away: On, but nobody matches a rule yet" | ADM-TOG-05 |
| REG-05 | Percent rule | Slider layout broken by a CSS class clash | ADM-RULE-08 visually |
| REG-06 | Header | Sign-out pushed off-screen on phones | ADM-UX-06 |
| REG-07 | Contrast | Dark blue text on the blue tint was 4.23:1 | ADM-UX-03 on the expanded env tabs in dark |
| REG-08 | Live updates | Stream gave up after a proxy 502 | DEMO-OUT-04 via nginx (port 5174), not the backend directly |
| REG-09 | MCP | Invalid rules returned a wall of schema-branch errors | MCP-CHG-06 |

## 10. Known issues (not failures)

- An intermittent ~30 s hang when the backend test JVM exits (tests still pass). See docs/ai-log.md.
- The CSRF MockMvc wrapper behaviour is only partly explained (test-only). See docs/ai-log.md.
- Live updates can take up to ~30 s to resume after a long outage (backoff cap), and polling refreshes every 30 s.

## 11. Clean-up after a run

1. Delete `qa-…` flags (admin).
2. Revoke the `qa-…` API keys and remove the MCP server from your client (`claude mcp remove feature-flags-qa`).
3. Reset the demo's stored flags if you cleared or changed them (site data for localhost:5174).
4. For a pristine database: `docker compose down -v` then `docker compose up`.
