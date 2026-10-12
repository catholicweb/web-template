#!/usr/bin/env node
// Build one checkout (base or head) against a shared, pre-fetched fixture and
// collect its outputs. Never throws: failures are recorded in status.json.
//
//   node build-variant.mjs <repoDir> <outDir> <fixtureDir>
//
// outDir/files/  generated docs/**/*.md + docs/public/*.json (for text diffs)
// outDir/dist/   the VitePress build output (for screenshots)
// outDir/status.json  { ok, failedStep, log }

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const [repoDir, outDir, fixtureDir] = process.argv.slice(2).map((p) => path.resolve(p));
const docs = path.join(repoDir, "docs");
const status = { ok: true, failedStep: null, log: "" };

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(path.join(outDir, "files"), { recursive: true });

function step(name, fn) {
  if (!status.ok) return;
  console.log(`::group::${path.basename(repoDir)}: ${name}`);
  try {
    fn();
  } catch (err) {
    status.ok = false;
    status.failedStep = name;
    status.log = String((err.stdout || "") + (err.stderr || "") || err.message).slice(-4000);
    console.error(status.log);
  }
  console.log("::endgroup::");
}

const sh = (cmd) =>
  execSync(cmd, {
    cwd: repoDir,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 256 * 1024 * 1024,
    // No secrets: fetchers short-circuit or fail gracefully without them.
    env: { ...process.env, OPENROUTER_API_KEY: "", YT_API_KEY: "", SITE_SLUG: "test" },
  });

step("npm ci", () => sh("npm ci --ignore-scripts"));
step("copy fixture", () => {
  fs.mkdirSync(path.join(docs, "public"), { recursive: true });
  fs.cpSync(fixtureDir, path.join(docs, "public"), { recursive: true });
});
step("before-build", () => sh("npm run before-build"));
step("vitepress build", () => sh("npm run build"));

// Collect whatever exists, even after a failure, so partial diffs are still useful.
function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : [p];
  });
}
const skip = ["/.vitepress/", "/node_modules/"];
for (const f of walk(docs)) {
  const rel = path.relative(docs, f).split(path.sep).join("/");
  const isMd = f.endsWith(".md") && !skip.some((s) => f.includes(s));
  const isPublicJson = rel.startsWith("public/") && rel.split("/").length === 2 && f.endsWith(".json");
  if (!isMd && !isPublicJson) continue;
  const dest = path.join(outDir, "files", rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(f, dest);
}
const dist = path.join(docs, ".vitepress", "dist");
if (fs.existsSync(dist)) fs.cpSync(dist, path.join(outDir, "dist"), { recursive: true });

fs.writeFileSync(path.join(outDir, "status.json"), JSON.stringify(status, null, 2));
console.log(status.ok ? "build ok" : `build FAILED at: ${status.failedStep}`);
