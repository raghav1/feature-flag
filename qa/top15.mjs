// Records one video (1080p, under 10 minutes) of the 15 most important QA cases, then builds
// results/top-15-demo.mp4 and results/TOP-15-VIDEO-REPORT.md.
//   node top15.mjs [--reset]
// Runs against the QA copy of the stack (compose project ff-qa, ports 6173/6174). Product code is not touched:
// a failing case is reported, never patched around.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync, mkdirSync, readdirSync, copyFileSync } from "node:fs";
import { join } from "node:path";
import { ADMIN, DEMO, MASK_CSS, Runner, apiSession, compose, evaluate, expect, waitForHealth } from "./harness.mjs";

const RESULTS = new URL("./results/", import.meta.url).pathname;
const OUT = join(RESULTS, "top15");
const VIDEO = join(RESULTS, "top-15-demo.mp4");
const REPORT = join(RESULTS, "TOP-15-VIDEO-REPORT.md");
const W = 1920;
const H = 1080;
const ZOOM = 1.25; // app pages are drawn at 125% (runtime CSS zoom) and recorded at a true 1920x1080

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
const KEY_COLUMN_BLUR = "table.keys td:nth-child(3) { filter: blur(5px); }";

let admin;
const keys = {};

async function restoreSeed() {
  for (const [key, cfg] of Object.entries(SEED)) {
    const prod = (await admin.flag(key)).environments.prod;
    if (JSON.stringify(prod.rules) !== JSON.stringify(cfg.rules) || prod.otherwise !== cfg.otherwise) {
      await admin.setRules(key, "prod", cfg.rules, cfg.otherwise);
    }
  }
  if ((await admin.flag("dark-mode")).environments.prod.enabled) await admin.setEnabled("dark-mode", "prod", false);
  if (!(await admin.flag("beta-reports")).environments.dev.enabled) await admin.setEnabled("beta-reports", "dev", true);
}

// ---------------------------------------------------------------- UI helpers

const password = (u) => ({ admin: "admin-pass", editor: "editor-pass", viewer: "viewer-pass" })[u]; // fictional seed logins; typed into a password field, so shown as dots

async function login(scope, username) {
  await scope.getByLabel("Username").fill(username);
  await scope.getByLabel("Password").fill(password(username));
  await scope.getByRole("button", { name: "Sign in" }).click();
  await expect(scope.getByRole("button", { name: "new-dashboard, expand" })).toBeVisible();
}

async function adminPage(t, username) {
  const page = await t.page();
  await t.step(`Sign in to the admin as ${username}`);
  await page.goto(ADMIN);
  await login(page, username);
  return page;
}

const expand = (scope, key) => scope.getByRole("button", { name: `${key}, expand` }).click();
const switchFor = (scope, key, env) => scope.locator(`label.switch:has(input[aria-label="${key} in ${env}"])`).first();
const switchInput = (scope, key, env) => scope.getByRole("switch", { name: `${key} in ${env}` }).first();
const debugRow = (scope, flag) => scope.locator(`.debug-row[data-flag="${flag}"]`);
async function expectDebug(scope, flag, state, why) {
  await expect(debugRow(scope, flag).locator(".state")).toHaveText(state);
  if (why) await expect(debugRow(scope, flag).locator(".why")).toHaveText(why);
}

/** The live MCP console: a page on the admin's origin that sends real MCP requests to /mcp and shows each
 *  request and response as it happens. The token is held in memory only and never rendered. */
const CONSOLE_HTML = `<!doctype html><meta charset="utf-8"><title>MCP console</title>
<style>
  body{margin:0;padding:24px 28px 160px;background:#0d1117;color:#f0f6fc;font:18px/1.5 -apple-system,'Segoe UI',Inter,sans-serif}
  h1{font-size:24px;margin:0 0 2px} .sub{color:#9198a1;margin:0 0 16px}
  .call{border:1px solid #3d444d;border-radius:6px;margin:0 0 12px;overflow:hidden;background:#151b23}
  .head{display:flex;gap:10px;align-items:center;padding:8px 12px;border-bottom:1px solid #3d444d}
  .head b{flex:1} .tag{font-weight:700;font-size:13px;padding:1px 10px;border-radius:999px;color:#fff;background:#1f6feb}
  .ok{background:#238636} .err{background:#da3633}
  pre{margin:0;padding:8px 12px;white-space:pre-wrap;word-break:break-word;font:16px/1.45 ui-monospace,Menlo,monospace}
  .req{color:#9198a1;border-bottom:1px solid #2a313a}
</style>
<h1>MCP console</h1><p class="sub" id="who">Live JSON-RPC calls to POST /mcp. Authorization header: Bearer ffk_•••••••• (hidden)</p>
<div id="log"></div>
<script>
  window.__token = null;
  const esc = (s) => String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/ffk_[A-Za-z0-9_-]+/g,"ffk_••••••••");
  window.mcpCall = async (label, name, args) => {
    const el = document.createElement("section");
    el.className = "call";
    el.innerHTML = '<div class="head"><b>'+esc(label)+'</b><span class="tag">calling…</span></div>' +
      '<pre class="req">tools/call '+esc(name)+'\\n'+esc(JSON.stringify(args, null, 2))+'</pre><pre class="res">…</pre>';
    document.getElementById("log").appendChild(el);
    el.scrollIntoView({block:"end"});
    const res = await fetch("/mcp", { method: "POST", headers: { "Authorization": "Bearer " + window.__token,
      "Content-Type": "application/json", "Accept": "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method: "tools/call", params: { name, arguments: args } }) });
    const text = await res.text();
    let json = null; try { json = JSON.parse(text); } catch {}
    const r = json && json.result;
    const isError = !!(r && r.isError);
    const body = r ? (r.structuredContent ? JSON.stringify(r.structuredContent, null, 2) : (r.content && r.content[0] && r.content[0].text) || "") : text;
    const tag = el.querySelector(".tag");
    tag.textContent = "HTTP " + res.status + (r ? (isError ? " · isError: true" : " · ok") : "");
    tag.className = "tag " + (res.ok && !isError ? "ok" : "err");
    el.querySelector(".res").innerHTML = esc(body);
    el.scrollIntoView({block:"end"});
    return { http: res.status, isError, text: (r && r.content && r.content[0] && r.content[0].text) || text, data: r && r.structuredContent };
  };
</script>`;

