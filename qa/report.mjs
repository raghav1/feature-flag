// Builds results/REPORT.md from the last run (results.json, video-index.json) and history.md.
//   node report.mjs
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const OUT = new URL("./results/", import.meta.url).pathname;
const { finishedAt, results } = JSON.parse(readFileSync(join(OUT, "results.json"), "utf8"));
const video = existsSync(join(OUT, "video-index.json")) ? JSON.parse(readFileSync(join(OUT, "video-index.json"), "utf8")) : null;
const history = readFileSync(new URL("./history.md", import.meta.url), "utf8").trim();
const commit = execFileSync("git", ["rev-parse", "--short", "HEAD"]).toString().trim();

const passed = results.filter((r) => r.status === "PASS").length;
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const at = (r) => (video?.starts?.[r.n] !== undefined ? mmss(video.starts[r.n]) : "–");
const badge = (s) => (s === "PASS" ? "✅ PASS" : "❌ FAIL");
const anchor = (r) => `${r.n}-${r.id}`.toLowerCase();
const areas = [...new Set(results.map((r) => r.area))];
/** Titles may hold "<name>"; Markdown would swallow it as an HTML tag. */
const md = (s) => s.replace(/</g, "&lt;");

const lines = [
  "# QA execution report: top 25 test cases",
  "",
  `**Result: ${passed} of ${results.length} passed.** Run finished ${finishedAt.replace("T", " ").slice(0, 16)} UTC on build \`${commit}\`.`,
  "",
  "The 25 cases come from [docs/qa-top-25.md](../../docs/qa-top-25.md). Each was executed in Chromium by [qa/run.mjs](../run.mjs) against a",
  "separate copy of the stack (compose project `ff-qa`, ports 6173/6174), reset to seed data before the run. Every case was",
  "recorded; the clips are joined in **[qa-run.mp4](qa-run.mp4)**" + (video ? ` (${mmss(video.totalSeconds)})` : "") + ", where a caption bar shows the case, the current step and the",
  "verdict. Screenshots are in [screenshots/](screenshots/).",
  "",
  "| Area | Passed |",
  "|---|---|",
  ...areas.map((a) => {
    const rs = results.filter((r) => r.area === a);
    return `| ${a} | ${rs.filter((r) => r.status === "PASS").length} / ${rs.length} |`;
  }),
  `| **Total** | **${passed} / ${results.length}** |`,
  "",
  "## Results",
  "",
  "| # | ID | Test | Result | Video | Evidence |",
  "|---|---|---|---|---|---|",
  ...results.map((r) => `| ${r.n} | [${r.id}](#${anchor(r)}) | ${md(r.title)} | ${badge(r.status)} | ${at(r)} | ${r.screenshots.length} screenshot${r.screenshots.length === 1 ? "" : "s"} |`),
  "",
  history,
  "",
  "## Details",
  "",
];

for (const area of areas) {
  lines.push(`### ${area}`, "");
  for (const r of results.filter((x) => x.area === area)) {
    lines.push(`<a id="${anchor(r)}"></a>`, "", `#### ${r.n}. ${r.id}: ${md(r.title)}`, "");
    lines.push(`- **Result:** ${badge(r.status)} in ${(r.durationMs / 1000).toFixed(1)} s${video ? `; in the video at ${at(r)}` : ""}`);
    lines.push(`- **Expected:** ${r.expected}`);
    for (const n of r.notes) lines.push(`- **Observed:** ${n}`);
    if (r.error) lines.push("- **Failure:**", "", "```", r.error, "```");
    lines.push("");
    for (const s of r.screenshots) lines.push(`![${r.id} ${s}](screenshots/${s})`, "");
  }
}

lines.push(
  "## Reproduce",
  "",
  "Needs Docker and Node 20+. From the repo root:",
  "",
  "```bash",
  "ADMIN_PORT=6173 DEMO_PORT=6174 BACKEND_PORT=9080 POSTGRES_PORT=6433 docker compose -p ff-qa up -d --build",
  "cd qa && npm ci && npx playwright install chromium",
  "node run.mjs --reset      # all 25; or name cases: node run.mjs ADM-RULE-04 E2E-02",
  "node make-video.mjs       # joins the clips into results/qa-run.mp4 (ffmpeg runs in a Docker container)",
  "node report.mjs           # writes this report",
  "```",
  "",
  "The run stops and restarts the QA copy's backend (outage cases), so it never touches a stack on the default ports.",
  "",
);

writeFileSync(join(OUT, "REPORT.md"), lines.join("\n"));
console.log(`results/REPORT.md: ${passed}/${results.length} passed`);
