#!/usr/bin/env node
// Canary build orchestrator: runs the real adapter + VitePress build against the
// expanded test-config.json fixture, asserts the expected output, then cleans up.
// Catches the crash-class regressions (youtube scope, sharp(Buffer), Nominatim XML,
// manual-nav undefined.title, single-lang locales) that pure unit tests can't.
//
//   npm run test:build
//
// Runs fully offline: fonts are committed, and every fetcher either short-circuits
// or fails gracefully without OPENROUTER_API_KEY / YT_API_KEY / SITE_SLUG.

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const vitepress = path.join(root, "docs", ".vitepress");
const publicDir = path.join(root, "docs", "public");

const sh = (cmd) => execSync(cmd, { cwd: root, stdio: "inherit" });

function rm(p) {
  fs.rmSync(p, { recursive: true, force: true });
}

function walk(dir, fn) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, fn);
    else fn(p);
  }
}

// Remove every file the build pipeline generates while never touching tracked
// sources. All docs/**/*.md, docs/public/*.json and *.log are gitignored build
// output (the config fixture lives under docs/.vitepress/ and is committed), so
// a targeted extension walk beats `git clean`, which would also delete any
// still-untracked source files.
function cleanGeneratedOutputs() {
  rm(path.join(vitepress, "dist"));
  rm(path.join(vitepress, "cache"));
  rm(path.join(vitepress, "theme", "style.css"));
  walk(path.join(root, "docs"), (file) => {
    if (file.endsWith(".md") || file.endsWith(".log")) rm(file);
  });
  walk(path.join(root, "docs", "public"), (file) => {
    if (file.endsWith(".json")) rm(file);
  });
}

// Expected outputs. `languages: ["Español:es", "Euskara:eu"]` makes `es` the root
// locale (`/`), so its files are un-prefixed and `eu` lives under `eu/`.
const EXPECTED = [
  "docs/index.md", // es home
  "docs/eu/index.md", // eu home
  "docs/404.md", // injected 404 (es)
  "docs/eu/404.md", // injected 404 (eu)
  "docs/leitza.md", // town template, per info.places
  "docs/eu/leitza.md",
  "docs/misa-2099-12-25.md", // event template, per pageperevent — date must stay in the URL
  "docs/eu/misa-2099-12-25.md",
  "docs/aviso-legal-y-politica-de-privacidad.md", // generated legal/privacy page (es root)
  "docs/.vitepress/dist/index.html",
  "docs/.vitepress/dist/404.html",
  "docs/.vitepress/dist/eu/index.html",
];

function main() {
  const fails = [];
  try {
    console.log("📋 Step 1: validate + materialize the test config fixture");
    const fixturePath = path.join(vitepress, "test-config.json");
    JSON.parse(fs.readFileSync(fixturePath, "utf8")); // fail fast on a malformed fixture
    fs.mkdirSync(publicDir, { recursive: true });
    fs.copyFileSync(fixturePath, path.join(publicDir, "config.json"));
    // Fallback data files (only if missing — fetch/materializers may otherwise
    // write them in real runs; we want a deterministic offline baseline).
    for (const [name, content] of [
      ["dictionary.json", "{}"],
      ["buildtimecache.json", "{}"],
      ["videos.json", "[]"],
    ]) {
      const file = path.join(publicDir, name);
      if (!fs.existsSync(file)) fs.writeFileSync(file, content);
    }

    console.log("📦 Step 2: run the adapter (createFiles.js)");
    sh("node docs/.vitepress/createFiles.js");

    console.log("🛠  Step 3: vitepress build");
    sh("npm run build");

    console.log("🔍 Step 4: assert expected output");
    for (const rel of EXPECTED) {
      if (fs.existsSync(path.join(root, rel))) console.log(`  ✓ ${rel}`);
      else {
        fails.push(rel);
        console.error(`  ✗ ${rel} MISSING`);
      }
    }
    // Sanity: the per-event page must not be the only thing missing when the
    // event-template code path silently stops producing pages.
    const generatedMd = fs
      .readdirSync(path.join(root, "docs"))
      .filter((f) => f.endsWith(".md"))
      .sort();
    console.log(`  generated docs/*.md: ${generatedMd.join(", ") || "(none)"}`);
  } catch (err) {
    console.error("✗ canary build crashed:");
    if (err.stdout) process.stdout.write(String(err.stdout));
    if (err.stderr) process.stderr.write(String(err.stderr));
    fails.push(err.message || String(err));
  } finally {
    console.log("🧹 Cleanup: removing generated docs output");
    try {
      cleanGeneratedOutputs();
    } catch (e) {
      console.warn("  (cleanup failed — leaving generated files for inspection:", e.message, ")");
    }
  }

  if (fails.length) {
    console.error(`\n✗ CANARY BUILD FAILED: ${fails.length} problem(s)`);
    process.exit(1);
  }
  console.log("\n✓ canary build passed");
}

main();