async function routeConsole(ctx) {
  await ctx.route(`${ADMIN}/__qa_console`, (route) => route.fulfill({ contentType: "text/html", body: CONSOLE_HTML }));
}

/** A console frame (or page) bound to one key; returns call(label, tool, args). */
async function bindConsole(frame, keyName, role) {
  await frame.evaluate(([token, who]) => {
    window.__token = token;
    document.getElementById("who").textContent = `Live JSON-RPC calls to POST /mcp as ${who}. Authorization: Bearer ffk_•••••••• (hidden)`;
  }, [keys[keyName].token, `key:${keyName} (${role})`]);
  return (label, tool, args = {}) => frame.evaluate(([l, n, a]) => window.mcpCall(l, n, a), [label, tool, args]);
}

/** Two panes side by side in one recorded page. */
async function stage(t, left, right) {
  const ctx = await t.context();
  await routeConsole(ctx);
  const html = `<!doctype html><meta charset="utf-8"><title>QA stage</title>
    <style>body{margin:0;display:grid;grid-template-columns:1fr 1fr;height:100vh;background:#d1d9e0;gap:3px}
    iframe{border:0;width:100%;height:100%;background:#fff}</style>
    <iframe id="left" src="${left}"></iframe><iframe id="right" src="${right}"></iframe>`;
  await ctx.route(`${DEMO}/__qa_stage`, (route) => route.fulfill({ contentType: "text/html", body: html }));
  const page = await ctx.newPage();
  await page.goto(`${DEMO}/__qa_stage`);
  return { page, left: page.frameLocator("#left"), right: page.frameLocator("#right") };
}

async function storefront(t, query) {
  const page = await t.page();
  await page.goto(`${DEMO}/${query}`);
  await expect(page.locator(".debug")).not.toHaveClass(/updating/);
  return page;
}

async function viewAs(t, page, key, name) {
  await t.step(`Viewing as ${name}`);
  await page.getByLabel("Viewing as").selectOption(key);
  await expect(page).toHaveURL(new RegExp(`user=${key}`));
  await expect(page.locator(".debug")).not.toHaveClass(/updating/);
}

// ---------------------------------------------------------------- cards

const cardPage = (body) => `<!doctype html><meta charset="utf-8"><body style="margin:0;height:100vh;display:flex;flex-direction:column;
  justify-content:center;padding:0 96px;box-sizing:border-box;background:#0d1117;color:#f0f6fc;font-family:-apple-system,'Segoe UI',Inter,sans-serif">${body}</body>`;

function card(id, seconds, html) {
  return {
    id, card: true, area: "Card", title: id, expected: "",
    async fn(t) {
      const page = await t.page();
      await page.setContent(cardPage(typeof html === "function" ? html(t) : html));
      await t.hold(seconds * 1000);
    },
  };
}

const box = (title, lines, colour = "#3d444d") =>
  `<div style="border:2px solid ${colour};border-radius:8px;padding:12px 16px;background:#151b23"><div style="font-weight:700;font-size:20px">${title}</div>
   <div style="color:#9198a1;font-size:15px;line-height:1.5">${lines}</div></div>`;

const CASE_LIST = [
  ["Admin", ["Viewer has read-only access", "Flag list explains the prod audience", "Prod toggle confirms and explains impact", "Rules are edited, validated and saved", "Activity search covers all history", "A new MCP key's token is shown once"]],
  ["Demo storefront", ["Ana: direct user targeting", "Cy: customer targeting", "Dee: deterministic % rollout", "Eli: the Otherwise OFF path", "Eli in dev: environments + dark mode", "Admin changes arrive live"]],
  ["MCP and end-to-end", ["Editor key can't change prod", "Stale version is a conflict", "Agent rollout → audit key:<name> → storefront"]],
];

const INTRO = cardPage(`
  <p style="margin:0;color:#9198a1;font-size:20px">Feature Flags · QA demo</p>
  <h1 style="margin:4px 0 20px;font-size:44px">15 most important test cases, recorded live</h1>
  <div style="display:grid;grid-template-columns:1fr 1.3fr 1fr;gap:16px;align-items:center;margin-bottom:24px">
    <div style="display:grid;gap:10px">
      ${box("Admin dashboard", "React · session login · roles")}
      ${box("Demo storefront", "React · @flags/sdk · live stream")}
      ${box("AI agents", "MCP client · API key = one role")}
    </div>
    ${box("Backend (Spring Boot)", "REST /api · /api/evaluate + SSE · MCP /mcp<br>AccessPolicy decides every permission<br>audit in the same transaction<br>engine: plain Java, deterministic murmur3 rollouts", "#1f6feb")}
    ${box("PostgreSQL", "Flyway migrations + seed data")}
  </div>
  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:24px;font-size:16px;line-height:1.6">
    ${CASE_LIST.map(([area, cases], i) => `<div><div style="font-weight:700;color:#4493f8;font-size:18px">${area}</div>${cases
      .map((c, j) => `<div>${CASE_LIST.slice(0, i).reduce((n, [, cs]) => n + cs.length, 0) + j + 1}. ${c.replace(/</g, "&lt;")}</div>`)
      .join("")}</div>`).join("")}
  </div>
  <p style="margin:20px 0 0;color:#9198a1;font-size:15px">Fresh seed data · Chromium · captions show each action, the expected result and PASS/FAIL · credentials blurred</p>`);

const section = (title, sub) => `<p style="margin:0;color:#4493f8;font-size:22px;font-weight:700">${sub}</p><h1 style="margin:6px 0 0;font-size:56px">${title}</h1>`;

