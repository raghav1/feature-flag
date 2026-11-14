// Test harness: one recorded browser context per test case, a caption bar on every page (test, step, result),
// screenshots, MCP / API helpers, and the results file the report is built from.
import { chromium, expect, request } from "@playwright/test";
import { execSync } from "node:child_process";
import { mkdirSync, renameSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export { expect };

export const ADMIN = process.env.QA_ADMIN_URL ?? "http://localhost:6173";
export const DEMO = process.env.QA_DEMO_URL ?? "http://localhost:6174";
export const COMPOSE_PROJECT = process.env.QA_COMPOSE_PROJECT ?? "ff-qa";
/** Fictional dev logins from the seed migration (V2__seed.sql); override with QA_<USER>_PASSWORD. */
const PASSWORDS = {
  admin: process.env.QA_ADMIN_PASSWORD ?? "admin-pass",
  editor: process.env.QA_EDITOR_PASSWORD ?? "editor-pass",
  viewer: process.env.QA_VIEWER_PASSWORD ?? "viewer-pass",
};
/** The compose defaults (fictional); the demo bundle is built with the same values. */
export const SDK_KEYS = { dev: "dev-sdk-key", prod: "prod-sdk-key" };

export const OUT = new URL("./results/", import.meta.url).pathname;
const RAW = join(OUT, "raw");
const SHOTS = join(OUT, "screenshots");

const WIDTH = 1280;
const HEIGHT = 800;

// ---------------------------------------------------------------- caption bar

/** Runs in every page: a fixed caption at the bottom saying which test is running and what it's doing. */
function captionScript(meta) {
  if (window.top !== window || meta.card) return;
  const render = () => {
    let bar = document.getElementById("__qa_caption");
    if (!bar) {
      if (!document.body) return;
      bar = document.createElement("div");
      bar.id = "__qa_caption";
      bar.setAttribute("aria-hidden", "true");
      bar.style.cssText =
        "position:fixed;left:12px;right:12px;bottom:12px;z-index:2147483647;pointer-events:none;display:flex;" +
        "align-items:center;gap:12px;padding:8px 12px;border-radius:8px;background:rgba(13,17,23,.92);color:#f0f6fc;" +
        "font:13px/1.4 -apple-system,'Segoe UI',Inter,sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.35)";
      document.body.appendChild(bar);
    }
    let state = {};
    try {
      state = JSON.parse(sessionStorage.getItem("__qa") || "{}");
    } catch {}
    const status = state.status || "RUNNING";
    const colour = status === "PASS" ? "#238636" : status === "FAIL" ? "#da3633" : "#1f6feb";
    if (meta.big) {
      // Same on-screen size whether or not the page is zoomed for the recording.
      const zoom = parseFloat(getComputedStyle(document.documentElement).zoom) || 1;
      bar.style.font = `${20 / zoom}px/1.45 -apple-system,'Segoe UI',Inter,sans-serif`;
      bar.style.padding = "10px 16px";
      bar.style.alignItems = "flex-start";
      bar.innerHTML =
        `<div style="flex:1;min-width:0">` +
        `<div><b>Case ${meta.n}/${meta.total}: ${meta.title}</b></div>` +
        `<div style="opacity:.85"><b style="color:#9198a1">Action</b>&nbsp; ${state.step || "…"}</div>` +
        `<div style="opacity:.85"><b style="color:#9198a1">Expected</b>&nbsp; ${meta.expected}</div></div>` +
        `<span style="align-self:center;background:${colour};color:#fff;font-weight:700;font-size:18px;padding:4px 14px;border-radius:999px">${status}</span>`;
      return;
    }
    bar.innerHTML =
      `<span style="font-weight:700;white-space:nowrap">#${meta.n} ${meta.id}</span>` +
      `<span style="opacity:.85;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${meta.title}</span>` +
      `<span style="flex:1;opacity:.7;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-align:right">${state.step || ""}</span>` +
      `<span style="background:${colour};color:#fff;font-weight:700;padding:2px 8px;border-radius:999px">${status}</span>`;
  };
  window.__qaRender = render;
  document.addEventListener("DOMContentLoaded", render);
  setInterval(render, 250);
}

// ---------------------------------------------------------------- API helpers

/** A logged-in dashboard session (cookie + CSRF), for setup, restores and the direct-API checks. */
export async function apiSession(username) {
  const ctx = await request.newContext({ baseURL: ADMIN });
  await ctx.get("/api/auth/me");
  const xsrf = async () => (await ctx.storageState()).cookies.find((c) => c.name === "XSRF-TOKEN")?.value ?? "";
  const signIn = async () => {
    const res = await ctx.post("/api/auth/login", {
      data: { username, password: PASSWORDS[username] },
      headers: { "X-XSRF-TOKEN": await xsrf() },
    });
    if (!res.ok()) throw new Error(`login as ${username} failed: ${res.status()}`);
  };
  await signIn();
  const call = async (method, path, data) => {
    let res = await ctx.fetch(path, { method, data, headers: { "X-XSRF-TOKEN": await xsrf() } });
    // Sessions live in the backend's memory, so the outage tests' restart ends them: sign in again once.
    if (res.status() === 401) {
      await ctx.get("/api/auth/me");
      await signIn();
      res = await ctx.fetch(path, { method, data, headers: { "X-XSRF-TOKEN": await xsrf() } });
    }
    let body = null;
    try {
      body = await res.json();
    } catch {}
    return { status: res.status(), body };
  };
  return {
    call,
    flag: async (key) => (await call("GET", `/api/flags/${key}`)).body,
    async setRules(key, env, rules, otherwise) {
      const version = (await this.flag(key)).environments[env].version;
      const r = await call("PUT", `/api/flags/${key}/envs/${env}/rules`, { rules, otherwise, version });
      if (r.status !== 200) throw new Error(`setRules ${key}/${env}: ${r.status} ${JSON.stringify(r.body)}`);
      return r.body;
    },
    async setEnabled(key, env, enabled) {
      const version = (await this.flag(key)).environments[env].version;
      const r = await call("PUT", `/api/flags/${key}/envs/${env}/enabled`, { enabled, version });
      if (r.status !== 200) throw new Error(`setEnabled ${key}/${env}: ${r.status}`);
      return r.body;
    },
    async createKey(name, role) {
      const r = await call("POST", "/api/keys", { name, role, expiresInDays: 7 });
      if (r.status !== 201) throw new Error(`create key ${name}: ${r.status} ${JSON.stringify(r.body)}`);
      return { id: r.body.key.id, token: r.body.token };
    },
    revokeKey: (id) => call("DELETE", `/api/keys/${id}`),
    audit: async (query) => (await call("GET", `/api/audit?${new URLSearchParams(query)}`)).body,
    dispose: () => ctx.dispose(),
  };
}

/** One MCP tool call over Streamable HTTP, exactly as an agent's client sends it. */
export async function mcp(token, name, args = {}) {
  const res = await fetch(`${ADMIN}/mcp`, {
    method: "POST",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: name === "tools/list" ? "tools/list" : "tools/call",
      params: name === "tools/list" ? {} : { name, arguments: args } }),
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}
  const result = json?.result;
  return {
    http: res.status,
    isError: result?.isError === true,
    text: result?.content?.[0]?.text ?? text,
    data: result?.structuredContent ?? result,
  };
}

