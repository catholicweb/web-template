#!/usr/bin/env node
/**
 * fetch.js — pre-adapter: materialize the remote site data into ./docs/public/
 * BEFORE the createFiles.js adapter runs.
 *
 * The site's content is now a single remote JSON document (the site config),
 * served publicly from the data host:
 *
 *     {DATA}/{slug}/config.json
 *
 * Every page lives inside it under `pages.list` (the index page is marked
 * `protected: "Portada"`, the per-town template `protected: "Plantilla
 * pueblos"`), events under `calendar.events`, and media is served remotely
 * with a `?quality=low|medium|high` param — nothing is downloaded locally
 * except this one config document.
 *
 * It normalizes the (optionally nested) config into the flat shape the
 * template consumers expect (title/description/languages/theme/social/... at
 * top level) and injects `_media = { base, slug }` so runtime components and
 * the build can construct remote media URLs.
 *
 * Env overrides:
 *   SITE_SLUG         slug to fetch (or pass as CLI arg)
 *   PARROQUIA_DATA    public data host (default https://data.parroquia.app)
 *   PARROQUIA_LOCAL_ROOT  where to write (default ./docs/public)
 *
 * CLI:
 *   node fetch.js <slug>
 */

'use strict';

import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DATA = (process.env.PARROQUIA_DATA || 'https://data.parroquia.app').replace(/\/$/, '');
const LOCAL_ROOT = process.env.PARROQUIA_LOCAL_ROOT
  ? path.resolve(process.env.PARROQUIA_LOCAL_ROOT)
  : path.join(process.cwd(), 'docs', 'public');

/**
 * Tolerant JSON parse. The live config.json occasionally carries trailing
 * commas (legal in the edited/pretty-printed data but invalid strict JSON),
 * so we strip `,` before any `}`/`]` before handing it to JSON.parse.
 */
export function parseJSON(text, fallback = {}) {
  try {
    const cleaned = text.replace(/,(\s*[}\]])/g, "$1");
    return JSON.parse(cleaned);
  } catch (err) {
    console.error("fetch: could not parse config JSON:", err.message);
    return fallback;
  }
}

/**
 * Normalize the raw (possibly nested / tabbed) config into the flat top-level
 * shape the template consumers read (config.js, css.js, seo.js, createFiles.js,
 * translate.js, youtube.js). Non-config payload blocks (pages / calendar /
 * event-types) are kept intact.
 */
export function normalizeConfig(raw) {
  const s = raw.site ?? {};
  const pages = raw.pages ?? {};
  return {
    ...raw,
    title: raw.title ?? s.title,
    description: raw.description ?? s.description,
    image: raw.image ?? s.image,
    icon: raw.icon ?? s.icon,
    languages: raw.languages ?? pages.languages ?? s.languages,
    theme: raw.theme ?? s.theme ?? {},
    social: raw.social ?? s.social,
    collaborators: raw.collaborators ?? s.collaborators,
    bank: raw.bank ?? s.bank,
    nav: raw.nav ?? pages.nav ?? [],
    dev: raw.dev ?? s.dev ?? {},
    // Runtime/remote-media helper info. Kept separate from site-authored fields.
    _media: {
      base: `${DATA}/${raw._media?.slug ?? ""}`,
    },
  };
}

/**
 * Download and normalize the site config, writing it to docs/public/config.json.
 * Returns the parsed (normalized) config.
 */
export async function fetchConfig(slug) {
  if (!slug) throw new Error("fetchConfig: no slug provided (set SITE_SLUG or pass <slug>)");
  const url = `${DATA}/${slug}/config.json`;
  console.log(`fetch: downloading ${url}`);
  const res = await fetch(url, { cache: "no-cache" });
  if (!res.ok) {
    throw new Error(`fetch: ${url} -> ${res.status}`);
  }
  const text = await res.text();
  const raw = parseJSON(text, {});
  const config = normalizeConfig({ ...raw, _media: { ...(raw._media || {}), slug } });
  config._media.base = `${DATA}/${slug}`;
  await fsp.mkdir(LOCAL_ROOT, { recursive: true });
  await fsp.writeFile(path.join(LOCAL_ROOT, "config.json"), JSON.stringify(config, null, 2));
  console.log(`fetch: wrote ${path.join(LOCAL_ROOT, "config.json")}`);
  return config;
}

// --- CLI ------------------------------------------------------------------

async function main() {
  const [slugArg] = process.argv.slice(2);
  const slug = slugArg || process.env.SITE_SLUG;
  if (!slug) {
    console.error("usage: node fetch.js <slug>   (or set SITE_SLUG)");
    console.error(`       DATA=${DATA}  LOCAL_ROOT=${LOCAL_ROOT}`);
    process.exit(1);
  }
  try {
    const config = await fetchConfig(slug);
    console.log(`fetch: ok — title="${config.title}" pages=${(config.pages?.list || []).length}`);
  } catch (err) {
    console.error(`fetch failed:`, err.message);
    process.exit(1);
  }
}

const nodePath = path.resolve(process.argv[1]);
const modulePath = fileURLToPath(import.meta.url);
if (nodePath === modulePath) {
  main();
}