function summary(t) {
  const cases = t.results.filter((r) => !r.card);
  const passed = cases.filter((r) => r.status === "PASS").length;
  const pill = (s) => `<span style="font-weight:700;font-size:14px;padding:2px 10px;border-radius:999px;color:#fff;background:${s === "PASS" ? "#238636" : "#da3633"}">${s}</span>`;
  return `<h1 style="margin:0 0 6px;font-size:48px">${passed} / ${cases.length} passed</h1>
    <p style="margin:0 0 24px;color:#9198a1;font-size:18px">Admin ${cases.filter((r) => r.area === "Admin" && r.status === "PASS").length}/6 · Storefront ${cases.filter((r) => r.area === "Storefront" && r.status === "PASS").length}/6 · MCP and end-to-end ${cases.filter((r) => r.area === "MCP and end-to-end" && r.status === "PASS").length}/3</p>
    <div style="columns:2;column-gap:56px;font-size:18px;line-height:2.1">
    ${cases.map((r) => `<div>${pill(r.status)} &nbsp;<b>${CASES.find((c) => c.id === r.id).n}.</b> ${r.title.replace(/</g, "&lt;")}</div>`).join("")}</div>
    <p style="margin:24px 0 0;color:#9198a1;font-size:16px">Recorded against a fresh copy of the stack, no product changes during the run. Report: qa/results/TOP-15-VIDEO-REPORT.md</p>`;
}

// ---------------------------------------------------------------- the 15 cases

