// Joins the per-test clips from the last run into one MP4 (H.264, 1600x900) with a title card and a results card,
// and records where each test starts so the report can point into the video.
//   node make-video.mjs
// Needs Docker: ffmpeg runs in a throwaway Alpine container (official Alpine packages), so nothing is installed locally.
import { chromium } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const OUT = new URL("./results/", import.meta.url).pathname;
const RAW = join(OUT, "raw");
const WORK = join(RAW, "video-work");
const { finishedAt, results } = JSON.parse(readFileSync(join(OUT, "results.json"), "utf8"));
const passed = results.filter((r) => r.status === "PASS").length;
const commit = execFileSync("git", ["rev-parse", "--short", "HEAD"]).toString().trim();

rmSync(WORK, { recursive: true, force: true });
mkdirSync(WORK, { recursive: true });

// ---- title and results cards, rendered as images
const card = (body) => `<!doctype html><meta charset="utf-8"><body style="margin:0;width:1600px;height:900px;display:flex;
  flex-direction:column;justify-content:center;padding:0 120px;box-sizing:border-box;background:#0d1117;color:#f0f6fc;
  font-family:-apple-system,'Segoe UI',Inter,sans-serif">${body}</body>`;
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const areas = [...new Set(results.map((r) => r.area))];
const pill = (s) => `<span style="font-weight:700;padding:2px 10px;border-radius:999px;color:#fff;background:${s === "PASS" ? "#238636" : "#da3633"}">${s}</span>`;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
await page.setContent(card(`
  <p style="margin:0;color:#9198a1;font-size:22px">Feature Flags · QA execution</p>
  <h1 style="margin:8px 0 24px;font-size:56px">Top 25 test cases, run end to end</h1>
  <p style="margin:0 0 8px;font-size:24px">${pill(passed === results.length ? "PASS" : "FAIL")} &nbsp;${passed} of ${results.length} passed</p>
  <p style="margin:0;color:#9198a1;font-size:20px">${areas.map((a) => `${a}: ${results.filter((r) => r.area === a).length}`).join(" · ")}</p>
  <p style="margin:32px 0 0;color:#9198a1;font-size:18px">Admin dashboard, demo storefront and MCP server · Chromium via Playwright · fresh seed data · build ${commit} · ${finishedAt.slice(0, 10)}</p>`));
await page.screenshot({ path: join(WORK, "intro.png") });
await page.setContent(card(`
  <h1 style="margin:0 0 16px;font-size:36px">Results: ${passed} of ${results.length} passed</h1>
  <div style="columns:2;column-gap:48px;font-size:17px;line-height:1.9">
  ${results.map((r) => `<div>${pill(r.status)} &nbsp;<b>#${r.n} ${r.id}</b> <span style="color:#9198a1">${esc(r.title)}</span></div>`).join("")}
  </div>`));
await page.screenshot({ path: join(WORK, "outro.png") });
await browser.close();

// ---- the clips, in run order
const clips = readdirSync(RAW).filter((f) => f.endsWith(".webm")).sort();

const ffmpeg = (script) =>
  execFileSync("docker", ["run", "--rm", "-v", `${RAW}:/raw`, "-w", "/raw", "alpine:3.20", "sh", "-c",
    `apk add --no-cache ffmpeg >/dev/null && ${script}`], { stdio: ["ignore", "pipe", "inherit"] }).toString();

// Every clip becomes 1600x900, 30 fps, H.264 (smaller clips are scaled to fit and centred on the dark background),
// then all are joined. Durations are read back to place each test in the final video.
const norm = "scale=1600:900:force_original_aspect_ratio=decrease,pad=1600:900:(ow-iw)/2:(oh-ih)/2:color=0x0d1117,fps=30,format=yuv420p";
const enc = "-c:v libx264 -preset veryfast -crf 26 -an";
const parts = ["intro", ...clips.map((c) => c.replace(".webm", "")), "outro"];
const steps = [
  `ffmpeg -y -loglevel error -loop 1 -t 4 -i video-work/intro.png -vf "${norm}" ${enc} video-work/intro.mp4`,
  `ffmpeg -y -loglevel error -loop 1 -t 6 -i video-work/outro.png -vf "${norm}" ${enc} video-work/outro.mp4`,
  ...clips.map((c) => `ffmpeg -y -loglevel error -i ${c} -vf "${norm}" ${enc} video-work/${c.replace(".webm", ".mp4")}`),
  `printf "${parts.map((p) => `file '${p}.mp4'`).join("\\n")}\\n" > video-work/list.txt`,
  "ffmpeg -y -loglevel error -f concat -safe 0 -i video-work/list.txt -c copy -movflags +faststart video-work/qa-run.mp4",
  `for p in ${parts.join(" ")}; do printf "%s " $p; ffprobe -v error -show_entries format=duration -of csv=p=0 video-work/$p.mp4; done`,
];
console.log(`Encoding ${clips.length} clips…`);
const durations = ffmpeg(steps.join(" && "))
  .trim()
  .split("\n")
  .map((line) => line.trim().split(" "))
  .map(([name, d]) => ({ name, seconds: Number(d) }));

// Where each test starts: the first clip whose name begins with its number.
let t = 0;
const starts = {};
for (const { name, seconds } of durations) {
  const n = Number(name.slice(0, 2));
  if (Number.isFinite(n) && !(n in starts)) starts[n] = t;
  t += seconds;
}
execFileSync("cp", [join(WORK, "qa-run.mp4"), join(OUT, "qa-run.mp4")]);
writeFileSync(join(OUT, "video-index.json"), JSON.stringify({ totalSeconds: t, starts }, null, 2));
console.log(`results/qa-run.mp4: ${Math.round(t)} s`);
