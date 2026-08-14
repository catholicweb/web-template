#!/usr/bin/env node
/**
 * import-media-upload.js — bulk image upload CLI.
 *
 * Sibling of the editor's docs/.vitepress/import-media.js (same compression
 * recipe: resize within 1920x1080, ~250KB, min quality 0.6, binary-search WebP
 * quality), but instead of writing locally it uploads each image to the
 * vocaciones R2 bucket through the config-api write route.
 *
 * Uploaded objects are keyed by the "flattened source name" produced by
 * ./media-naming.js (the same helper migrate-vocaciones.js uses), so the object
 * key `<slug>/<flat>.webp` is exactly the URL that createFiles.resolveMedia
 * rewrites `/media/<flat>.webp` refs to at build time. Run the migration first,
 * then this script, to upload precisely the images the migrated config
 * references (pass --all to upload every image in the folder regardless).
 *
 * Auth: sends `Authorization: Bearer $PARROQUIA_ADMIN_TOKEN`. NOTE: config-api's
 * write route currently authorizes editor magic-link bearer tokens, not the
 * admin secret — accepting an admin token on `PUT /sites/:slug/:token` is a
 * small cross-repo change in config-api that must land for real uploads to work.
 *
 * Usage:
 *   node docs/.vitepress/import-media-upload.js <mediaDir> [--all] [--dry-run]
 *       [--config path] [--slug vocaciones] [--api https://api.parroquia.app]
 *
 * Env overrides: PARROQUIA_ADMIN_TOKEN (required to upload), SITE_SLUG,
 * PARROQUIA_API, PARROQUIA_MEDIA_SRC, PARROQUIA_CONFIG.
 */
import { readdir, stat, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import sharp from "sharp";
import { flattenMediaName } from "./media-naming.js";

const HELP = `Usage:
  node docs/.vitepress/import-media-upload.js <mediaDir> [--all] [--dry-run]

Compresses every referenced image to WebP (fit within 1920x1080, ~250KB, min
quality 0.6), names each object <slug>/<flat>.webp, and PUTs it to config-api.
By default uploads only the images referenced by the migrated config.json;
pass --all to upload every image in <mediaDir>.`;

const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
  console.log(HELP);
  process.exit(0);
}

const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp", ".heic", ".avif"]);

// Mirror the browser/editor compressToWebP recipe: resize to fit within max
// bounds (no upscale), then binary-search WebP quality toward the target size.
async function compressToWebP(filePath) {
  const targetW = 1920;
  const targetH = 1080;
  const targetBytes = 250 * 1024;
  const minQuality = 0.6;

  const pipeline = sharp(filePath).resize(targetW, targetH, {
    fit: "inside",
    withoutEnlargement: true,
  });

  const webp = (q) => pipeline.clone().webp({ quality: Math.round(q * 100) }).toBuffer();

  let quality = 0.92;
  let buf = await webp(quality);

  if (buf.length > targetBytes) {
    let low = minQuality;
    let high = quality;
    for (let i = 0; i < 10; i++) {
      quality = (low + high) / 2;
      buf = await webp(quality);
      if (buf.length > targetBytes) {
        high = quality;
      } else {
        low = quality;
        if (buf.length > targetBytes * 0.9) break;
      }
      if (quality <= minQuality) break;
    }
  }
  return buf;
}

function flag(name) {
  return args.includes(name);
}
function flagValue(name, def) {
  const i = args.indexOf(name);
  if (i === -1) return def;
  const v = args[i + 1];
  return v === undefined ? def : v;
}

const DRY_RUN = flag("--dry-run");
const ALL = flag("--all");
const SLUG = flagValue("--slug", process.env.SITE_SLUG || "");
const API = flagValue("--api", process.env.PARROQUIA_API || "https://api.parroquia.app");
const CONFIG_PATH = path.resolve(flagValue("--config", process.env.PARROQUIA_CONFIG || "./docs/public/config.json"));
const MEDIA_SRC = path.resolve(
  flagValue("--media", process.env.PARROQUIA_MEDIA_SRC) ||
    args.find((a) => !a.startsWith("-")) ||
    "./vocaciones/docs/public/media",
);

const TOKEN = process.env.PARROQUIA_ADMIN_TOKEN || "";

// Collect the set of referenced /media/<flat>.webp names from the migrated
// config, so we only upload the images the site actually uses.
async function referencedKeys() {
  const raw = await readFile(CONFIG_PATH, "utf8");
  const matches = raw.match(/\/media\/[^"'\s<>()]+\.webp/g) || [];
  return new Set(matches.map((m) => m.replace(/^\/media\//, "")));
}

async function main() {
  let entries;
  try {
    entries = (await readdir(MEDIA_SRC)).sort();
  } catch (err) {
    console.error(`Cannot read media dir "${MEDIA_SRC}": ${err.message}`);
    process.exit(1);
  }

  const refs = ALL ? null : await referencedKeys().catch(() => null);

  // Group source files by their flattened .webp key (a jpg + webp of the same
  // image and any space/paren variants all map to the same object key).
  const byKey = new Map();
  for (const name of entries) {
    const src = path.join(MEDIA_SRC, name);
    const info = await stat(src).catch(() => null);
    if (!info || !info.isFile()) continue;
    if (!IMAGE_EXT.has(path.extname(name).toLowerCase())) continue;
    const key = flattenMediaName(name) + ".webp";
    if (!byKey.has(key)) byKey.set(key, { name, src });
  }

  let keys = [...byKey.keys()];
  if (refs) {
    const wanted = keys.filter((k) => refs.has(k));
    const missing = [...refs].filter((k) => !keys.includes(k));
    keys = wanted;
    if (missing.length) {
      console.warn(`  ⚠ ${missing.length} referenced media not found in "${MEDIA_SRC}":`);
      for (const k of missing.slice(0, 10)) console.warn(`    - ${k}`);
    }
  }

  if (!TOKEN && !DRY_RUN) {
    console.error("Missing PARROQUIA_ADMIN_TOKEN env (or pass --dry-run).");
    process.exit(1);
  }
  if (!SLUG) {
    console.error("Missing --slug / SITE_SLUG.");
    process.exit(1);
  }

  console.log(
    `import-media-upload: ${DRY_RUN ? "[DRY RUN] " : ""}${keys.length}/${byKey.size} images -> ` +
      `${API}/sites/${SLUG} (source: ${MEDIA_SRC})`,
  );

  let ok = 0;
  let failed = 0;
  for (const key of keys) {
    const { name, src } = byKey.get(key);
    try {
      const buf = await compressToWebP(src);
      const url = `${API}/sites/${encodeURIComponent(SLUG)}/${encodeURIComponent(key)}`;
      if (!DRY_RUN) {
        const res = await fetch(url, {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${TOKEN}`,
            "Content-Type": "image/webp",
          },
          body: buf,
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok || body.ok === false) {
          failed++;
          console.error(`✗ ${name} -> ${key} HTTP ${res.status} ${JSON.stringify(body).slice(0, 120)}`);
          continue;
        }
        console.log(`✓ ${name} -> ${body.url || key} (${(buf.length / 1024).toFixed(0)} KB)`);
      } else {
        console.log(`✓ ${name} -> PUT ${url} (${(buf.length / 1024).toFixed(0)} KB)`);
      }
      ok++;
    } catch (err) {
      failed++;
      console.error(`✗ ${name}: ${err.message}`);
    }
  }

  console.log(`\nDone: ${ok} uploaded, ${failed} failed, ${keys.length} total${DRY_RUN ? " (dry run)" : ""}`);
}

await main();
