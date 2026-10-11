#!/usr/bin/env node
// Compare two build-variant outputs and write a markdown report (never fails the job).
//
//   node compare.mjs <out/base> <out/head> <reportDir>
//
// Report: report.md (with {{IMG_BASE}} placeholders), img/*.png, files.diff

import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { spawnSync } from "node:child_process";
import { chromium } from "playwright";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";

const [baseOut, headOut, reportDir] = process.argv.slice(2).map((p) => path.resolve(p));
const MAX_PAGES = Number(process.env.MAX_PAGES || 12);
const WARN_PCT = Number(process.env.WARN_PCT || 0.05); // % of pixels
const VIEWPORTS = [
  { name: "desktop", width: 1280, height: 800 },
  { name: "mobile", width: 390, height: 844 },
];

fs.rmSync(reportDir, { recursive: true, force: true });
fs.mkdirSync(path.join(reportDir, "img"), { recursive: true });

const exists = fs.existsSync;
function walk(dir) {
  if (!exists(dir)) return [];
  const out = [];
  const rec = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) rec(p);
      else out.push(path.relative(dir, p).split(path.sep).join("/"));
    }
  };
  rec(dir);
  return out.sort();
}
const readStatus = (o) => {
  try {
    return JSON.parse(fs.readFileSync(path.join(o, "status.json"), "utf8"));
  } catch {
    return { ok: false, failedStep: "no status.json", log: "" };
  }
};
const baseStatus = readStatus(baseOut);
const headStatus = readStatus(headOut);

// ---------------------------------------------------------------- generated files
const cwd = path.dirname(baseOut); // out/ — so git shows short relative paths
const rel = (p) => path.relative(cwd, p);
function gitDiff(a, b) {
  const r = spawnSync("git", ["diff", "--no-index", "--no-color", "--unified=2", "--", a, b], {
    cwd,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return r.stdout || "";
}
const baseFiles = walk(path.join(baseOut, "files"));
const headFiles = walk(path.join(headOut, "files"));
const fileChanges = [];
for (const f of [...new Set([...baseFiles, ...headFiles])].sort()) {
  const a = path.join(baseOut, "files", f);
  const b = path.join(headOut, "files", f);
  const inA = exists(a), inB = exists(b);
  if (inA && inB && fs.readFileSync(a).equals(fs.readFileSync(b))) continue;
  const diff = gitDiff(inA ? rel(a) : "/dev/null", inB ? rel(b) : "/dev/null");
  const lines = diff.split("\n");
  fileChanges.push({
    f,
    kind: !inA ? "added" : !inB ? "removed" : "modified",
    plus: lines.filter((l) => l.startsWith("+") && !l.startsWith("+++")).length,
    minus: lines.filter((l) => l.startsWith("-") && !l.startsWith("---")).length,
    diff,
  });
}
fs.writeFileSync(path.join(reportDir, "files.diff"), fileChanges.map((c) => c.diff).join("\n"));

// ---------------------------------------------------------------- screenshots
const MIME = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".woff2": "font/woff2", ".ico": "image/x-icon", ".xml": "application/xml", ".txt": "text/plain", ".webmanifest": "application/manifest+json" };
function serve(root) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const p = decodeURIComponent(new URL(req.url, "http://x").pathname);
      const f = path.join(root, p);
      const hit = [f, f + ".html", path.join(f, "index.html")].find((c) => c.startsWith(root) && exists(c) && fs.statSync(c).isFile());
      if (!hit) {
        res.statusCode = 404;
        const nf = path.join(root, "404.html");
        res.setHeader("content-type", "text/html");
        return res.end(exists(nf) ? fs.readFileSync(nf) : "not found");
      }
      res.setHeader("content-type", MIME[path.extname(hit)] || "application/octet-stream");
      res.end(fs.readFileSync(hit));
    });
    server.listen(0, "127.0.0.1", () => resolve({ server, origin: `http://127.0.0.1:${server.address().port}` }));
  });
}

const pagesOf = (o) => walk(path.join(o, "dist")).filter((f) => f.endsWith(".html"));
const basePages = pagesOf(baseOut), headPages = pagesOf(headOut);
const addedPages = headPages.filter((p) => !basePages.includes(p));
const removedPages = basePages.filter((p) => !headPages.includes(p));
const common = headPages
  .filter((p) => basePages.includes(p))
  .sort((a, b) => (a === "index.html" ? -1 : b === "index.html" ? 1 : a.split("/").length - b.split("/").length || a.localeCompare(b)))
  .slice(0, MAX_PAGES);

async function shot(browser, origin, file, vp) {
  const errors = [];
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, serviceWorkers: "block", reducedMotion: "reduce" });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(`JS error: ${String(e.message).split("\n")[0]}`));
  page.on("response", (r) => {
    if (r.status() >= 400 && r.url().startsWith(origin)) errors.push(`${r.status()} ${r.url().replace(origin, "")}`);
  });
  try {
    const url = origin + "/" + file.replace(/index\.html$/, "").replace(/\.html$/, "");
    await page.goto(url, { waitUntil: "load", timeout: 30000 });
    await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
    await page.addStyleTag({ content: "*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}" });
    // Scroll through the page so lazy-loaded items render, then return to the top.
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight && y < 30000; y += innerHeight) {
        scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 120));
      }
      scrollTo(0, 0);
    });
    await page.waitForTimeout(500);
    const buf = await page.screenshot({
      fullPage: true,
      animations: "disabled",
      mask: [page.locator("iframe, video, .leaflet-container")],
      maskColor: "#ff00ff",
    });
    return { buf, errors };
  } catch (e) {
    return { buf: null, errors: [...errors, `screenshot failed: ${e.message.split("\n")[0]}`] };
  } finally {
    await ctx.close();
  }
}