const CASES = [
  card("INTRO", 16, INTRO),
  card("SECTION-ADMIN", 3, section("Admin dashboard", "Cases 1–6")),
  {
    id: "ADM-ROLE-01", area: "Admin", title: "Viewer has read-only access",
    expected: "Every switch disabled; no New flag, rule editing, edit, delete or API keys; notes say why",
    async fn(t) {
      const page = await adminPage(t, "viewer");
      await t.step("Flags list: all six switches are disabled; no New flag button, no API keys tab");
      await expect(page.getByRole("button", { name: /New flag/ })).toHaveCount(0);
      await expect(page.getByRole("button", { name: /API keys/ })).toHaveCount(0);
      const switches = await page.getByRole("switch").all();
      expect(switches.length).toBe(6);
      for (const s of switches) await expect(s).toBeDisabled();
      await t.spot(page.locator(".flag-envs").first());
      await t.hold(2000);
      await t.step("Open new-dashboard: read-only notes, no rule controls, no edit or delete");
      await expand(page, "new-dashboard");
      const note = page.getByText("You can view production but not change it with your role.");
      await expect(note).toBeVisible();
      await expect(page.getByText("Read-only: your role can't change prod.")).toBeVisible();
      await expect(page.getByRole("group", { name: "Add rule" })).toHaveCount(0);
      await expect(page.getByRole("button", { name: /Save .* rules/ })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Edit description" })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Delete" })).toHaveCount(0);
      await t.spot(note);
      await t.hold(2500);
      t.note("6/6 switches disabled; read-only notes shown; no Add rule, Save, Edit description, Delete or API keys.");
    },
  },
  {
    id: "ADM-LIST-02", area: "Admin", title: "Flag list explains the effective production audience",
    expected: "Each row: Live/Partial/Off in prod + who gets it, in plain English",
    async fn(t) {
      const page = await adminPage(t, "admin");
      const row = (key) => page.locator(".flag-row").filter({ has: page.getByRole("button", { name: `${key}, expand` }) });
      const checks = [
        ["new-dashboard", "Partial", "On for users u_102 and u_207, customer acme and 10% of users"],
        ["beta-reports", "Partial", "On for customer acme"],
        ["dark-mode", "Off", "Off for everyone"],
      ];
      for (const [key, status, sentence] of checks) {
        await t.step(`${key}: "${status} in prod" — ${sentence}`);
        await expect(row(key).locator(".flag-status")).toContainText(`${status}`);
        await expect(row(key).locator(".flag-audience")).toHaveText(sentence);
        await t.spot(row(key).locator(".flag-status"));
        await t.spot(row(key).locator(".flag-audience"));
        await t.hold(1600);
      }
      t.note("new-dashboard: Partial, 'On for users u_102 and u_207, customer acme and 10% of users'; beta-reports: Partial, 'On for customer acme'; dark-mode: Off, 'Off for everyone'.");
    },
  },
  {
    id: "ADM-TOG-02", area: "Admin", title: "Production toggle requires confirmation and explains impact",
    expected: "A dialog says who is affected before anything changes; Cancel changes nothing",
    async fn(t) {
      const page = await adminPage(t, "admin");
      await t.step("Click dark-mode's prod switch");
      await switchFor(page, "dark-mode", "prod").click();
      const dialog = page.getByRole("dialog", { name: "Turn on dark-mode in prod?" });
      await expect(dialog).toContainText("Real users start getting it right away: 25% of users.");
      await expect(switchInput(page, "dark-mode", "prod")).not.toBeChecked();
      expect((await admin.flag("dark-mode")).environments.prod.enabled).toBe(false);
      await t.step("Dialog: \"Real users start getting it right away: 25% of users.\" Nothing has changed yet");
      await t.hold(2800);
      await t.step("Cancel: the switch stays off");
      await dialog.getByRole("button", { name: "Cancel" }).click();
      await expect(switchInput(page, "dark-mode", "prod")).not.toBeChecked();
      await t.hold(1000);
      await t.step("Again, and confirm: it turns on");
      await switchFor(page, "dark-mode", "prod").click();
      await page.getByRole("button", { name: "Turn on in prod" }).click();
      await expect(switchInput(page, "dark-mode", "prod")).toBeChecked();
      await expect.poll(async () => (await admin.flag("dark-mode")).environments.prod.enabled).toBe(true);
      await t.hold(1000);
      await t.step("Turning it off warns that everyone in prod loses it");
      await switchFor(page, "dark-mode", "prod").click();
      await expect(page.getByRole("dialog", { name: "Turn off dark-mode in prod?" })).toContainText("Everyone in prod loses this feature right away.");
      await t.hold(2200);
      await page.getByRole("button", { name: "Turn off in prod" }).click();
      await expect(switchInput(page, "dark-mode", "prod")).not.toBeChecked();
      t.note("Dialog text before any change: 'Real users start getting it right away: 25% of users.'; server still OFF while asking; Cancel kept it OFF; Confirm turned it ON; the off-dialog warned 'Everyone in prod loses this feature right away.'");
    },
    cleanup: restoreSeed,
  },
  {
    id: "ADM-RULE-04", area: "Admin", title: "Rules can be edited, validated and saved",
    expected: "A malformed ID is blocked with a message; a valid ID saves; the server has it",
    async fn(t) {
      const page = await adminPage(t, "admin");
      await t.step("Open new-dashboard → Production rules");
      await expand(page, "new-dashboard");
      const box = page.getByRole("combobox", { name: "Rule 1 user IDs" });
      await t.step("Type a malformed ID: bad#id");
      await box.pressSequentially("bad#id");
      await box.press("Enter");
      const problem = page.locator(".rule-problem");
      await expect(problem).toContainText('Fix "bad#id" first.');
      await expect(page.getByRole("button", { name: "Save prod rules" })).toBeDisabled();
      await t.spot(problem);
      await t.step("Blocked: the message names the ID and the allowed characters; Save is disabled");
      await t.hold(2500);
      await t.step("Discard, then type a valid ID (u_501) and Save");
      await page.getByRole("button", { name: "Discard", exact: true }).click();
      await expect(box).toHaveValue("");
      await box.pressSequentially("u_501");
      await page.getByRole("button", { name: "Save prod rules" }).click();
      await expect(page.getByText("Saved.")).toBeVisible();
      await t.spot(page.locator(".chip", { hasText: "u_501" }));
      const rules = (await admin.flag("new-dashboard")).environments.prod.rules;
      expect(rules[0].userIds).toEqual(["u_102", "u_207", "u_501"]);
      await t.step("Saved: the server's rule 1 is now u_102, u_207, u_501");
      await t.hold(2200);
      t.note("'Fix \"bad#id\" first…' shown and Save disabled; after Discard and Save, server rule 1 = u_102, u_207, u_501.");
    },
    cleanup: restoreSeed,
  },
  {
    id: "ADM-ACT-02", area: "Admin", title: "Activity search finds changes across all flag history",
    expected: "Searching \"rollout\" lists every matching change, highlighted, (all matches)",
    async fn(t) {
      await admin.setRules("new-dashboard", "prod", SEED["new-dashboard"].rules.map((r) => (r.type === "percent" ? { ...r, percent: 20 } : r)), false);
      await restoreSeed();
      const page = await adminPage(t, "admin");
      await t.step("Open Activity and search: rollout");
      await page.getByRole("button", { name: "Activity" }).click();
      await page.getByLabel("Search activity").pressSequentially("rollout", { delay: 60 });
      await expect(page.locator(".trail-summary", { hasText: "rollout 10% → 20%" })).toBeVisible();
      await expect(page.locator(".trail-footer").getByText("(all matches)")).toBeVisible();
      const summaries = await page.locator(".trail-summary").allTextContents();
      for (const s of summaries) expect(s.toLowerCase()).toContain("rollout");
      await t.spot(page.locator(".trail-summary", { hasText: "rollout 10% → 20%" }));
      await t.step(`${summaries.length} matching changes, search terms highlighted, "(all matches)"`);
      await t.hold(2800);
      t.note(`${summaries.length} results, all containing "rollout" (e.g. "rollout 10% → 20%"), footer "(all matches)".`);
    },
  },
  {
    id: "ADM-KEY-01", area: "Admin", title: "A new MCP API-key token is shown only once",
    expected: "Token and client config shown once (blurred here); gone after reload",
    async fn(t) {
      const page = await adminPage(t, "admin");
      await page.addStyleTag({ content: MASK_CSS + KEY_COLUMN_BLUR });
      await t.step("API keys → create qa-demo-key (viewer)");
      await page.getByRole("button", { name: "API keys" }).click();
      await page.getByLabel("Name").fill("qa-demo-key");
      await page.getByLabel("Role").selectOption("VIEWER");
      await page.getByRole("button", { name: "Create key" }).click();
      const panel = page.getByRole("status", { name: "New API key" });
      await expect(panel).toContainText("Copy this key now. It won't be shown again.");
      const token = (await panel.locator("code.token").textContent()) ?? "";
      expect(token).toMatch(/^ffk_/);
      await t.spot(panel.getByText("Copy this key now. It won't be shown again."));
      await t.step("Shown once with ready-to-paste config (blurred in this video)");
      await t.hold(2500);
      await t.step("Reload the page: the token is never shown again");
      await page.reload();
      await page.addStyleTag({ content: MASK_CSS + KEY_COLUMN_BLUR });
      await page.getByRole("button", { name: "API keys" }).click();
      const row = page.getByRole("row").filter({ hasText: "qa-demo-key" });
      await expect(row).toBeVisible();
      await expect(page.getByRole("status", { name: "New API key" })).toHaveCount(0);
      expect(await page.content()).not.toContain(token);
      await t.spot(row);
      await t.hold(2200);
      t.note("Token panel 'Copy this key now. It won't be shown again.' after create; after reload the key is listed and the token appears nowhere in the page.");
    },
    async cleanup() {
      for (const k of ((await admin.call("GET", "/api/keys")).body ?? []).filter((k) => k.name === "qa-demo-key" && !k.revokedAt)) await admin.revokeKey(k.id);
    },
  },
  card("SECTION-DEMO", 3, section("Demo storefront", "Cases 7–12")),
  {
    id: "DEMO-ANA", area: "Storefront", title: "Ana demonstrates direct user targeting",
    expected: "new-dashboard ON via rule 1 (user ID list); beta-reports OFF",
    async fn(t) {
      const page = await storefront(t, "?user=u_207&env=prod");
      await viewAs(t, page, "u_102", "Ana (u_102, no customer)");
      await expect(page.locator('main [data-flag="new-dashboard"]')).toBeVisible();
      await expect(page.locator('main [data-flag="beta-reports"]')).toHaveCount(0);
      await expectDebug(page, "new-dashboard", "ON", "matched rule 1 (user ID list)");
      await expectDebug(page, "beta-reports", "OFF", OTHERWISE_OFF);
      await t.spot(page.locator('main [data-flag="new-dashboard"] h1'));
      await t.spot(debugRow(page, "new-dashboard"));
      await t.step("Ana is in prod rule 1's user list: new dashboard, \"matched rule 1 (user ID list)\"");
      await t.hold(3000);
      t.note("Storefront: 'Welcome back, Ana' (new dashboard), no beta report. Debug: new-dashboard ON 'matched rule 1 (user ID list)'; beta-reports OFF 'no rule matched → Otherwise OFF'.");
    },
  },
  {
    id: "DEMO-CY", area: "Storefront", title: "Cy demonstrates customer targeting",
    expected: "new-dashboard ON via rule 2 (customer list); beta-reports ON for acme",
    async fn(t) {
      const page = await storefront(t, "?user=u_207&env=prod");
      await viewAs(t, page, "u_350", "Cy (u_350, customer acme)");
      await expectDebug(page, "new-dashboard", "ON", "matched rule 2 (customer list)");
      await expectDebug(page, "beta-reports", "ON", "matched rule 1 (customer list)");
      await expect(page.locator('main [data-flag="beta-reports"]')).toContainText("for acme");
      await t.spot(debugRow(page, "new-dashboard"));
      await t.spot(debugRow(page, "beta-reports"));
      await t.step("Cy isn't in the user list but works for acme: rule 2 (customer list), and the acme beta report");
      await t.hold(3200);
      t.note("Debug: new-dashboard ON 'matched rule 2 (customer list)'; beta-reports ON 'matched rule 1 (customer list)'; storefront shows 'Spending by category for acme'.");
    },
  },
  {
    id: "DEMO-DEE", area: "Storefront", title: "Dee demonstrates deterministic percentage rollout",
    expected: "ON via rule 3 (% rollout), the same on every load and every call",
    async fn(t) {
      const page = await storefront(t, "?user=u_207&env=prod");
      await viewAs(t, page, "u_303", "Dee (u_303, customer zenith)");
      await expectDebug(page, "new-dashboard", "ON", "matched rule 3 (% rollout)");
      await t.spot(debugRow(page, "new-dashboard"));
      await t.step("Dee isn't listed and zenith isn't targeted, yet she is in the 10% rollout");
      await t.hold(2200);
      for (let i = 1; i <= 2; i++) {
        await t.step(`Reload ${i} of 2: same answer`);
        await page.reload();
        await expectDebug(page, "new-dashboard", "ON", "matched rule 3 (% rollout)");
        await t.spot(debugRow(page, "new-dashboard"));
        await t.hold(1200);
      }
      const calls = await Promise.all(Array.from({ length: 50 }, () => evaluate("prod", "u_303", { customer: "zenith" })));
      const same = calls.every((c) => c.body.flags["new-dashboard"].value === true && c.body.flags["new-dashboard"].ruleIndex === 2);
      expect(same).toBe(true);
      await t.step("50 more evaluations for u_303: all ON via rule 3 (bucket 628 of 10,000 < 1,000)");
      await t.hold(2200);
      t.note("ON 'matched rule 3 (% rollout)' on first load and after 2 reloads; 50/50 API evaluations ON via rule index 2. murmur3('new-dashboard:u_303') mod 10000 = 628, inside the first 10% (< 1000).");
    },
  },
  {
    id: "DEMO-ELI", area: "Storefront", title: "Eli demonstrates the Otherwise OFF path",
    expected: "No rule matches: classic home; every flag OFF with \"Otherwise OFF\"",
    async fn(t) {
      const page = await storefront(t, "?user=u_207&env=prod");
      await viewAs(t, page, "u_412", "Eli (u_412, customer zenith)");
      await expect(page.locator('main [data-flag="classic-home"]')).toBeVisible();
      await expectDebug(page, "new-dashboard", "OFF", OTHERWISE_OFF);
      await expectDebug(page, "beta-reports", "OFF", OTHERWISE_OFF);
      await t.spot(page.locator('main [data-flag="classic-home"] h1'));
      await t.spot(debugRow(page, "new-dashboard"));
      await t.step("Not listed, zenith not targeted, outside the 10%: \"no rule matched → Otherwise OFF\"");
      await t.hold(3000);
      t.note("Classic home 'Welcome to Corner Shop'; new-dashboard and beta-reports OFF 'no rule matched → Otherwise OFF'; dark-mode OFF 'flag is OFF in prod'.");
    },
  },
  {
    id: "DEMO-ELI-DEV", area: "Storefront", title: "Switching Eli to dev shows environment differences and dark mode",
    expected: "In dev every flag is ON (Otherwise ON) and the dark-mode flag turns the store dark",
    async fn(t) {
      const page = await storefront(t, "?user=u_412&env=prod");
      await expect(page.locator(".page")).toHaveAttribute("data-theme", "light");
      await t.step("Eli in prod: light theme, classic home");
      await t.hold(1500);
      await t.step("Click Dev");
      await page.getByRole("radio", { name: "Dev" }).click();
      await expect(page.locator(".page")).toHaveAttribute("data-theme", "dark");
      for (const f of ["new-dashboard", "beta-reports", "dark-mode"]) await expectDebug(page, f, "ON", "no rule matched → Otherwise ON");
      await expect(page.locator('main [data-flag="new-dashboard"]')).toBeVisible();
      await t.spot(debugRow(page, "dark-mode"));
      await t.step("Same user, dev config: all ON via \"Otherwise ON\"; dark-mode ON, so the store is dark");
      await t.hold(3200);
      t.note("prod: light, classic home, all OFF. dev: data-theme=dark, new dashboard + beta report, all three flags ON 'no rule matched → Otherwise ON'.");
    },
  },
  {
    id: "DEMO-LIVE-01", area: "Storefront", title: "Admin changes reach the storefront live without refreshing",
    expected: "Add Eli (u_412) to rule 1 in the admin: the storefront switches within seconds, no reload",
    async fn(t) {
      const { page, left, right } = await stage(t, `${ADMIN}/`, `${DEMO}/?user=u_412&env=prod`);
      await expect(right.locator('main [data-flag="classic-home"]')).toBeVisible();
      await t.step("Right: storefront as Eli (classic home). Left: sign in as admin");
      await login(left, "admin");
      await expand(left, "new-dashboard");
      const box = left.getByRole("combobox", { name: "Rule 1 user IDs" });
      await t.step("Add u_412 to new-dashboard's prod rule 1 and Save");
      await box.pressSequentially("u_412");
      await box.press("Enter");
      const started = Date.now();
      await left.getByRole("button", { name: "Save prod rules" }).click();
      await expect(right.locator('main [data-flag="new-dashboard"]')).toBeVisible({ timeout: 15_000 });
      const seconds = ((Date.now() - started) / 1000).toFixed(1);
      await expectDebug(right, "new-dashboard", "ON", "matched rule 1 (user ID list)");
      await t.spot(right.locator('main [data-flag="new-dashboard"] h1'));
      await t.step(`Storefront switched ${seconds} s after Save, with no reload`);
      await debugRow(right, "new-dashboard").scrollIntoViewIfNeeded();
      await t.spot(debugRow(right, "new-dashboard"));
      await t.hold(3000);
      t.note(`Eli changed from classic home to 'Welcome back, Eli' ${seconds} s after Save (live stream, no reload); debug 'matched rule 1 (user ID list)'.`);
    },
    cleanup: restoreSeed,
  },
  card("SECTION-MCP", 3, section("MCP agent tools and end-to-end", "Cases 13–15")),
  {
    id: "MCP-ROLE-03", area: "MCP and end-to-end", title: "An editor MCP key cannot change production",
    expected: "set_flag_enabled on prod returns isError \"… may not change prod.\"; prod unchanged",
    async fn(t) {
      const ctx = await t.context();
      await routeConsole(ctx);
      const page = await ctx.newPage();
      await page.goto(`${ADMIN}/__qa_console`);
      const call = await bindConsole(page, "qa-editor-agent", "editor");
      await t.step("whoami: an editor key may change dev only");
      const who = await call("whoami", "whoami");
      expect(who.data.role).toBe("EDITOR");
      await t.hold(1500);
      await t.step("get_flag dark-mode: prod is OFF");
      const flag = await call("get_flag dark-mode", "get_flag", { key: "dark-mode" });
      const version = flag.data.environments.prod.version;
      await t.hold(1200);
      await t.step("set_flag_enabled dark-mode prod → true");
      const attempt = await call("set_flag_enabled (prod)", "set_flag_enabled", { key: "dark-mode", environment: "prod", enabled: true, version });
      expect(attempt.isError).toBe(true);
      expect(attempt.text).toMatch(/may not change prod/);
      await t.hold(2200);
      await t.step("get_flag again: prod is still OFF");
      const after = await call("get_flag dark-mode (after)", "get_flag", { key: "dark-mode" });
      expect(after.data.environments.prod.enabled).toBe(false);
      await t.hold(2000);
      t.note(`whoami role EDITOR, changeEnvironments [dev]; set_flag_enabled prod → isError: "${attempt.text}"; prod enabled still false.`);
    },
  },
  {
    id: "MCP-CHG-04", area: "MCP and end-to-end", title: "A stale version causes a conflict rather than overwriting",
    expected: "The second write with the old version is refused; the first write stands",
    async fn(t) {
      const ctx = await t.context();
      await routeConsole(ctx);
      const page = await ctx.newPage();
      await page.goto(`${ADMIN}/__qa_console`);
      const call = await bindConsole(page, "qa-admin-agent", "admin");
      await t.step("get_flag beta-reports: note dev's version");
      const flag = await call("get_flag beta-reports", "get_flag", { key: "beta-reports" });
      const v = flag.data.environments.dev.version;
      await t.hold(1200);
      await t.step(`set_flag_enabled dev → false with version ${v}: accepted`);
      const first = await call(`set_flag_enabled dev → false (version ${v})`, "set_flag_enabled", { key: "beta-reports", environment: "dev", enabled: false, version: v });
      expect(first.isError).toBe(false);
      await t.hold(1200);
      await t.step(`set_flag_enabled dev → true with the old version ${v}: conflict`);
      const stale = await call(`set_flag_enabled dev → true (stale version ${v})`, "set_flag_enabled", { key: "beta-reports", environment: "dev", enabled: true, version: v });
      expect(stale.isError).toBe(true);
      expect(stale.text).toMatch(/changed since you loaded version/);
      await t.hold(2400);
      await t.step("get_flag: dev is still false, the first write stands");
      const after = await call("get_flag beta-reports (after)", "get_flag", { key: "beta-reports" });
      expect(after.data.environments.dev.enabled).toBe(false);
      await t.hold(1800);
      t.note(`First write (version ${v}) accepted; second write with version ${v}: isError "${stale.text}"; dev enabled stays false.`);
    },
    cleanup: restoreSeed,
  },
  {
    id: "E2E-AGENT-ROLLOUT", area: "MCP and end-to-end", title: "An admin MCP agent changes a prod rollout; audit shows key:<name>; storefront updates",
    expected: "set_flag_rules 10% → 40% succeeds; audit \"rollout 10% → 40%\" by key:qa-admin-agent; Eli flips live",
    async fn(t) {
      const { page, right } = await stage(t, `${ADMIN}/__qa_console`, `${DEMO}/?user=u_412&env=prod`);
      await expect(right.locator('main [data-flag="classic-home"]')).toBeVisible();
      const frame = page.frame({ url: /__qa_console/ });
      const call = await bindConsole(frame, "qa-admin-agent", "admin");
      await t.step("Right: Eli (bucket 3573) is outside the 10% rollout. Left: the agent reads the flag");
      const flag = await call("get_flag new-dashboard", "get_flag", { key: "new-dashboard" });
      const prod = flag.data.environments.prod;
      await t.hold(1500);
      await t.step("Agent: set_flag_rules prod, percentage 10% → 40%, with the current version");
      const rules = prod.rules.map((r) => (r.type === "percent" ? { ...r, percent: 40 } : r));
      const started = Date.now();
      const set = await call("set_flag_rules new-dashboard prod (10% → 40%)", "set_flag_rules", { key: "new-dashboard", environment: "prod", rules, otherwise: prod.otherwise, version: prod.version });
      expect(set.isError).toBe(false);
      await expect(right.locator('main [data-flag="new-dashboard"]')).toBeVisible({ timeout: 15_000 });
      const seconds = ((Date.now() - started) / 1000).toFixed(1);
      await expectDebug(right, "new-dashboard", "ON", "matched rule 3 (% rollout)");
      await t.spot(right.locator('main [data-flag="new-dashboard"] h1'));
      await t.step(`Storefront: Eli now in the rollout ("matched rule 3 (% rollout)"), ${seconds} s later, no reload`);
      await t.hold(2200);
      await t.step("Agent: get_audit_log shows the change attributed to the key");
      const audit = await call("get_audit_log new-dashboard prod (latest)", "get_audit_log", { flag: "new-dashboard", environment: "prod", limit: 1 });
      const event = audit.data.events[0];
      expect(event.summary).toBe("rollout 10% → 40%");
      expect(event.actor).toBe("key:qa-admin-agent");
      await t.hold(2000);
      await t.step("Admin Activity → Who: Agents lists \"rollout 10% → 40%\" by key:qa-admin-agent");
      await page.locator("#left").evaluate((f, src) => (f.src = src), `${ADMIN}/`);
      const left = page.frameLocator("#left");
      await login(left, "admin");
      await left.getByRole("button", { name: "Activity" }).click();
      await left.getByLabel("Who").selectOption("key");
      const item = left.locator(".trail-item", { hasText: "rollout 10% → 40%" }).first();
      await expect(item).toContainText("key:qa-admin-agent");
      await t.spot(item);
      await debugRow(right, "new-dashboard").scrollIntoViewIfNeeded();
      await t.spot(debugRow(right, "new-dashboard"));
      await t.hold(3200);
      t.note(`set_flag_rules ok; Eli's storefront switched in ${seconds} s with 'matched rule 3 (% rollout)'; get_audit_log latest = {summary: "rollout 10% → 40%", actor: "key:qa-admin-agent"}; same entry in Activity → Agents.`);
    },
    cleanup: restoreSeed,
  },
  card("SUMMARY", 25, summary),
];

