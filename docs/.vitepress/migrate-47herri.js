#!/usr/bin/env node
/**
 * migrate-47herri.js — one-shot migration of the 47herri site into the
 * web-template config.json schema (consumed by fetch.js / createFiles.js at
 * the pre-adapter stage).
 *
 * Reads the 47herri "pages" input folder (the editor/pages data layout) and
 * writes a single ./docs/public/config.json shaped like the parroquia sample
 * (https://data.parroquia.app/parroquia/config.json):
 *
 *   input  ./docs/public/pages/{config.json, events.json, *.md}
 *   output ./docs/public/config.json                 (gitignored)
 *
 * Mapping:
 *   - site-level fields (theme/site/languages/dev) are copied as-is;
 *   - non-town pages (index, recursos, parroquias, aviso-legal, imprimir)
 *     become explicit pages.list entries (frontmatter copied verbatim, source
 *     path preserved, no authored slug — createFiles derives basenames from the
 *     translated title per language via pages.filenameMode:"translated");
 *   - the ~47 town pages are turned into info.places + a "Plantilla pueblos"
 *     template page (pageperlocatoin=true), parroquia-style;
 *   - events.json's recurring schedule (events-mass + events-group) maps to
 *     calendar.events.list with event-types derived from its `default` map,
 *     and the Google ICS url is kept under calendar.events.urls.
 *
 * Env overrides:
 *   PARROQUIA_SRC       input folder (default ./docs/public/pages)
 *   PARROQUIA_LOCAL_ROOT  where config.json is written (default ./docs/public)
 *
 * CLI:
 *   node docs/.vitepress/migrate-47herri.js
 */

import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";

const SRC = process.env.PARROQUIA_SRC
  ? path.resolve(process.env.PARROQUIA_SRC)
  : path.join(process.cwd(), "docs", "public", "pages");
const ROOT = process.env.PARROQUIA_LOCAL_ROOT
  ? path.resolve(process.env.PARROQUIA_LOCAL_ROOT)
  : path.join(process.cwd(), "docs", "public");

// The non-town, hand-authored pages that become explicit pages.list entries.
// Every other *.md page is treated as a town (the 47 herri).
const EXPLICIT = new Set(["index", "recursos", "parroquias", "aviso-legal", "imprimir"]);

function readJSON(file) {
  const txt = fs.readFileSync(file, "utf8");
  // tolerate trailing commas like the live config often carries
  return JSON.parse(txt.replace(/,(\s*[}\]])/g, "$1"));
}

function firstMapGeo(sections) {
  const map = (sections || []).find((s) => s._block === "map" || s.type === "map");
  return map?.geo || "";
}

function firstGallery(sections) {
  const gallery = (sections || []).find((s) => s._block === "gallery" || s.type === "gallery");
  return Array.isArray(gallery?.list) ? gallery.list : [];
}

/** Build the town template page (parroquia "Plantilla pueblos" style). */
function townTemplate() {
  return {
    title: "{{name}}",
    image: "{{image}}",
    tags: "{{tags}}",
    hideHero: false,
    protected: "Plantilla pueblos",
    sections: [
      { type: "calendar", title: "", filter: "{{name}}", order: [], tags: [] },
      { type: "video-channel", title: "", filter: "{{name}}", tags: [] },
      { type: "map", title: "", image: "{{image}}", name: "{{name}}", geo: "{{geo}}", tags: [] },
      { type: "gallery", title: "", list: "{{gallery}}", tags: [] },
    ],
  };
}

function buildConfig() {
  const site = readJSON(path.join(SRC, "config.json"));
  const events = readJSON(path.join(SRC, "events.json"));

  const explicit = {}; // keyed by stem, for deterministic output order
  const places = [];

  for (const file of fs.readdirSync(SRC).filter((f) => f.endsWith(".md"))) {
    const { data } = matter(fs.readFileSync(path.join(SRC, file), "utf8"));
    const stem = file.replace(/\.md$/, "");

    // Explicit/welded pages (index + hand-authored) go straight into pages.list.
    if (EXPLICIT.has(stem)) {
      // Copy the source frontmatter verbatim (key order included). The old build
      // carried these keys as-is and only appended the derived
      // source/events/faq/lang/equiv/head fields, so preserving order here gives
      // a byte-identical frontmatter layout in the emitted pages.
      const page = { ...data };
      // Original source-page path: the old output's `source:` field.
      page.source = "./pages/" + stem + ".md";
      // Home-page marker (createFiles needs slug==index / protected Portada).
      if (stem === "index") page.slug = "index";
      // Non-index pages carry no authored slug: translated filename mode derives
      // basenames from each language's translated title, and resolveSlug falls
      // back to the slugified default-language title for routing/dedup.
      explicit[stem] = page;
      continue;
    }

    // Everything else is a town -> info.places + template-expanded page.
    places.push({
      name: data.title || stem,
      geo: firstMapGeo(data.sections),
      image: data.image || "",
      gallery: firstGallery(data.sections),
      tags: Array.isArray(data.tags) ? data.tags : [],
      source: "./pages/" + stem + ".md", // original source-page path (town template emits it)
    });
  }

  // Deterministic pages.list: index first, then the remaining hand-authored
  // pages, then the town template (filtered out of direct iteration by
  // createFiles and expanded once per place).
  const ordered = ["index", "recursos", "parroquias", "aviso-legal", "imprimir"];
  const pages = ordered.map((stem) => explicit[stem]).filter(Boolean);
  pages.push(townTemplate());

  // Recurring schedule: 42 mass + 9 group (mirrors the reference calendar.json,
  // which contains exactly those; feast/funeral/multidate are not emitted).
  const list = [
    ...(events["events-mass"] || []).map((e) => ({ type: "mass", ...e })),
    ...(events["events-group"] || []).map((e) => ({ type: "group", ...e })),
  ];

  const defaults = events.default || {};
  const eventTypes = [
    { name: "mass", label: "mass", protected: true, defaults: defaults.mass || {} },
    { name: "group", label: "group", protected: true, defaults: defaults.group || {} },
  ];

  const base = {
    title: site.title,
    description: site.description,
    image: site.image,
    icon: site.icon,
    social: site.social,
    collaborators: site.collaborators,
    bank: site.bank,
  };

  return {
    theme: site.theme || {},
    site: base,
    "event-types": { list: eventTypes },
    calendar: {
      events: { list, urls: events.urls || [] },
    },
    pages: {
      nav: [], // auto-nav (modern model; old manual "Menu" nav not reproduced)
      languages: site.languages || [],
      list: pages,
      pageperlocatoin: true,
      // 47herri names every output file from that language's translated title
      // (slug(translate(title))), e.g. es/imprimir.md, de/drucken.md. That is
      // createFiles' default; no flag needed (a site wanting stable slugs would
      // set pages.filenameMode:"original").
    },
    info: { ...base, places },
    dev: site.dev || {},
  };
}

const outPath = path.join(ROOT, "config.json");
fs.mkdirSync(path.dirname(outPath), { recursive: true });
const config = buildConfig();
fs.writeFileSync(outPath, JSON.stringify(config, null, 2), "utf8");

console.log(`migrate-47herri: wrote ${outPath}`);
console.log(`  pages.list: ${config.pages.list.length} (${config.pages.list.length - 1} + town template)`);
console.log(`  info.places: ${config.info.places.length}`);
console.log(`  calendar.events.list: ${config.calendar.events.list.length} (urls: ${config.calendar.events.urls.length})`);

// CLI-only script: always run the build above.

