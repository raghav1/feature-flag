// Executes the top 25 QA cases (docs/qa-top-25.md), plus cases added after them, against a running stack, recording video and screenshots.
//   node run.mjs [--reset] [ID ...]
// --reset recreates the QA compose project from seed data first. With IDs, only those cases run.
import {
  ADMIN, DEMO, MASK_CSS, Runner, apiSession, compose, evaluate, expect, mcp, waitForHealth, writeResults,
} from "./harness.mjs";

const args = process.argv.slice(2);
const reset = args.includes("--reset");
const only = args.filter((a) => !a.startsWith("--"));

// ---------------------------------------------------------------- seed data and expectations

const SEED = {
  "new-dashboard": {
    rules: [
      { type: "users", userIds: ["u_102", "u_207"], serve: true },
      { type: "customers", customerIds: ["acme"], serve: true },
      { type: "percent", percent: 10, serve: true },
    ],
    otherwise: false,
  },
  "beta-reports": { rules: [{ type: "customers", customerIds: ["acme"], serve: true }], otherwise: false },
};

const OTHERWISE_OFF = "no rule matched → Otherwise OFF";
/** The prod oracle from the QA plan §2: [state, why] for new-dashboard and beta-reports. */
const PROD_EXPECTED = {
  u_102: { name: "Ana", nd: ["ON", "matched rule 1 (user ID list)"], br: ["OFF", OTHERWISE_OFF] },
  u_207: { name: "Ben", nd: ["ON", "matched rule 1 (user ID list)"], br: ["ON", "matched rule 1 (customer list)"] },
  u_350: { name: "Cy", nd: ["ON", "matched rule 2 (customer list)"], br: ["ON", "matched rule 1 (customer list)"] },
  u_303: { name: "Dee", nd: ["ON", "matched rule 3 (% rollout)"], br: ["OFF", OTHERWISE_OFF] },
  u_412: { name: "Eli", nd: ["OFF", OTHERWISE_OFF], br: ["OFF", OTHERWISE_OFF] },
  anonymous: { name: "Anonymous", nd: ["OFF", OTHERWISE_OFF], br: ["OFF", OTHERWISE_OFF] },
};

let admin; // API session used for setup and restores
const keys = {}; // MCP keys made for the run: name -> { id, token }

async function restoreSeed() {
  for (const [key, cfg] of Object.entries(SEED)) {
    const current = (await admin.flag(key)).environments.prod;
    if (JSON.stringify(current.rules) !== JSON.stringify(cfg.rules) || current.otherwise !== cfg.otherwise) {
      await admin.setRules(key, "prod", cfg.rules, cfg.otherwise);
    }
  }
  const dark = (await admin.flag("dark-mode")).environments.prod;
  if (dark.enabled) await admin.setEnabled("dark-mode", "prod", false);
}

// ---------------------------------------------------------------- UI helpers

async function login(scope, username) {
  await scope.getByLabel("Username").fill(username);
  await scope.getByLabel("Password").fill(username === "admin" ? process.env.QA_ADMIN_PASSWORD ?? "admin-pass"
    : username === "editor" ? process.env.QA_EDITOR_PASSWORD ?? "editor-pass" : process.env.QA_VIEWER_PASSWORD ?? "viewer-pass");
  await scope.getByRole("button", { name: "Sign in" }).click();
  await expect(scope.getByRole("button", { name: "new-dashboard, expand" })).toBeVisible();
}

async function adminPage(t, username) {
  const page = await t.page();
  await page.goto(ADMIN);
  await t.step(`Sign in as ${username}`);
  await login(page, username);
  return page;
}

const expand = (scope, key) => scope.getByRole("button", { name: `${key}, expand` }).click();
const switchFor = (scope, key, env) => scope.locator(`label.switch:has(input[aria-label="${key} in ${env}"])`).first();
const switchInput = (scope, key, env) => scope.getByRole("switch", { name: `${key} in ${env}` }).first();

/** Admin on the left, storefront on the right, in one recorded page, so a change and its effect are seen together. */
async function stage(t, demoQuery) {
  const page = await t.page({ width: 1600, height: 900 });
  const html = `<!doctype html><meta charset="utf-8"><title>QA stage</title>
    <style>body{margin:0;display:grid;grid-template-columns:1fr 1fr;height:100vh;background:#d1d9e0;gap:2px}
    iframe{border:0;width:100%;height:100%;background:#fff}</style>
    <iframe id="admin" src="${ADMIN}/"></iframe><iframe id="demo" src="${DEMO}/${demoQuery}"></iframe>`;
  await page.route(`${DEMO}/__qa_stage`, (route) => route.fulfill({ contentType: "text/html", body: html }));
  await page.goto(`${DEMO}/__qa_stage`);
  return { page, adminFrame: page.frameLocator("#admin"), demoFrame: page.frameLocator("#demo") };
}

const debugRow = (scope, flag) => scope.locator(`.debug-row[data-flag="${flag}"]`);
async function expectDebug(scope, flag, state, why) {
  await expect(debugRow(scope, flag).locator(".state")).toHaveText(state);
  if (why) await expect(debugRow(scope, flag).locator(".why")).toHaveText(why);
}

const pretty = (v) => JSON.stringify(v, null, 2);
/** Temporary flag for ADM-RULE-ATTR-01, deleted after the case. */
const ATTR_FLAG = "qa-attr-rule";

// ---------------------------------------------------------------- the 25 cases