let n = 0;
for (const c of CASES) c.n = c.card ? 0 : ++n;
CASES.forEach((c, i) => {
  c.order = i + 1;
});

// ---------------------------------------------------------------- run

if (process.argv.includes("--reset")) {
  console.log("Resetting the QA stack to seed data…");
  compose("down -v");
  compose("up -d");
}
await waitForHealth();
admin = await apiSession("admin");
await restoreSeed();
for (const k of ((await admin.call("GET", "/api/keys")).body ?? []).filter((k) => k.name.startsWith("qa-") && !k.revokedAt)) await admin.revokeKey(k.id);
for (const [name, role] of [["qa-admin-agent", "ADMIN"], ["qa-editor-agent", "EDITOR"]]) keys[name] = await admin.createKey(name, role);

// Clips are named by position so cards and cases join in order.
const ordered = CASES.map((c) => ({ ...c, n: c.order, caseNo: c.n }));
const runner = new Runner(ordered, { out: OUT, width: W, height: H, scale: 1, zoom: ZOOM, big: true, slowMo: 180, verdictMs: 2000 });
const results = await runner.run();
for (const k of Object.values(keys)) await admin.revokeKey(k.id);
await admin.dispose();

const caseResults = results.filter((r) => !r.card).map((r) => ({ ...r, caseNo: ordered.find((c) => c.id === r.id).caseNo }));
writeFileSync(join(OUT, "results.json"), JSON.stringify({ finishedAt: new Date().toISOString(), results }, null, 2));
const failed = caseResults.filter((r) => r.status === "FAIL");
console.log(`\n${caseResults.length - failed.length}/${caseResults.length} passed${failed.length ? `; FAILED: ${failed.map((f) => f.id).join(", ")}` : ""}`);