function diffPng(aBuf, bBuf) {
  const A = PNG.sync.read(aBuf), B = PNG.sync.read(bBuf);
  const w = Math.max(A.width, B.width), h = Math.max(A.height, B.height);
  const pad = (img) => {
    const o = new PNG({ width: w, height: h });
    o.data.fill(255);
    PNG.bitblt(img, o, 0, 0, img.width, img.height, 0, 0);
    return o;
  };
  const diff = new PNG({ width: w, height: h });
  const n = pixelmatch(pad(A).data, pad(B).data, diff.data, w, h, { threshold: 0.1 });
  return { pct: (n / (w * h)) * 100, diffBuf: PNG.sync.write(diff), heightChange: B.height - A.height };
}

const visual = []; // changed rows
const newErrors = []; // errors present in head but not in base
let compared = 0;
if (baseStatus.ok && headStatus.ok && common.length) {
  const [b, h] = await Promise.all([serve(path.join(baseOut, "dist")), serve(path.join(headOut, "dist"))]);
  const browser = await chromium.launch();
  for (const file of common) {
    for (const vp of VIEWPORTS) {
      const A = await shot(browser, b.origin, file, vp);
      const B = await shot(browser, h.origin, file, vp);
      for (const e of B.errors) if (!A.errors.includes(e)) newErrors.push(`\`${file}\` (${vp.name}): ${e}`);
      if (!A.buf || !B.buf) continue;
      compared++;
      const d = diffPng(A.buf, B.buf);
      if (d.pct <= WARN_PCT) continue;
      const id = `${file.replace(/[^a-z0-9]+/gi, "_")}-${vp.name}`;
      fs.writeFileSync(path.join(reportDir, "img", `${id}-base.png`), A.buf);
      fs.writeFileSync(path.join(reportDir, "img", `${id}-head.png`), B.buf);
      fs.writeFileSync(path.join(reportDir, "img", `${id}-diff.png`), d.diffBuf);
      visual.push({ file, vp: vp.name, id, ...d });
    }
  }
  await browser.close();
  b.server.close();
  h.server.close();
}

// ---------------------------------------------------------------- report
const tick = (s) => (s.ok ? "✅ builds" : `❌ failed at \`${s.failedStep}\``);
const anything = !headStatus.ok || fileChanges.length || visual.length || newErrors.length || addedPages.length || removedPages.length;
let md = `<!-- pr-ui-report -->\n## PR build & UI report\n\n`;
md += anything ? "> [!WARNING]\n> This PR changes the built site. Review the differences below (informational, not blocking).\n\n" : "> [!NOTE]\n> No differences in generated files or screenshots. Both versions build.\n\n";
md += `Same \`test\` slug config for both builds. **base:** ${tick(baseStatus)} · **head:** ${tick(headStatus)}\n\n`;
if (!headStatus.ok) md += `<details><summary>Build log (head)</summary>\n\n\`\`\`\n${headStatus.log}\n\`\`\`\n</details>\n\n`;
if (!baseStatus.ok) md += `_Base also fails to build, so no visual comparison was possible._\n\n`;

md += `### Generated files (.md / public .json)\n\n`;
if (!fileChanges.length) md += "No changes.\n\n";
else {
  md += `${fileChanges.length} file(s) changed\n\n| File | | + | − |\n|---|---|---|---|\n`;
  for (const c of fileChanges) md += `| \`${c.f}\` | ${c.kind} | ${c.plus} | ${c.minus} |\n`;
  let budget = 30000;
  md += "\n";
  for (const c of fileChanges) {
    const lines = c.diff.split("\n");
    const shown = lines.slice(0, 60).join("\n").slice(0, Math.max(0, budget));
    budget -= shown.length;
    if (budget <= 0) { md += "_…more diffs omitted (see the files.diff artifact)_\n"; break; }
    md += `<details><summary><code>${c.f}</code></summary>\n\n\`\`\`diff\n${shown}${lines.length > 60 ? "\n… truncated" : ""}\n\`\`\`\n</details>\n\n`;
  }
}

md += `### Visual changes\n\n`;
if (baseStatus.ok && headStatus.ok) {
  md += `${compared} screenshots compared across ${common.length} page(s) (threshold ${WARN_PCT}% of pixels). `;
  if (addedPages.length) md += `**New pages:** ${addedPages.map((p) => `\`${p}\``).join(", ")}. `;
  if (removedPages.length) md += `**Removed pages:** ${removedPages.map((p) => `\`${p}\``).join(", ")}. `;
  md += "\n\n";
  if (visual.length) {
    md += `| Page | View | Changed | Before | After | Diff |\n|---|---|---|---|---|---|\n`;
    for (const v of visual.sort((a, b) => b.pct - a.pct)) {
      const img = (k) => `<img src="{{IMG_BASE}}/${v.id}-${k}.png" width="180">`;
      md += `| \`${v.file}\` | ${v.vp} | ${v.pct.toFixed(2)}%${v.heightChange ? ` (height ${v.heightChange > 0 ? "+" : ""}${v.heightChange}px)` : ""} | ${img("base")} | ${img("head")} | ${img("diff")} |\n`;
    }
  } else md += "No visual changes.\n";
}
md += "\n";
if (newErrors.length) md += `### New runtime errors in head\n\n${[...new Set(newErrors)].slice(0, 30).map((e) => `- ${e}`).join("\n")}\n`;

fs.writeFileSync(path.join(reportDir, "report.md"), md);
console.log(md);