const CASES = [
  // ------------------------------------------------ Admin dashboard
  {
    id: "ADM-ROLE-01", area: "Admin", title: "Viewer is read-only everywhere",
    expected: "No New flag, edit, delete, API keys; switches disabled; read-only notes say why",
    async fn(t) {
      const page = await adminPage(t, "viewer");
      await t.step("Flags list: no New flag button, every switch disabled, no API keys tab");
      await expect(page.getByRole("button", { name: /New flag/ })).toHaveCount(0);
      await expect(page.getByRole("button", { name: /API keys/ })).toHaveCount(0);
      const switches = page.getByRole("switch");
      expect(await switches.count()).toBe(6);
      for (const s of await switches.all()) await expect(s).toBeDisabled();
      await t.shot(page, "list");
      await t.step("Expanded flag: read-only notes, no rule controls, no edit or delete");
      await expand(page, "new-dashboard");
      await expect(page.getByText("You can view production but not change it with your role.")).toBeVisible();
      await expect(page.getByText("Read-only: your role can't change prod.")).toBeVisible();
      await expect(page.getByRole("group", { name: "Add rule" })).toHaveCount(0);
      await expect(page.getByRole("button", { name: /Save .* rules/ })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Edit description" })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Delete" })).toHaveCount(0);
      await t.shot(page, "expanded");
    },
  },
  {
    id: "ADM-LIST-02", area: "Admin", title: "Flags list says who gets each flag in plain English",
    expected: "Partial/Partial/Off in prod with the seed audience sentences",
    async fn(t) {
      const page = await adminPage(t, "admin");
      await t.step("Read the status badge and audience sentence of each row");
      const row = (key) => page.locator(".flag-row").filter({ has: page.getByRole("button", { name: `${key}, expand` }) });
      const checks = [
        ["new-dashboard", "Partial", "On for users u_102 and u_207, customer acme and 10% of users"],
        ["beta-reports", "Partial", "On for customer acme"],
        ["dark-mode", "Off", "Off for everyone"],
      ];
      for (const [key, status, sentence] of checks) {
        await expect(row(key).locator(".flag-status")).toContainText(status);
        await expect(row(key).locator(".flag-status")).toContainText("in prod");
        await expect(row(key).locator(".flag-audience")).toHaveText(sentence);
      }
      await t.shot(page, "list");
    },
  },
  {
    id: "ADM-TOG-02", area: "Admin", title: "A prod switch asks first and says who is affected",
    expected: "Dialog before any change; Cancel changes nothing; Confirm turns it on",
    async fn(t) {
      const page = await adminPage(t, "admin");
      await t.step("Click the prod switch of dark-mode");
      await switchFor(page, "dark-mode", "prod").click();
      const dialog = page.getByRole("dialog", { name: "Turn on dark-mode in prod?" });
      await expect(dialog).toBeVisible();
      await expect(dialog).toContainText("Real users start getting it right away: 25% of users.");
      await expect(switchInput(page, "dark-mode", "prod")).not.toBeChecked();
      expect((await admin.flag("dark-mode")).environments.prod.enabled).toBe(false);
      await t.shot(page, "dialog");
      await t.step("Cancel: nothing changes");
      await dialog.getByRole("button", { name: "Cancel" }).click();
      await expect(dialog).toBeHidden();
      await expect(switchInput(page, "dark-mode", "prod")).not.toBeChecked();
      expect((await admin.flag("dark-mode")).environments.prod.enabled).toBe(false);
      await t.step("Again, and confirm: turns on");
      await switchFor(page, "dark-mode", "prod").click();
      await page.getByRole("button", { name: "Turn on in prod" }).click();
      await expect(switchInput(page, "dark-mode", "prod")).toBeChecked();
      await expect.poll(async () => (await admin.flag("dark-mode")).environments.prod.enabled).toBe(true);
      await t.shot(page, "on");
      await t.step("Turn it back off (dialog warns everyone loses it)");
      await switchFor(page, "dark-mode", "prod").click();
      await expect(page.getByRole("dialog", { name: "Turn off dark-mode in prod?" })).toContainText("Everyone in prod loses this feature right away.");
      await page.getByRole("button", { name: "Turn off in prod" }).click();
      await expect(switchInput(page, "dark-mode", "prod")).not.toBeChecked();
    },
    cleanup: restoreSeed,
  },
  {
    id: "ADM-RULE-03", area: "Admin", title: "A typed ID is saved even without pressing Enter",
    expected: "u_501 saved into prod rule 1",
    async fn(t) {
      const page = await adminPage(t, "admin");
      await t.step("Expand new-dashboard (Production), type u_501 in rule 1, click Save without Enter");
      await expand(page, "new-dashboard");
      await page.getByRole("combobox", { name: "Rule 1 user IDs" }).pressSequentially("u_501");
      await page.getByRole("button", { name: "Save prod rules" }).click();
      await expect(page.getByText("Saved.")).toBeVisible();
      await expect(page.locator(".chip", { hasText: "u_501" })).toBeVisible();
      const rules = (await admin.flag("new-dashboard")).environments.prod.rules;
      expect(rules[0].userIds).toEqual(["u_102", "u_207", "u_501"]);
      t.note(`Server rule 1 after save: ${rules[0].userIds.join(", ")}`);
      await t.shot(page, "saved");
    },
    cleanup: restoreSeed,
  },
  {
    id: "ADM-RULE-04", area: "Admin", title: "A malformed ID is blocked with a clear message",
    expected: "bad#id stays in the box, message names it, Save disabled",
    async fn(t) {
      const page = await adminPage(t, "admin");
      await expand(page, "new-dashboard");
      await t.step("Type bad#id in rule 1 and press Enter");
      const box = page.getByRole("combobox", { name: "Rule 1 user IDs" });
      await box.pressSequentially("bad#id");
      await box.press("Enter");
      await expect(box).toHaveValue("bad#id");
      await expect(page.getByText('Fix "bad#id" first.', { exact: false })).toBeVisible();
      await expect(page.locator(".rule-problem")).toContainText("letters, digits");
      await expect(page.getByRole("button", { name: "Save prod rules" })).toBeDisabled();
      await t.shot(page, "blocked");
      await t.step("Discard");
      await page.getByRole("button", { name: "Discard", exact: true }).click();
      expect((await admin.flag("new-dashboard")).environments.prod.rules).toEqual(SEED["new-dashboard"].rules);
    },
  },
  {
    id: "ADM-RULE-14", area: "Admin", title: "Two admins edit the same rules: no silent overwrite",
    expected: "B is told someone else changed them; A's change stands",
    async fn(t) {
      const a = await adminPage(t, "admin");
      const b = await adminPage(t, "admin");
      await t.step("Both open beta-reports in Production");
      await expand(a, "beta-reports");
      await expand(b, "beta-reports");
      await t.step("A adds customer globex and saves");
      const boxA = a.getByRole("combobox", { name: "Rule 1 customers" });
      await boxA.pressSequentially("globex");
      await boxA.press("Enter");
      await a.getByRole("button", { name: "Save prod rules" }).click();
      await expect(a.getByText("Saved.")).toBeVisible();
      await t.step("B, still on the old version, adds initech and saves");
      const boxB = b.getByRole("combobox", { name: "Rule 1 customers" });
      await boxB.pressSequentially("initech");
      await boxB.press("Enter");
      await b.getByRole("button", { name: "Save prod rules" }).click();
      await expect(b.getByText(/Someone else changed these rules while you were editing|changed since you loaded version/).first()).toBeVisible();
      await expect(b.getByRole("button", { name: /Discard my changes|Reload rules/ }).first()).toBeVisible();
      await t.shot(b, "conflict");
      const rules = (await admin.flag("beta-reports")).environments.prod.rules;
      expect(rules[0].customerIds).toEqual(["acme", "globex"]);
      t.note(`Server kept A's rules: customers ${rules[0].customerIds.join(", ")}`);
    },
    cleanup: restoreSeed,
  },
  {
    id: "ADM-ACT-02", area: "Admin", title: "Activity search finds changes across all history",
    expected: "\"rollout\" finds \"rollout 10% → 20%\", highlighted, (all matches)",
    async fn(t) {
      await admin.setRules("new-dashboard", "prod", SEED["new-dashboard"].rules.map((r) => (r.type === "percent" ? { ...r, percent: 20 } : r)), false);
      await restoreSeed();
      const page = await adminPage(t, "admin");
      await t.step("Open Activity and search for rollout");
      await page.getByRole("button", { name: "Activity" }).click();
      await page.getByLabel("Search activity").pressSequentially("rollout");
      await expect(page.locator(".trail-item").first()).toBeVisible();
      await expect(page.locator(".trail-summary", { hasText: "rollout 10% → 20%" })).toBeVisible();
      await expect(page.locator(".trail-summary mark").first()).toHaveText(/rollout/i);
      await expect(page.getByText("(all matches)")).toBeVisible();
      const count = await page.locator(".trail-item").count();
      for (const s of await page.locator(".trail-summary").allTextContents()) expect(s.toLowerCase()).toContain("rollout");
      t.note(`${count} matching changes, all containing "rollout"`);
      await t.shot(page, "search");
    },
  },
  {
    id: "ADM-KEY-01", area: "Admin", title: "A new API key's token is shown once only",
    expected: "Token + client config shown once; gone after reload",
    async fn(t) {
      const page = await adminPage(t, "admin");
      await page.addStyleTag({ content: MASK_CSS });
      await t.step("API keys → create qa-demo-key (viewer)");
      await page.getByRole("button", { name: "API keys" }).click();
      await page.getByLabel("Name").fill("qa-demo-key");
      await page.getByLabel("Role").selectOption("VIEWER");
      await page.getByRole("button", { name: "Create key" }).click();
      const panel = page.getByRole("status", { name: "New API key" });
      await expect(panel).toContainText("Copy this key now. It won't be shown again.");
      const token = (await panel.locator("code.token").textContent()) ?? "";
      expect(token).toMatch(/^ffk_/);
      await expect(panel.locator("pre").first()).toContainText("claude mcp add");
      await expect(panel.getByRole("button", { name: "Copy" })).toBeVisible();
      t.note("Token blurred in the recording and screenshots.");
      await t.shot(page, "shown-once");
      await t.step("Reload: the token is never shown again");
      await page.reload();
      await page.addStyleTag({ content: MASK_CSS });
      await page.getByRole("button", { name: "API keys" }).click();
      await expect(page.getByRole("row").filter({ hasText: "qa-demo-key" })).toBeVisible();
      await expect(page.getByRole("status", { name: "New API key" })).toHaveCount(0);
      expect(await page.content()).not.toContain(token);
      await t.shot(page, "after-reload");
    },
    async cleanup() {
      const list = (await admin.call("GET", "/api/keys")).body ?? [];
      for (const k of list.filter((k) => k.name === "qa-demo-key" && !k.revokedAt)) await admin.revokeKey(k.id);
    },
  },

  // ------------------------------------------------ Demo storefront
  {
    id: "DEMO-LOAD-01", area: "Storefront", title: "No flicker on first load, even on slow 3G",
    expected: "First paint is already the new dashboard; classic home never appears",
    async fn(t) {
      const ctx = await t.context();
      await ctx.addInitScript(() => {
        window.__seen = [];
        new MutationObserver(() => {
          for (const el of document.querySelectorAll("main [data-flag]")) {
            const f = el.getAttribute("data-flag");
            if (!window.__seen.includes(f)) window.__seen.push(f);
          }
        }).observe(document, { subtree: true, childList: true });
      });
      const page = await ctx.newPage();
      const cdp = await ctx.newCDPSession(page);
      await cdp.send("Network.enable");
      await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 2000, downloadThroughput: 50_000, uploadThroughput: 50_000 });
      await t.step("Load the storefront as Ben with the network throttled (2 s latency, 400 kbit/s)");
      const started = Date.now();
      await page.goto(`${DEMO}/?user=u_207&env=prod`, { timeout: 60_000 });
      await expect(page.locator('main [data-flag="new-dashboard"]')).toBeVisible({ timeout: 60_000 });
      const seen = await page.evaluate(() => window.__seen);
      expect(seen).not.toContain("classic-home");
      expect(seen[0]).toBe("new-dashboard");
      t.note(`Loaded in ${((Date.now() - started) / 1000).toFixed(1)} s throttled; storefront blocks seen in order: ${seen.join(", ")}`);
      await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
      await t.shot(page, "first-paint");
    },
  },
  {
    id: "DEMO-USER-01", area: "Storefront", title: "Each demo user gets exactly the expected flags",
    expected: "All six users match the prod oracle (storefront + debug reasons)",
    async fn(t) {
      const page = await t.page();
      await page.goto(`${DEMO}/?user=u_207&env=prod`);
      for (const [key, exp] of Object.entries(PROD_EXPECTED)) {
        await t.step(`Viewing as ${exp.name}`);
        await page.getByLabel("Viewing as").selectOption(key);
        await expect(page).toHaveURL(new RegExp(`user=${key}`));
        await expect(page.locator(".debug")).not.toHaveClass(/updating/);
        await expectDebug(page, "new-dashboard", ...exp.nd);
        await expectDebug(page, "beta-reports", ...exp.br);
        await expectDebug(page, "dark-mode", "OFF", "flag is OFF in prod");
        await expect(page.locator(`main [data-flag="${exp.nd[0] === "ON" ? "new-dashboard" : "classic-home"}"]`)).toBeVisible();
        await expect(page.locator('main [data-flag="beta-reports"]')).toHaveCount(exp.br[0] === "ON" ? 1 : 0);
        await t.shot(page, exp.name.toLowerCase());
      }
    },
  },
  {
    id: "DEMO-ENV-02", area: "Storefront", title: "Dev turns the store dark via the dark-mode flag",
    expected: "All flags ON (Otherwise ON); data-theme=dark; admin's dark palette",
    async fn(t) {
      const page = await t.page();
      await page.goto(`${DEMO}/?user=u_207&env=prod`);
      await expect(page.locator(".page")).toHaveAttribute("data-theme", "light");
      await t.step("Switch to Dev");
      await page.getByRole("radio", { name: "Dev" }).click();
      await expect(page.locator(".page")).toHaveAttribute("data-theme", "dark");
      for (const f of ["new-dashboard", "beta-reports", "dark-mode"]) await expectDebug(page, f, "ON", "no rule matched → Otherwise ON");
      const bg = await page.locator(".page").evaluate((el) => getComputedStyle(el).backgroundColor);
      expect(bg).toBe("rgb(21, 27, 35)"); // --canvas-subtle in the shared dark tokens (#151b23)
      t.note(`Dark background ${bg} = shared token --canvas-subtle #151b23`);
      await t.shot(page, "dev-dark");
      await t.step("Back to Prod: light again");
      await page.getByRole("radio", { name: "Prod" }).click();
      await expect(page.locator(".page")).toHaveAttribute("data-theme", "light");
    },
  },
  {
    id: "DEMO-DBG-04", area: "Storefront", title: "The evaluate API returns results only, never rules",
    expected: "Only value/reason/ruleIndex/ruleType; no IDs, lists or percentages",
    async fn(t) {
      const page = await t.page();
      const responseP = page.waitForResponse((r) => r.url().includes("/api/evaluate") && r.request().method() === "POST");
      await t.step("Load the storefront as Ben and capture /api/evaluate");
      await page.goto(`${DEMO}/?user=u_207&env=prod`);
      const response = await responseP;
      const text = await response.text();
      const body = JSON.parse(text);
      const allowed = ["value", "reason", "ruleIndex", "ruleType"];
      for (const [flag, r] of Object.entries(body.flags)) {
        for (const k of Object.keys(r)) expect(allowed, `${flag}.${k}`).toContain(k);
      }
      for (const leak of ["userIds", "customerIds", '"rules"', "u_102", "zenith", '"percent":', '"otherwise"']) {
        expect(text, `response must not contain ${leak}`).not.toContain(leak);
      }
      await t.shot(page, "storefront");
      await t.evidence(page, "POST /api/evaluate (as Ben, prod)", [
        { label: "Request body", response: response.request().postData() ?? "" },
        { label: "Response: results only", ok: true, response: pretty(body) },
      ]);
      await t.shot(page, "response");
    },
  },
  {
    id: "DEMO-LIVE-01", area: "Storefront", title: "An admin change reaches the storefront without a reload",
    expected: "Eli gets the new dashboard within seconds of the save",
    async fn(t) {
      const { page, adminFrame, demoFrame } = await stage(t, "?user=u_412&env=prod");
      await t.step("Storefront as Eli: classic home");
      await expect(demoFrame.locator('main [data-flag="classic-home"]')).toBeVisible();
      await t.step("Admin: add u_412 to new-dashboard prod rule 1 and save");
      await login(adminFrame, "admin");
      await expand(adminFrame, "new-dashboard");
      const box = adminFrame.getByRole("combobox", { name: "Rule 1 user IDs" });
      await box.pressSequentially("u_412");
      await box.press("Enter");
      await t.shot(page, "before-save");
      const saved = Date.now();
      await adminFrame.getByRole("button", { name: "Save prod rules" }).click();
      await t.step("Watch the storefront (no reload)");
      await expect(demoFrame.locator('main [data-flag="new-dashboard"]')).toBeVisible({ timeout: 15_000 });
      const seconds = ((Date.now() - saved) / 1000).toFixed(1);
      await expectDebug(demoFrame, "new-dashboard", "ON", "matched rule 1 (user ID list)");
      await debugRow(demoFrame, "new-dashboard").scrollIntoViewIfNeeded();
      t.note(`Storefront updated ${seconds} s after Save, with no reload`);
      await t.shot(page, "after-save");
    },
    cleanup: restoreSeed,
  },
  {
    id: "DEMO-OUT-01", area: "Storefront", title: "Backend down: the store keeps its last known flags",
    expected: "Stale banner; storefront unchanged",
    async fn(t) {
      const page = await t.page();
      await page.goto(`${DEMO}/?user=u_207&env=prod`);
      await expect(page.locator('main [data-flag="new-dashboard"]')).toBeVisible();
      await t.step("Stop the backend (docker compose stop backend)");
      compose("stop backend");
      const stopped = Date.now();
      await t.step("Wait for the SDK's next refresh (polls every 30 s)");
      const banner = page.getByText("The flag service is unreachable; showing the last known flags.");
      await expect(banner).toBeVisible({ timeout: 40_000 });
      t.note(`Stale banner appeared ${((Date.now() - stopped) / 1000).toFixed(0)} s after the backend stopped, without user action`);
      await expect(page.locator('main [data-flag="new-dashboard"]')).toBeVisible();
      await expect(page.locator('main [data-flag="beta-reports"]')).toBeVisible();
      await t.shot(page, "stale");
    },
  },
  {
    id: "DEMO-OUT-03", area: "Storefront", title: "Nothing cached and backend down: all OFF, then recovers",
    expected: "Red banner, classic home, no crash; recovers by itself after restart",
    async fn(t) {
      compose("stop backend");
      const page = await t.page();
      await t.step("Fresh browser (no saved flags), backend down: load the storefront as Ben");
      await page.goto(`${DEMO}/?user=u_207&env=prod`);
      await expect(page.getByRole("alert")).toContainText("Couldn't reach the flag service, so every feature is OFF.");
      await expect(page.locator('main [data-flag="classic-home"]')).toBeVisible();
      await expect(page.locator('main [data-flag="beta-reports"]')).toHaveCount(0);
      await t.shot(page, "unavailable");
      await t.step("Start the backend again (docker compose start backend); no clicks from here");
      compose("start backend");
      await waitForHealth();
      const up = Date.now();
      await expect(page.locator('main [data-flag="new-dashboard"]')).toBeVisible({ timeout: 90_000 });
      await expect(page.getByRole("alert")).toHaveCount(0);
      t.note(`Recovered on its own ${((Date.now() - up) / 1000).toFixed(0)} s after the backend was healthy`);
      await t.shot(page, "recovered");
    },
    async cleanup() {
      compose("start backend");
      await waitForHealth();
    },
  },

  // ------------------------------------------------ MCP
  {
    id: "MCP-AUTH-05", area: "MCP", title: "A revoked key fails on the very next call",
    expected: "whoami works, revoke in the admin, next call is 401",
    async fn(t) {
      const key = await admin.createKey("qa-revoke", "VIEWER");
      const before = await mcp(key.token, "whoami");
      expect(before.http).toBe(200);
      expect(before.isError).toBe(false);
      const page = await adminPage(t, "admin");
      await t.step("API keys: revoke qa-revoke");
      await page.getByRole("button", { name: "API keys" }).click();
      const row = page.getByRole("row").filter({ hasText: "qa-revoke" });
      await row.getByRole("button", { name: "Revoke" }).click();
      await row.getByRole("button", { name: "Revoke now" }).click();
      await expect(row).toContainText("revoked");
      await t.shot(page, "revoked");
      await t.step("Call whoami with the revoked key");
      const after = await mcp(key.token, "whoami");
      expect(after.http).toBe(401);
      await t.evidence(page, "MCP: revoked key", [
        { label: "Before revoke: tools/call whoami", request: "Authorization: Bearer ffk_…", ok: true, response: `HTTP ${before.http}\n${before.text}` },
        { label: "After revoke: tools/call whoami", request: "Authorization: Bearer ffk_… (same key)", ok: after.http === 401, response: `HTTP ${after.http}\n${after.text || "(empty body)"}` },
      ]);
      await t.shot(page, "evidence");
    },
  },
  {
    id: "MCP-SEC-01", area: "MCP", title: "Even an admin key can't manage keys",
    expected: "/api/keys rejects the key; no MCP tool manages keys",
    async fn(t) {
      const token = keys["qa-admin-agent"].token;
      const list = await fetch(`${ADMIN}/api/keys`, { headers: { Authorization: `Bearer ${token}` } });
      const create = await fetch(`${ADMIN}/api/keys`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ name: "minted-by-agent", role: "ADMIN" }),
      });
      const tools = await mcp(token, "tools/list");
      const names = tools.data.tools.map((x) => x.name);
      expect([401, 403]).toContain(list.status);
      expect([401, 403]).toContain(create.status);
      expect(names.filter((n) => /key/i.test(n))).toEqual([]);
      expect(names).toHaveLength(12);
      const minted = ((await admin.call("GET", "/api/keys")).body ?? []).filter((k) => k.name === "minted-by-agent");
      expect(minted).toHaveLength(0);
      const page = await t.page();
      await t.evidence(page, "An admin API key trying to manage keys", [
        { label: "GET /api/keys with the admin key", ok: true, response: `HTTP ${list.status}` },
        { label: "POST /api/keys with the admin key (mint a new admin key)", ok: true, response: `HTTP ${create.status}\nNo key named minted-by-agent exists afterwards.` },
        { label: "MCP tools/list", ok: true, response: `${names.length} tools, none for keys:\n${names.join("\n")}` },
      ]);
      await t.shot(page, "evidence");
    },
  },
  {
    id: "MCP-ROLE-03", area: "MCP", title: "An editor key can't change prod",
    expected: "set_flag_enabled on prod is refused with a plain message; nothing changes",
    async fn(t) {
      const token = keys["qa-editor-agent"].token;
      const who = await mcp(token, "whoami");
      const flag = await mcp(token, "get_flag", { key: "dark-mode" });
      const version = flag.data.environments.prod.version;
      const attempt = await mcp(token, "set_flag_enabled", { key: "dark-mode", environment: "prod", enabled: true, version });
      expect(attempt.isError).toBe(true);
      expect(attempt.text).toMatch(/may not change prod/);
      expect((await admin.flag("dark-mode")).environments.prod.enabled).toBe(false);
      const page = await t.page();
      await t.evidence(page, "MCP: editor key vs prod", [
        { label: "whoami", response: who.text },
        { label: "set_flag_enabled dark-mode prod → true", request: pretty({ key: "dark-mode", environment: "prod", enabled: true, version }), ok: attempt.isError, response: `isError: ${attempt.isError}\n${attempt.text}` },
        { label: "dark-mode in prod afterwards", ok: true, response: "enabled: false (unchanged)" },
      ]);
      await t.shot(page, "evidence");
    },
  },
  {
    id: "MCP-CHG-04", area: "MCP", title: "A stale version is a conflict, not an overwrite",
    expected: "Second write with the old version is refused; first write stands",
    async fn(t) {
      const token = keys["qa-admin-agent"].token;
      const flag = await mcp(token, "get_flag", { key: "beta-reports" });
      const v = flag.data.environments.dev.version;
      const first = await mcp(token, "set_flag_enabled", { key: "beta-reports", environment: "dev", enabled: false, version: v });
      expect(first.isError).toBe(false);
      const stale = await mcp(token, "set_flag_enabled", { key: "beta-reports", environment: "dev", enabled: true, version: v });
      expect(stale.isError).toBe(true);
      expect(stale.text).toMatch(/changed since you loaded version/);
      expect((await admin.flag("beta-reports")).environments.dev.enabled).toBe(false);
      const page = await t.page();
      await t.evidence(page, "MCP: optimistic locking", [
        { label: `set_flag_enabled beta-reports dev → false (version ${v})`, ok: !first.isError, response: `isError: ${first.isError}` },
        { label: `set_flag_enabled beta-reports dev → true (stale version ${v})`, ok: stale.isError, response: `isError: ${stale.isError}\n${stale.text}` },
        { label: "beta-reports in dev afterwards", ok: true, response: "enabled: false (the first write stands)" },
      ]);
      await t.shot(page, "evidence");
    },
    async cleanup() {
      if (!(await admin.flag("beta-reports")).environments.dev.enabled) await admin.setEnabled("beta-reports", "dev", true);
    },
  },
  {
    id: "MCP-CHG-06", area: "MCP", title: "Bad rules get one clear message naming the field",
    expected: "Invalid ID, percent 101, empty list, unknown type: each one plain message",
    async fn(t) {
      const token = keys["qa-admin-agent"].token;
      const version = (await mcp(token, "get_flag", { key: "new-dashboard" })).data.environments.dev.version;
      const attempts = [
        ["invalid user ID", [{ type: "users", userIds: ["bad id"] }], /rules\[0\]\.userIds\[0\]/],
        ["percent 101", [{ type: "percent", percent: 101 }], /percent/i],
        ["empty user list", [{ type: "users", userIds: [] }], /userIds/],
        ["unknown rule type", [{ type: "country", values: ["nl"] }], /type/i],
      ];
      const rows = [];
      for (const [label, rules, pattern] of attempts) {
        const r = await mcp(token, "set_flag_rules", { key: "new-dashboard", environment: "dev", rules, otherwise: true, version });
        const ok = r.isError && pattern.test(r.text) && r.text.length < 400 && !/oneOf|#\//.test(r.text);
        rows.push({ label, request: pretty(rules), ok, response: r.text });
        expect(r.isError, label).toBe(true);
        expect(r.text, label).toMatch(pattern);
        expect(r.text.length, `${label}: message length`).toBeLessThan(400);
        expect(r.text, label).not.toMatch(/oneOf|#\//);
      }
      expect((await admin.flag("new-dashboard")).environments.dev.rules).toEqual([]);
      const page = await t.page();
      await t.evidence(page, "MCP: set_flag_rules with bad input", rows);
      await t.shot(page, "evidence");
    },
  },
  {
    id: "MCP-AUD-01", area: "MCP", title: "Agent changes are in the audit log as key:<name>",
    expected: "Activity → Who: Agents lists the agent's changes",
    async fn(t) {
      const page = await adminPage(t, "admin");
      await t.step("Activity → Who: Agents (API keys)");
      await page.getByRole("button", { name: "Activity" }).click();
      await page.getByLabel("Who").selectOption("key");
      await expect(page.locator(".trail-item").first()).toBeVisible();
      const actors = await page.locator(".trail-actor").allTextContents();
      expect(actors.length).toBeGreaterThan(0);
      for (const a of actors) expect(a.trim()).toMatch(/^key:/);
      await expect(page.locator(".trail-item", { hasText: "key:qa-admin-agent" }).first()).toContainText(/turned (ON|OFF)/);
      t.note(`${actors.length} agent changes listed, e.g. ${actors[0].trim()}`);
      await t.shot(page, "agents");
    },
  },
  {
    id: "MCP-AGT-01", area: "MCP", title: "Agent rolls new-dashboard in prod out to 20%",
    expected: "Reads the flag, updates the % rule with the current version; audit says rollout 10% → 20%",
    async fn(t) {
      t.note("Driven by the MCP tool calls an agent makes (scripted, no LLM in the loop).");
      const token = keys["qa-admin-agent"].token;
      const flag = await mcp(token, "get_flag", { key: "new-dashboard" });
      const prod = flag.data.environments.prod;
      const rules = prod.rules.map((r) => (r.type === "percent" ? { ...r, percent: 20 } : r));
      const set = await mcp(token, "set_flag_rules", { key: "new-dashboard", environment: "prod", rules, otherwise: prod.otherwise, version: prod.version });
      expect(set.isError).toBe(false);
      const audit = await mcp(token, "get_audit_log", { flag: "new-dashboard", environment: "prod", limit: 1 });
      const event = audit.data.events[0];
      expect(event.summary).toBe("rollout 10% → 20%");
      expect(event.actor).toBe("key:qa-admin-agent");
      const page = await t.page();
      await t.evidence(page, "Agent: \"Roll out new-dashboard in prod to 20%\"", [
        { label: "1. get_flag new-dashboard", response: pretty(prod) },
        { label: "2. set_flag_rules prod (10% → 20%, current version)", request: pretty({ rules, otherwise: prod.otherwise, version: prod.version }), ok: !set.isError, response: `isError: ${set.isError}` },
        { label: "3. get_audit_log (latest prod change)", ok: true, response: pretty(event) },
      ]);
      await t.shot(page, "tool-calls");
      await t.step("The dashboard shows the new audience");
      await page.goto(ADMIN);
      await login(page, "admin");
      await expect(page.locator(".flag-row", { hasText: "new-dashboard" }).locator(".flag-audience")).toContainText("20% of users");
      await expand(page, "new-dashboard");
      await expect(page.locator(".flag-details").getByText("rollout 10% → 20%").first()).toBeVisible();
      await t.shot(page, "dashboard");
    },
    cleanup: restoreSeed,
  },

  // ------------------------------------------------ End-to-end
  {
    id: "E2E-02", area: "End-to-end", title: "Progressive rollout 10% → 50% → 100% only ever adds users",
    expected: "Each step's users are a superset of the last; nobody loses the feature",
    async fn(t) {
      const { page, adminFrame } = await stage(t, "?user=u_207&env=prod");
      await t.step("Admin: create qa-banner");
      await login(adminFrame, "admin");
      await adminFrame.getByRole("button", { name: /New flag/ }).click();
      await adminFrame.getByLabel("Key").fill("qa-banner");
      await adminFrame.getByLabel("Description").fill("QA: progressive rollout banner");
      await adminFrame.getByRole("button", { name: "Create", exact: true }).click();
      await expect(adminFrame.getByRole("button", { name: /^qa-banner, (expand|collapse)$/ })).toBeVisible();
      if ((await adminFrame.getByRole("button", { name: "qa-banner, expand" }).count()) > 0) await expand(adminFrame, "qa-banner");
      await adminFrame.getByRole("tab", { name: /Production/ }).click();
      await t.step("Production: add a 10% rule, save, turn on (confirm)");
      await adminFrame.getByRole("group", { name: "Add rule" }).getByRole("button", { name: /Percentage of users/ }).click();
      const pct = adminFrame.getByRole("spinbutton", { name: "Rule 1 percentage value" });
      const users = Array.from({ length: 400 }, (_, i) => `u_qa_${i}`);
      const onFor = async () => {
        const on = new Set();
        for (let i = 0; i < users.length; i += 50) {
          const batch = await Promise.all(users.slice(i, i + 50).map((u) => evaluate("prod", u)));
          batch.forEach((r, j) => r.body.flags["qa-banner"]?.value && on.add(users[i + j]));
        }
        return on;
      };
      const steps = [];
      for (const percent of [10, 50, 100]) {
        await t.step(`Rollout ${percent}%: save and measure who gets it (400 synthetic users)`);
        await pct.fill(String(percent));
        await adminFrame.getByRole("button", { name: "Save prod rules" }).click();
        await expect(adminFrame.getByText("Saved.")).toBeVisible();
        if (percent === 10) {
          await adminFrame.locator('section.status-card label.switch').click();
          await adminFrame.getByRole("button", { name: "Turn on in prod" }).click();
          await expect(adminFrame.getByRole("switch", { name: "qa-banner in prod" }).first()).toBeChecked();
        }
        const on = await onFor();
        steps.push({ percent, on });
        await debugRow(page.frameLocator("#demo"), "qa-banner").scrollIntoViewIfNeeded();
        await t.shot(page, `${percent}pct`);
      }
      const [s10, s50, s100] = steps.map((s) => s.on);
      const lost = (a, b) => [...a].filter((u) => !b.has(u));
      expect(lost(s10, s50), "users lost going 10% → 50%").toEqual([]);
      expect(lost(s50, s100), "users lost going 50% → 100%").toEqual([]);
      expect(s100.size).toBe(400);
      expect(s10.size).toBeGreaterThan(20);
      expect(s10.size).toBeLessThan(60);
      expect(s50.size).toBeGreaterThan(160);
      expect(s50.size).toBeLessThan(240);
      const audit = await admin.audit({ flag: "qa-banner", env: "prod" });
      const summaries = audit.map((e) => e.summary).reverse();
      t.note(`Users with it: 10% → ${s10.size}/400, 50% → ${s50.size}/400, 100% → ${s100.size}/400; nobody lost it between steps`);
      t.note(`Audit (oldest first): ${summaries.join(" · ")}`);
      await t.evidence(page, "Progressive rollout of qa-banner (400 synthetic users)", [
        ...steps.map((s, i) => ({
          label: `${s.percent}%`,
          ok: i === 0 || lost(steps[i - 1].on, s.on).length === 0,
          response: `${s.on.size} of 400 users get it${i ? `; lost since the previous step: ${lost(steps[i - 1].on, s.on).length}` : ""}`,
        })),
        { label: "Audit trail (oldest first)", response: summaries.join("\n") },
      ]);
      await t.shot(page, "evidence");
    },
  },
  {
    id: "E2E-03", area: "End-to-end", title: "Kill switch: turning a prod flag off removes it for everyone, live",
    expected: "Storefront shows OFF live; rules kept",
    async fn(t) {
      const f = await admin.flag("qa-banner");
      if (!f?.environments) {
        await admin.call("POST", "/api/flags", { key: "qa-banner", description: "QA: progressive rollout banner" });
      }
      const prod = (await admin.flag("qa-banner")).environments.prod;
      if (JSON.stringify(prod.rules) !== JSON.stringify([{ type: "percent", percent: 100, serve: true }])) {
        await admin.setRules("qa-banner", "prod", [{ type: "percent", percent: 100, serve: true }], false);
      }
      if (!(await admin.flag("qa-banner")).environments.prod.enabled) await admin.setEnabled("qa-banner", "prod", true);
      const { page, adminFrame, demoFrame } = await stage(t, "?user=u_207&env=prod");
      await t.step("Storefront as Ben: qa-banner is ON (100%)");
      await debugRow(demoFrame, "qa-banner").scrollIntoViewIfNeeded();
      await expectDebug(demoFrame, "qa-banner", "ON", "matched rule 1 (% rollout)");
      await login(adminFrame, "admin");
      await expand(adminFrame, "qa-banner");
      await adminFrame.getByRole("tab", { name: /Production/ }).click();
      await t.step("Admin: turn qa-banner OFF in prod");
      await adminFrame.locator("section.status-card label.switch").click();
      const dialog = adminFrame.getByRole("dialog", { name: "Turn off qa-banner in prod?" });
      await expect(dialog).toContainText("Everyone in prod loses this feature right away. Its rules are kept, so you can turn it back on.");
      await t.shot(page, "dialog");
      const off = Date.now();
      await adminFrame.getByRole("button", { name: "Turn off in prod" }).click();
      await t.step("Storefront drops it live");
      await expectDebug(demoFrame, "qa-banner", "OFF", "flag is OFF in prod");
      t.note(`Storefront showed OFF ${((Date.now() - off) / 1000).toFixed(1)} s after the switch, no reload`);
      const after = (await admin.flag("qa-banner")).environments.prod;
      expect(after.enabled).toBe(false);
      expect(after.rules).toEqual([{ type: "percent", percent: 100, serve: true }]);
      const sample = await Promise.all(Array.from({ length: 50 }, (_, i) => evaluate("prod", `u_qa_${i}`)));
      expect(sample.every((r) => r.body.flags["qa-banner"].value === false)).toBe(true);
      t.note("50 sampled users all OFF; the 100% rule is kept");
      await t.shot(page, "off");
    },
  },
  {
    id: "E2E-04", area: "End-to-end", title: "Editor can't change prod: UI, API or MCP",
    expected: "All three refused; prod unchanged; no audit entry",
    async fn(t) {
      const before = await admin.audit({ env: "prod", limit: 200 });
      const page = await adminPage(t, "editor");
      await t.step("1. UI: prod switches locked for the editor");
      await expect(switchInput(page, "new-dashboard", "prod")).toBeDisabled();
      await expect(switchInput(page, "new-dashboard", "dev")).toBeEnabled();
      await expect(switchFor(page, "new-dashboard", "prod")).toHaveAttribute("title", "Your role can't change prod");
      await t.shot(page, "ui-locked");
      await t.step("2. API: editor session PUT prod enabled");
      const editor = await apiSession("editor");
      const version = (await editor.flag("new-dashboard")).environments.prod.version;
      const api = await editor.call("PUT", "/api/flags/new-dashboard/envs/prod/enabled", { enabled: false, version });
      await editor.dispose();
      expect(api.status).toBe(403);
      await t.step("3. MCP: editor key set_flag_rules on prod");
      const viaMcp = await mcp(keys["qa-editor-agent"].token, "set_flag_rules", { key: "new-dashboard", environment: "prod", rules: [], otherwise: true, version });
      expect(viaMcp.isError).toBe(true);
      const after = await admin.audit({ env: "prod", limit: 200 });
      expect(after.length).toBe(before.length);
      const nd = (await admin.flag("new-dashboard")).environments.prod;
      expect(nd.enabled).toBe(true);
      expect(nd.rules).toEqual(SEED["new-dashboard"].rules);
      await t.evidence(page, "Editor trying to change prod three ways", [
        { label: "1. Dashboard", ok: true, response: "Prod switch disabled: \"Your role can't change prod\"" },
        { label: "2. PUT /api/flags/new-dashboard/envs/prod/enabled (editor session)", ok: api.status === 403, response: `HTTP ${api.status}\n${pretty(api.body)}` },
        { label: "3. MCP set_flag_rules prod (editor key)", ok: viaMcp.isError, response: `isError: ${viaMcp.isError}\n${viaMcp.text}` },
        { label: "Prod audit entries before / after", ok: true, response: `${before.length} / ${after.length}` },
      ]);
      await t.shot(page, "evidence");
    },
  },
  // ------------------------------------------------ Added after the top 25
  {
    id: "ADM-RULE-ATTR-01", area: "Admin", title: "An editor targets users by attribute in dev",
    expected: "Saved as country not_in [US, CA]; row reads \"On for users whose country isn't US or CA\"; no suggestions",
    async fn(t) {
      await admin.call("DELETE", `/api/flags/${ATTR_FLAG}`);
      await admin.call("POST", "/api/flags", { key: ATTR_FLAG, description: "QA: attribute rule (temporary)" });
      await admin.setEnabled(ATTR_FLAG, "dev", true);
      const page = await adminPage(t, "editor");
      const contextCalls = [];
      page.on("request", (r) => { if (r.url().includes("/api/contexts")) contextCalls.push(r.url()); });
      await expand(page, ATTR_FLAG);
      await page.getByRole("tab", { name: /Development/ }).click();
      await t.step("Add rule: Users by attribute; country, is not one of, US CA; Save");
      await page.getByRole("group", { name: "Add rule" }).getByRole("button", { name: "Users by attribute" }).click();
      await page.getByRole("textbox", { name: "Rule 1 attribute name" }).fill("country");
      await page.getByRole("combobox", { name: "Rule 1 operator" }).selectOption({ label: "is not one of" });
      const values = page.getByRole("combobox", { name: "Rule 1 values" });
      await values.pressSequentially("u");
      await page.waitForTimeout(1000);
      await expect(page.getByRole("listbox")).toHaveCount(0);
      expect(contextCalls).toEqual([]);
      await values.fill("");
      await values.pressSequentially("US CA");
      await page.getByRole("button", { name: "Save dev rules" }).click();
      await expect(page.getByText("Saved.")).toBeVisible();
      await expect(page.locator(".status-sentence")).toHaveText("On for users whose country isn't US or CA");
      const stored = (await admin.flag(ATTR_FLAG)).environments.dev.rules;
      expect(stored).toEqual([{ type: "attribute", attribute: "country", operator: "not_in", values: ["US", "CA"], serve: true }]);
      expect(contextCalls).toEqual([]);
      t.note(`Stored dev rules: ${JSON.stringify(stored)}`);
      await t.shot(page, "saved");
    },
    cleanup: async () => { await admin.call("DELETE", `/api/flags/${ATTR_FLAG}`); },
  },
].map((c, i) => ({ ...c, n: i + 1 }));

// ---------------------------------------------------------------- main

if (reset) {
  console.log("Resetting the QA stack to seed data…");
  compose("down -v");
  compose("up -d");
}
await waitForHealth();
admin = await apiSession("admin");
await restoreSeed();
const existing = (await admin.call("GET", "/api/keys")).body ?? [];
for (const k of existing.filter((k) => k.name.startsWith("qa-") && !k.revokedAt)) await admin.revokeKey(k.id);
for (const [name, role] of [["qa-admin-agent", "ADMIN"], ["qa-editor-agent", "EDITOR"]]) keys[name] = await admin.createKey(name, role);

const runner = new Runner(CASES);
const results = await runner.run(only.length ? only : undefined);
writeResults(results);

for (const k of Object.values(keys)) await admin.revokeKey(k.id);
await admin.dispose();

const failed = results.filter((r) => r.status === "FAIL");
console.log(`\n${results.length - failed.length}/${results.length} passed${failed.length ? `; failed: ${failed.map((f) => f.id).join(", ")}` : ""}`);
process.exit(failed.length ? 1 : 0);
