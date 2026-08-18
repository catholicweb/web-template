#!/usr/bin/env node
/**
 * migrate-vocaciones.js — one-shot migration of the vocaciones site into the
 * web-template config.json schema (consumed by fetch.js / createFiles.js at the
 * pre-adapter stage). Sibling of migrate-47herri.js but for a site with a very
 * different shape: vocaciones has NO towns/places — every page is a real content
 * page, so all of them land in `pages.list`.
 *
 * Reads the vocaciones editor/pages data layout:
 *   input  <SRC>/{config.json, events.json, *.md}   (default ../vocaciones/pages)
 *   output ./docs/public/config.json                 (gitignored)
 *
 * Mapping:
 *   - Site-level fields (title/description/image/icon/social/bank/collaborators/
 *     theme/dev/languages/nav) are copied as-is.
 *   - Every *.md page becomes a pages.list entry (frontmatter copied verbatim,
 *     source path preserved, no authored slug — createFiles derives basenames
 *     from the translated title per language via the default filenameMode).
 *   - Each pages.list entry gets an `id` key = a random uuid. Internal links —
 *     both in `_block:"links"` section `links[]` arrays and in `config.nav`
 *     `links[]` — are rewritten from the old file-path form ("pages/<stem>.md")
 *     to that target page's id (the "new link format"; navBar.js and
 *     createFiles.js both resolve ids to hrefs at build time).
 *   - Every `/media/<name>.{ext}` reference (image fields, gallery lists, inline
 *     ![]() inside rich text) is normalized through the shared media-naming
 *     helper to `/media/<flat>.webp`, so createFiles.resolveMedia rewrites it to
 *     the same `https://data.parroquia.app/<slug>/<flat>.webp` object key the
 *     upload CLI writes.
 *   - events.json is empty for vocaciones -> calendar.events.list/urls empty.
 *   - Languages: Spanish-only source, but the site declares
 *     ["Español:es","Euskara:eu","English:en"] and the old build emitted
 *     es+eu+en, so the 3 languages are kept under the default (translated)
 *     filenameMode.
 *
 * Env overrides:
 *   PARROQUIA_SRC         input folder (default <home>/Tech/parroquia/vocaciones/pages)
 *   PARROQUIA_LOCAL_ROOT  where config.json is written (default ./docs/public)
 *
 * CLI:
 *   node docs/.vitepress/migrate-vocaciones.js
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import matter from "gray-matter";
import { mediaRelRef } from "./media-naming.js";

const SRC = process.env.PARROQUIA_SRC
  ? path.resolve(process.env.PARROQUIA_SRC)
  : path.join(process.env.HOME || "/home/miguel", "Tech", "parroquia", "vocaciones", "pages");
const ROOT = process.env.PARROQUIA_LOCAL_ROOT
  ? path.resolve(process.env.PARROQUIA_LOCAL_ROOT)
  : path.join(process.cwd(), "docs", "public");

function readJSON(file) {
  const txt = fs.readFileSync(file, "utf8");
  // tolerate trailing commas like the live config often carries
  return JSON.parse(txt.replace(/,(\s*[}\]])/g, "$1"));
}

// Normalize every media reference found in a string into its flattened .webp
// form. Whole-field refs (/media/foo.png as an `image:` value) and inline
// markdown images inside rich-text html both resolve to the same object key.
const MEDIA_TOKEN = /\/media\/[^'"<\s>]+/g;
function normalizeMediaStrings(node) {
  if (Array.isArray(node)) return node.map(normalizeMediaStrings);
  if (node && typeof node === "object") {
    for (const k of Object.keys(node)) node[k] = normalizeMediaStrings(node[k]);
    return node;
  }
  if (typeof node !== "string") return node;
  if (node.startsWith("/media/")) return mediaRelRef(node);
  if (node.includes("/media/")) return node.replace(MEDIA_TOKEN, (m) => mediaRelRef(m));
  return node;
}

// Rewrite a file-path link ("pages/<stem>.md") to its target page's id.
// External URLs and unknown values are left untouched.
const LINK_RE = /^pages\/(.+)\.md$/;
function rewriteLink(link, stemToUuid) {
  if (typeof link !== "string") return link;
  const m = LINK_RE.exec(link);
  if (!m) return link;
  const uuid = stemToUuid.get(m[1]);
  return uuid || link;
}

function buildConfig() {
  const site = readJSON(path.join(SRC, "config.json"));

  // Deterministic order: index first, then the rest alphabetically by stem.
  const stems = fs
    .readdirSync(SRC)
    .filter((f) => f.endsWith(".md"))
    .map((f) => f.replace(/\.md$/, ""));
  const ordered = ["index", ...stems.filter((s) => s !== "index").sort()];

  // Each page gets a fresh random uuid as its `id` (the new link identifier).
  const stemToUuid = new Map(ordered.map((stem) => [stem, crypto.randomUUID()]));

  const pages = ordered.map((stem) => {
    const { data } = matter(fs.readFileSync(path.join(SRC, stem + ".md"), "utf8"));
    const page = { ...data };
    // Rewrite in-page internal links (file path -> uuid) in `_block:"links"`.
    if (Array.isArray(page.sections)) {
      for (const section of page.sections) {
        if (section && section._block === "links" && Array.isArray(section.links)) {
          section.links = section.links.map((l) => rewriteLink(l, stemToUuid));
        }
      }
    }
    // Normalize every /media/ reference (image fields, gallery lists, html).
    page.sections = normalizeMediaStrings(page.sections);
    if (typeof page.image === "string") page.image = mediaRelRef(page.image);
    if (typeof page.description === "string" && page.description.includes("/media/")) {
      page.description = normalizeMediaStrings(page.description);
    }
    page.id = stemToUuid.get(stem);
    page.source = "./pages/" + stem + ".md";
    if (stem === "index") page.slug = "index";
    return page;
  });

  // Rewrite the manual nav links (file path -> id) now that every page has one.
  const nav = Array.isArray(site.nav)
    ? site.nav.map((section) => ({
        ...section,
        links: Array.isArray(section.links) ? section.links.map((l) => rewriteLink(l, stemToUuid)) : section.links,
      }))
    : site.nav;

  const base = {
    title: site.title,
    description: site.description,
    image: typeof site.image === "string" ? mediaRelRef(site.image) : site.image,
    icon: typeof site.icon === "string" ? mediaRelRef(site.icon) : site.icon,
    social: site.social,
    collaborators: site.collaborators,
    bank: site.bank,
  };

  return {
    theme: site.theme || {},
    site: base,
    "event-types": { list: [] }, // vocaciones has no events to migrate
    calendar: { events: { list: [], urls: [] } },
    pages: {
      nav,
      languages: site.languages || ["Español:es"],
      list: pages,
      pageperevent: [], // vocaciones has no event-types to page-ify
      // filenameMode unset -> default translated per-language basenames.
    },
    dev: site.dev || {},
  };
}

const outPath = path.join(ROOT, "config.json");
fs.mkdirSync(path.dirname(outPath), { recursive: true });
const config = buildConfig();
fs.writeFileSync(outPath, JSON.stringify(config, null, 2), "utf8");

console.log(`migrate-vocaciones: wrote ${outPath}`);
console.log(`  pages.list: ${config.pages.list.length}`);
console.log(`  nav sections: ${config.pages.nav?.length ?? 0} (links use ids)`);
console.log(`  calendar.events.list: ${config.calendar.events.list.length} (urls: ${config.calendar.events.urls.length})`);

// CLI-only script: always run the build above.
