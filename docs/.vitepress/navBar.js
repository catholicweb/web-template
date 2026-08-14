import { slugify } from "./utils.js";
import { read, fg, path } from "./node_utils.js";
import { dictionary, translateValue } from "./translate.js";
import { createNaming, buildConfigPages, getCode } from "./naming.js";

export function locales(languages) {
  const loc = {};
  for (var i = 0; i < languages.length; i++) {
    const label = languages[i].split(":")[0];
    const lang = languages[i].split(":")[1];
    const key = i === 0 ? "root" : lang;
    loc[key] = { label, lang };
  }
  return loc;
}

const docsDir = path.resolve("./docs");

export async function generateNav(config) {
  if (config?.nav?.length) return generateManualNav(config);

  // Otherwise, generate automatically
  const files = await fg(["**/*.md", "!aviso-legal*"], { cwd: docsDir, absolute: false });
  const nav = files.reduce((acc, f) => {
    const { data } = read(`docs/${f}`);
    if (!data.lang) return acc;

    const base = "/" + f.replace(/index\.md$/, "").replace(/\.md$/, "");
    const sections = data.sections ?? [];

    const items = sections
      .filter((s) => s?.title?.trim())
      .map((s) => ({
        text: s.title.trim(),
        link: `${base}#${slugify(s.title)}`,
      }));

    const nav = items.length ? { text: data.title, items } : { text: data.title, link: base };

    (acc[data.lang] ??= []).push(nav);
    return acc;
  }, {});
  return nav;
}

function tr(str, lang) {
  console.log("Remember to translate section titles", str, lang);
  return str;
}

// Resolve a nav link to an emitted page. Link is either a page id (the editor's
// stable id) or an all-digits index into pages.list. Never throws;
// returns null for unresolvable/skippable links.
function resolveLink(link, pages, rawList) {
  if (link == null) return null;
  const s = String(link);
  // id match wins
  const byId = pages.find((p) => p.id != null && String(p.id) === s);
  if (byId) return byId;
  // name follows
  const byName = pages.find((p) => p.name != null && String(p.name) === s);
  if (byName) return byName;
  // all-digits -> index into pages.list.
  if (/^\d+$/.test(s)) {
    const raw = rawList[Number(s)];
    if (!raw) return null;
    // Prefer the emitted page for this raw entry by id...
    if (raw.id != null) {
      const m = pages.find((p) => String(p.id) === String(raw.id));
      if (m) return m;
    }
    // ...else positional index among emitted pages (correct in the common case
    // where no template page is filtered out earlier in the list).
    return pages[Number(s)] || null;
  }
  return null;
}

async function generateManualNav(config) {
  const rawList =
    config.pages?.list ??
    (Array.isArray(config.pages) ? config.pages : null) ??
    config.list ??
    [];
  const languages = config.languages?.length ? config.languages : ["Español:es"];
  const naming = createNaming({ languages, dictionary });
  const pages = buildConfigPages(config, naming);
  const translatedNames = config.pages?.filenameMode !== "original";

  const nav = {};
  for (const section of config.nav ?? []) {
    if (!section?.links?.length) continue;
    const perLang = {};
    for (const link of section.links) {
      const page = resolveLink(link, pages, rawList);
      if (!page) {
        console.warn("[generateManualNav] Unresolvable nav link, skipping:", link);
        continue;
      }
      const nameArg = translatedNames ? page.slug + ".md" : page.slug;
      for (const lang of languages) {
        const file = naming.filename(nameArg, page.title, lang);
        // Home href uses a trailing slash; other languages' home is /<code>/.
        const href =
          page.slug == "index"
            ? lang == naming.TARGET_LANGS[0]
              ? "/"
              : "/" + getCode(lang) + "/"
            : "/" + file;
        // Translated title from the emitted .md; fall back to the dictionary
        // (or the original title) if the file is somehow missing.
        let text = read("./docs/" + file + ".md").data?.title;
        if (!text) text = translateValue(page.title, dictionary[lang] || {}) || page.title;
        (perLang[lang] ??= []).push({ text, link: href });
      }
    }
    for (const lang in perLang) {
      if (!perLang[lang].length) continue;
      (nav[lang] ??= []).push({ text: tr(section.title, lang), items: perLang[lang] });
    }
  }
  return nav;
}