/** /api/evaluate with an SDK key, as the storefront's SDK calls it. */
export async function evaluate(env, userId, attributes = {}) {
  const res = await fetch(`${DEMO}/api/evaluate`, {
    method: "POST",
    headers: { "X-SDK-Key": SDK_KEYS[env], "Content-Type": "application/json" },
    body: JSON.stringify({ context: { ...(userId ? { userId } : {}), attributes } }),
  });
  return { status: res.status, text: await res.clone().text(), body: await res.json().catch(() => null) };
}

export function compose(args) {
  // The QA copy runs on its own ports so it never touches the developer's own stack.
  const env = { ...process.env, ADMIN_PORT: "6173", DEMO_PORT: "6174", BACKEND_PORT: "9080", POSTGRES_PORT: "6433" };
  return execSync(`docker compose -p ${COMPOSE_PROJECT} ${args}`, { cwd: new URL("..", import.meta.url).pathname, stdio: "pipe", env }).toString();
}

export async function waitForHealth(timeoutMs = 120_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(`${ADMIN}/api/environments`);
      if (r.status === 401 || r.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("backend did not come back");
}

/** Hide token-shaped text in a page before it's recorded or captured. */
export const MASK_CSS = ".token, .new-key pre { filter: blur(6px); }";
export const mask = (s) => String(s).replace(/ffk_[A-Za-z0-9_-]+/g, "ffk_••••••••");

// ---------------------------------------------------------------- runner

export class Runner {
  /**
   * options: out (folder for raw clips and screenshots), width/height (video size), scale (device pixel ratio:
   * the page lays out at width/scale CSS pixels and is recorded sharp at full size), big (large captions with the
   * expected result), slowMo, verdictMs (how long the verdict stays on screen).
   */
  constructor(cases, options = {}) {
    this.cases = cases;
    this.results = [];
    this.opts = { width: WIDTH, height: HEIGHT, scale: 1, big: false, slowMo: Number(process.env.QA_SLOWMO ?? 120), verdictMs: 1200, ...options };
    this.raw = options.out ? join(options.out, "raw") : RAW;
    this.shots = options.out ? join(options.out, "screenshots") : SHOTS;
  }

  async run(only) {
    rmSync(this.raw, { recursive: true, force: true });
    mkdirSync(this.raw, { recursive: true });
    mkdirSync(this.shots, { recursive: true });
    this.browser = await chromium.launch({ slowMo: this.opts.slowMo });
    for (const c of this.cases) {
      if (only && !only.includes(c.id)) continue;
      await this.runCase(c);
    }
    await this.browser.close();
    return this.results;
  }

  async runCase(c) {
    const started = Date.now();
    const contexts = [];
    const shots = [];
    const notes = [];
    const esc = (x) => String(x ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;");
    const meta = { n: c.caseNo ?? c.n, id: c.id, title: esc(c.title), expected: esc(c.expected), big: this.opts.big, card: !!c.card, total: this.cases.filter((x) => !x.card).length };
    const t = {
      results: this.results,
      notes,
      note: (s) => notes.push(s),
      /** A recorded browser context with the caption bar. */
      context: async (opts = {}) => {
        const width = opts.width ?? this.opts.width;
        const height = opts.height ?? this.opts.height;
        const scale = opts.scale ?? this.opts.scale;
        const ctx = await this.browser.newContext({
          viewport: { width: Math.round(width / scale), height: Math.round(height / scale) },
          deviceScaleFactor: scale,
          recordVideo: { dir: join(this.raw, `${c.id}-${contexts.length}`), size: { width, height } },
          ...(opts.options ?? {}),
        });
        ctx.setDefaultTimeout(15_000);
        if (this.opts.zoom && this.opts.zoom !== 1) {
          // Enlarge the app's pages for a readable recording (runtime CSS only). The runner's own pages
          // (/__qa_*, set content) are designed at full size and skip it.
          await ctx.addInitScript((z) => {
            if (location.protocol === "about:" || location.pathname.startsWith("/__qa_")) return;
            const add = () => {
              const st = document.createElement("style");
              st.textContent = `html { zoom: ${z}; }`;
              (document.head || document.documentElement).appendChild(st);
            };
            if (document.documentElement) add();
            else document.addEventListener("DOMContentLoaded", add);
          }, this.opts.zoom);
        }
        await ctx.addInitScript(captionScript, meta);
        contexts.push(ctx);
        return ctx;
      },
      page: async (opts) => (await t.context(opts)).newPage(),
      /** Pause so a viewer can read what's on screen. */
      hold: (ms = 1500) => new Promise((r) => setTimeout(r, ms)),
      /** Outline an element on the recording (runtime styling only; the product is untouched). */
      spot: async (locator) => {
        await locator.first().scrollIntoViewIfNeeded().catch(() => {});
        await locator.first().evaluate((el) => {
          el.style.outline = "3px solid #bf3989";
          el.style.outlineOffset = "3px";
          el.style.borderRadius = el.style.borderRadius || "4px";
        });
      },
      step: async (text) => {
        t.currentStep = text;
        for (const ctx of contexts) {
          for (const p of ctx.pages()) {
            await p
              .evaluate((s) => {
                const st = JSON.parse(sessionStorage.getItem("__qa") || "{}");
                st.step = s;
                sessionStorage.setItem("__qa", JSON.stringify(st));
                window.__qaRender?.();
              }, text)
              .catch(() => {});
          }
        }
      },
      shot: async (page, name, opts = {}) => {
        const file = `${String(c.n).padStart(2, "0")}-${c.id}-${name}.png`;
        // Evidence pages (set with setContent) are captured whole; app pages as the viewer sees them.
        await page.screenshot({ path: join(this.shots, file), fullPage: page.url() === "about:blank", ...opts });
        shots.push(file);
      },
      /** Show request/response evidence (API, MCP) as a page, so it's on the video and in a screenshot. */
      evidence: async (page, heading, rows) => {
        const esc = (s) => mask(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
        const html = `<!doctype html><meta charset="utf-8"><title>${esc(heading)}</title>
          <body style="margin:0;padding:24px 24px 80px;font:14px/1.5 -apple-system,'Segoe UI',Inter,sans-serif;background:#f6f8fa;color:#1f2328">
          <h1 style="font-size:20px;margin:0 0 4px">${esc(heading)}</h1>
          <p style="margin:0 0 16px;color:#59636e">${esc(c.id)} · evidence captured by the QA runner</p>
          ${rows
            .map(
              (r) => `<section style="background:#fff;border:1px solid #d1d9e0;border-radius:6px;margin:0 0 12px;overflow:hidden">
              <div style="display:flex;gap:8px;align-items:center;padding:8px 12px;border-bottom:1px solid #e4e8ec;background:#f6f8fa">
                <strong style="flex:1">${esc(r.label)}</strong>
                ${r.ok === undefined ? "" : `<span style="font-weight:700;padding:0 8px;border-radius:999px;color:#fff;background:${r.ok ? "#1f883d" : "#cf222e"}">${r.ok ? "as expected" : "unexpected"}</span>`}
              </div>
              ${r.request ? `<pre style="margin:0;padding:8px 12px;white-space:pre-wrap;color:#59636e;border-bottom:1px solid #e4e8ec">${esc(r.request)}</pre>` : ""}
              <pre style="margin:0;padding:8px 12px;white-space:pre-wrap">${esc(r.response)}</pre>
            </section>`,
            )
            .join("")}
          </body>`;
        await page.setContent(html);
        await page.evaluate(() => window.__qaRender?.());
      },
    };

    let status = "PASS";
    let error = null;
    process.stdout.write(`#${c.n} ${c.id} ${c.title} … `);
    try {
      await c.fn(t);
    } catch (e) {
      status = "FAIL";
      error = `${t.currentStep ? `At step "${t.currentStep}": ` : ""}${e.message.split("\n").slice(0, 6).join("\n")}`;
      for (const ctx of contexts) {
        const p = ctx.pages().at(-1);
        if (p) await t.shot(p, "failure").catch(() => {});
      }
    }
    // Show the verdict on the recording.
    for (const ctx of contexts) {
      for (const p of ctx.pages()) {
        await p
          .evaluate((s) => {
            const st = JSON.parse(sessionStorage.getItem("__qa") || "{}");
            st.status = s;
            sessionStorage.setItem("__qa", JSON.stringify(st));
            window.__qaRender?.();
          }, status)
          .catch(() => {});
      }
    }
    await new Promise((r) => setTimeout(r, this.opts.verdictMs));
    const videos = [];
    for (const [i, ctx] of contexts.entries()) {
      const pages = ctx.pages();
      await ctx.close();
      for (const [j, p] of pages.entries()) {
        const v = p.video();
        if (!v) continue;
        const target = join(this.raw, `${String(c.n).padStart(2, "0")}-${c.id}-${i}${j ? `-${j}` : ""}.webm`);
        const src = await v.path();
        if (existsSync(src)) {
          renameSync(src, target);
          videos.push(target);
        }
      }
    }
    if (c.cleanup) await c.cleanup().catch((e) => notes.push(`cleanup failed: ${e.message}`));
    const durationMs = Date.now() - started;
    console.log(`${status} (${(durationMs / 1000).toFixed(1)} s)${error ? `\n    ${error.split("\n")[0]}` : ""}`);
    // File names only: absolute paths would leak the local home directory into the committed results.
    this.results.push({ card: !!c.card, n: c.n, id: c.id, area: c.area, title: c.title, expected: c.expected, status, error, notes, durationMs, screenshots: shots,
      videos: videos.map((v) => v.split("/").at(-1)) });
  }
}

export function writeResults(results, file = join(OUT, "results.json")) {
  writeFileSync(file, JSON.stringify({ finishedAt: new Date().toISOString(), results }, null, 2));
}