// ---------------------------------------------------------------- video

const raw = join(OUT, "raw");
const clips = readdirSync(raw).filter((f) => f.endsWith(".webm")).sort();
const docker = (script) =>
  execFileSync("docker", ["run", "--rm", "-v", `${raw}:/raw`, "-w", "/raw", "alpine:3.20", "sh", "-c", `apk add --no-cache ffmpeg >/dev/null && ${script}`], {
    stdio: ["ignore", "pipe", "inherit"],
    maxBuffer: 1 << 24,
  }).toString();
const steps = [
  "mkdir -p enc",
  ...clips.map((c) => `ffmpeg -y -loglevel error -i ${c} -vf "scale=1920:1080:flags=lanczos,fps=30,format=yuv420p" -c:v libx264 -preset slow -crf 18 -tune stillimage -an enc/${c.replace(".webm", ".mp4")}`),
  `printf "${clips.map((c) => `file '${c.replace(".webm", ".mp4")}'`).join("\\n")}\\n" > enc/list.txt`,
  "ffmpeg -y -loglevel error -f concat -safe 0 -i enc/list.txt -c copy -movflags +faststart enc/top-15-demo.mp4",
  `for c in ${clips.map((c) => c.replace(".webm", "")).join(" ")}; do printf "%s " $c; ffprobe -v error -show_entries format=duration -of csv=p=0 enc/$c.mp4; done`,
  "printf 'FINAL '; ffprobe -v error -select_streams v:0 -show_entries stream=width,height,codec_name,r_frame_rate -show_entries format=duration -of compact=p=0:nk=1 enc/top-15-demo.mp4 | tr '\\n' ' '",
];
console.log(`Encoding ${clips.length} clips at 1080p…`);
const out = docker(steps.join(" && ")).trim().split("\n");
const finalLine = out.find((l) => l.startsWith("FINAL")) ?? "";
const [codec, width, height, fps, duration] = finalLine.replace("FINAL ", "").trim().split(/[|\s]+/);
let clock = 0;
const starts = {};
for (const line of out.filter((l) => !l.startsWith("FINAL"))) {
  const [name, d] = line.trim().split(" ");
  const order = Number(name.slice(0, 2));
  if (!(order in starts)) starts[order] = clock;
  clock += Number(d);
}
copyFileSync(join(raw, "enc", "top-15-demo.mp4"), VIDEO);
const seconds = Number(duration);
console.log(`top-15-demo.mp4: ${codec} ${width}x${height} @ ${fps}, ${seconds.toFixed(1)} s`);

