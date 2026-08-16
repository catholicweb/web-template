import { slugify } from "./utils.js";
import { translateValue } from "./translate.js";
import { path } from "./node_utils.js";

// Language codes are authored "Label:code" (e.g. "Español:es"); the bit after
// ":" is the URL code, else fall back to the first two lowercase letters.
export function getCode(lang) {
  return lang.split(":")[1] || lang.slice(0, 2).toLowerCase();
}

const DEFAULT_LANGS = ["Español:es"];

// Pure naming helpers bound to a site's languages + translation dictionary.
// createFiles (writes the per-language .md) and navBar (reads them at build
// time) both use this so hrefs always match the emitted file basenames.
export function createNaming({ languages, dictionary }) {
  const TARGET_LANGS = languages?.length ? languages : DEFAULT_LANGS;

  const filename = (name, title, lang) => {
    const code = TARGET_LANGS[0] == lang ? "" : getCode(lang) + "/";
    const isIndex = name == "index" || path.basename(name || "") == "index.md";
    if (isIndex) return code + "index";
    const dict = dictionary[lang] || {};
    // `.md` names take the translated-title slug; plain slugs are used verbatim
    // (filenameMode:"original").
    const base =
      name && !/\.md$/i.test(name)
        ? slugify(name)
        : slugify(translateValue(title, dict));
    return code + base;
  };

  const isIndex = (p) =>
    p.home || p.slug == "index" || p.protected == "Portada" || p.title == "Portada";

  const resolveSlug = (p) =>
    isIndex(p) ? "index" : p.slug || slugify(p.title || "") || "page";

  return { filename, isIndex, resolveSlug, TARGET_LANGS };
}

// Ordered list of pages we emit .md files for — mirrors createFiles `run()`.
// The town template (a {{name}} placeholder page) is never emitted and is
// filtered out before slug resolution so nav indices line up with emitted files.
export function buildConfigPages(config, naming) {
  const raw =
    config.pages?.list ??
    (Array.isArray(config.pages) ? config.pages : null) ??
    config.list ??
    [];
  const townTemplate =
    raw.find((p) => p.protected == "Plantilla pueblos") ||
    raw.find((p) => p.protected == "Plantilla templos")
  const eventTemplate = raw.find((p) => p.protected == "Plantilla eventos");
  let pages = raw
    .filter((p) => p !== townTemplate && p !== eventTemplate)
    .map((p) => ({ ...p, slug: naming.resolveSlug(p) }));
  if (pages.length && !pages.some((p) => p.slug == "index"))
    pages[0] = { ...pages[0], slug: "index", home: true };
  return pages;
}