// ---------------------------------------------------------------- report

const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const at = (id) => mmss(starts[ordered.find((c) => c.id === id).order] ?? 0);
const md = (s) => s.replace(/</g, "&lt;");
const commit = execFileSync("git", ["rev-parse", "--short", "HEAD"]).toString().trim();
const passed = caseResults.length - failed.length;
const lines = [
  "# Top 15 QA cases: video report",
  "",
  `**Result: ${passed} of ${caseResults.length} passed.** Video: [top-15-demo.mp4](top-15-demo.mp4), **${mmss(seconds)}** (${seconds.toFixed(1)} s, under 10:00), **${width}×${height}**, ${codec.toUpperCase()}, ${fps.replace("/1", "")} fps.`,
  "",
  `Recorded ${new Date().toISOString().slice(0, 10)} on build \`${commit}\` against a separate copy of the stack (compose project \`ff-qa\`, ports 6173/6174) reset to seed data. No product source or configuration was changed for this recording. Runner: [qa/top15.mjs](../top15.mjs).`,
  "",
  "## Video structure",
  "",
  `| Time | Section |`,
  `|---|---|`,
  `| ${mmss(starts[ordered.find((c) => c.id === "INTRO").order])} | Architecture and the 15 cases |`,
  `| ${mmss(starts[ordered.find((c) => c.id === "SECTION-ADMIN").order])} | Admin dashboard, cases 1–6 |`,
  `| ${mmss(starts[ordered.find((c) => c.id === "SECTION-DEMO").order])} | Demo storefront, cases 7–12 |`,
  `| ${mmss(starts[ordered.find((c) => c.id === "SECTION-MCP").order])} | MCP agent tools and end-to-end, cases 13–15 |`,
  `| ${mmss(starts[ordered.find((c) => c.id === "SUMMARY").order])} | Summary: ${passed}/${caseResults.length} passed (25 s) |`,
  "",
  "## Cases",
  "",
  "| # | Case | Result | Video | Observed evidence |",
  "|---|---|---|---|---|",
  ...caseResults.map((r) => `| ${r.caseNo} | ${md(r.title)} | ${r.status === "PASS" ? "✅ PASS" : "❌ FAIL"} | ${at(r.id)} | ${md(r.notes.join(" ") || r.error || "")} |`),
  "",
];
if (failed.length) {
  lines.push("## Failures (reported, not fixed)", "", ...failed.map((f) => `- **${f.caseNo}. ${md(f.title)}**: ${md(f.error ?? "")}`), "");
}
lines.push(
  "## How each case was checked",
  "",
  "Every PASS is an assertion in the runner, not a visual judgement: the UI state (roles, labels, debug-panel text, `data-flag` blocks, theme attribute), the server state read back through the API, and the MCP responses. The caption bar shows the case, the current action, the expected result and the verdict; highlighted outlines mark the evidence on screen.",
  "",
  "## Credentials",
  "",
  "- Passwords are typed into password fields, so the video shows dots. The logins are the fictional seed accounts.",
  "- The new API key's token and its ready-to-paste config are blurred (case 6), as is the key-prefix column of the keys table.",
  "- The MCP console never renders the token: it shows `Authorization: Bearer ffk_••••••••`, and any token-shaped text in a response would be masked.",
  "- No cookies or headers are shown. Every key created for the recording was revoked at the end.",
  "",
  "## Limitations",
  "",
  "- **Captions, no voice narration.** Each case states its action, expected result and PASS/FAIL on screen.",
  "- **The MCP \"agent\" is scripted.** Cases 13–15 send the exact MCP tool calls an agent sends, live from the browser to `/mcp`, but no LLM chose them.",
  "- **Highlights and the 125% zoom are added at runtime** (an outline on the evidence, a CSS zoom on the page); the product's code and styles are untouched.",
  "- **Seed data and a separate stack:** results reflect the fictional seed configuration on a fresh database; each case restores the seed state afterwards so cases don't depend on each other.",
  "- **Live timings are local:** admin → storefront propagation was measured on one machine over the local stream.",
  "- **1080p:** recorded at a true 1920×1080 (Playwright screencast), with the app pages drawn at 125% through a runtime CSS zoom so UI text stays readable, then re-encoded to H.264 (CRF 18).",
  "",
  "## Reproduce",
  "",
  "```bash",
  "ADMIN_PORT=6173 DEMO_PORT=6174 BACKEND_PORT=9080 POSTGRES_PORT=6433 docker compose -p ff-qa up -d --build",
  "cd qa && npm ci && node top15.mjs --reset",
  "```",
  "",
);
writeFileSync(REPORT, lines.join("\n"));
console.log(`Report: ${REPORT}`);
if (seconds >= 600) console.log("WARNING: video is 10:00 or longer");
process.exit(failed.length ? 1 : 0);
