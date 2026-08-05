import { read, write, fs, path } from "./node_utils.js";
import { slugify, applyComplexFilter, groupEvents, getAddress } from "./utils.js";
import { getPreview } from "./oembed.js";
import { fetchVideos } from "./youtube.js";
import { buildDictionary, translateObject, translateValue, dictionary as DICTIONARY } from "./translate.js";
import { fetchConfig } from "./fetch.js";
import { getBibleReadings, getAudio } from "./gospel.js";
import { printCSS, getFontCSS } from "./css.js";
import { getEventFAQ } from "./seo.js";
import { fetchCalendar } from "./calendar.js";
import { sendNotifications } from "./notify.js";
import crypto from "crypto";

import MarkdownIt from "markdown-it";
import sharp from "sharp";



// Config is materialized by fetch.js (downloads + normalizes the remote
// config.json into ./docs/public/config.json). It's loaded lazily so a bare
// local `npm run docs:before-build` can run fetchConfig() first.
let config = read("./docs/public/config.json");

// Remote media: images are served from the data host with a ?quality= param,
// no local download/transformation. The flattened token replaces "/" with "-",
// e.g. /media/fotos/iglesia.jpg -> {mediaBase}/media-fotos-iglesia.jpg.
const DATA = (process.env.PARROQUIA_DATA || "https://data.parroquia.app").replace(/\/$/, "");
const SLUG = process.env.SITE_SLUG || "";

function mediaBase() {
  return config._media?.base || `${DATA}/${SLUG}`;
}

// Resolve a media path (/media/...) to its remote ?quality= URL. Absolute URLs
// (including already-resolved media) pass through untouched.
function resolveMedia(url, quality = "medium") {
  if (!url) return url;
  if (/^(https?:)?\/\//.test(url)) return url;
  if (url.startsWith("/media/")) {
    const token = url.replace(/^\/media\//, "").replace(/\//g, "-");
    return `${mediaBase()}/${token}?quality=${quality}`;
  }
  return url;
}

// Tolerant reads: fields may sit top-level (legacy layout) or nested per the
// editor's tabbed schema (site.* / pages.languages). Fallbacks only kick in
// when the top-level key is absent, so existing configs are unaffected.
const getConfig = () => {
  const s = config.site ?? {};
  return {
    title: config.title ?? s.title,
    description: config.description ?? s.description,
    image: config.image ?? s.image,
    icon: config.icon ?? s.icon,
    languages: config.languages ?? config.pages?.languages ?? s.languages,
    theme: config.theme ?? s.theme ?? {},
    siteurl: config.dev?.siteurl ?? s.siteurl,
    goatcounter: config.dev?.goatcounter ?? s.goatcounter,
  };
};

let CFG = getConfig();
let THEME = CFG.theme;
// Lista de lenguas a generar
let TARGET_LANGS = CFG.languages?.length ? CFG.languages : ["Español:es"];

function loadAppState() {
  CFG = getConfig();
  THEME = CFG.theme;
  TARGET_LANGS = CFG.languages?.length ? CFG.languages : ["Español:es"];
}

const md = new MarkdownIt({ html: true, linkify: true, breaks: true });

// Persistent build-time fetch cache. Lives in docs/public (not the repo root) so
// it rides along in the deployed site and the fetch step re-downloads it next
// build — the security-compatible way to persist it, since CI builds have no
// write credentials. No leading dot so Cloudflare Pages serves it. Only
// Nominatim + 47herri.eus/bible requests are cache-first; everything else is
// network-first and merely written through to the cache.
const CACHE_FILE = "./docs/public/buildtimecache.json";
const CACHE_DATA = read(CACHE_FILE);
const originalFetch = globalThis.fetch;

globalThis.fetch = async (url, options = {}) => {
  try {
    // Solo cacheamos GETs
    if ( options.cache == 'no-cache' || (options.method && options.method !== "GET")) {
      return originalFetch(url, options);
    }

    const urlStr = url.toString();
    const safeKey = crypto.createHash("sha256").update(urlStr).digest("hex");

    // 0. Aplicamos network first
    if (!url?.includes("nominatim.openstreetmap.org") && !url?.includes("https://47herri.eus/bible")) {
      const response = await originalFetch(url, options);

      if (response.ok) {
        // 3. Actualizamos el archivo maestro
        try {
          const clone = response.clone();
          CACHE_DATA[safeKey] = await clone.json();
          write(CACHE_FILE, CACHE_DATA);
        } catch (_) { /* non-JSON response — skip caching */ }
        return response;
      }
    }

    // 1. ¿Está en la caché?
    if (CACHE_DATA[safeKey]) {
      console.log(`[Cache Hit]: ${safeKey}`);
      return new Response(JSON.stringify(CACHE_DATA[safeKey]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // 2. Si no está, hacemos el fetch real
    const response = await originalFetch(url, options);

    if (response.ok) {
      // 3. Actualizamos el archivo maestro
      try {
        const clone = response.clone();
        CACHE_DATA[safeKey] = await clone.json();
        write(CACHE_FILE, CACHE_DATA);
      } catch (_) { /* non-JSON response — skip caching */ }
    }

    return response;
  } catch (e) {
    return new Response("{}", { status: 400, headers: { "Content-Type": "application/json" } });
  }
};

async function createManifest() {
  try {
    const manifest = {
      name: CFG.title,
      short_name: CFG.title,
      description: CFG.description,
      start_url: "/",
      display: "standalone",
      background_color: THEME.accentColor,
      theme_color: THEME.accentColor,
      icons: [
        { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
        { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      ],
    };
    write("./docs/public/manifest.json", manifest);

    // Generate icons
    if (!CFG.icon) return;
    for (const size of [192, 512]) {
      try {
        await sharp("./docs/public" + CFG.icon)
          .resize(size, size)
          .png()
          .toFile(`./docs/public/icon-${size}.png`);
      } catch (err) {
        console.error(`⚠️ Error generando icono ${size}:`, err.message);
      }
    }

    // generate the favicon

    await sharp("./docs/public" + CFG.icon)
      .resize(32, 32) // Resize to 32x32 pixels for the favicon size
      .toFile(`./docs/public/favicon.ico`);
  } catch (e) {
    console.log(e, "failed to createManifest");
  }
}

function render(text, index = 1) {
  if (typeof text !== "string") return "";
  const loading = index >= 1 ? 'fetchpriority="low" loading="lazy"' : 'fetchpriority="high" loading="eager"';
  return md.render(text).replaceAll("<img ", "<img " + loading + " ");
}

async function postComplete(fm) {
  if (!fm.sections) return;
  // Resolve every media image to its remote ?quality= URL up front.
  bakeMedia(fm);
  addMeta(fm);
  for (var i = 0; i < fm.sections.length; i++) {
    if (typeof fm.sections[i].html === "string") {
      fm.sections[i].html = render(fm.sections[i].html, i);
      fm.sections[i].type = "text";
      fm.sections[i]._block = "gallery";
    }
    if (fm.sections[i]._block == "legal") {
      // simple hack to avoid 'legal' being translated, update to interpolate text {{}}
      fm.sections[i].html = render(fm.sections[i].legal, i);
      fm.sections[i].type = "text";
      fm.sections[i]._block = "gallery";
    }
    if (fm.sections[i].elements && fm.sections[i].elements[0]?.html) {
      for (var j = 0; j < fm.sections[i].elements.length; j++) {
        fm.sections[i].elements[j].html = render(fm.sections[i].elements[j].html, i);
      }
    }
    if (fm.sections[i].elements && fm.sections[i].elements[0]?.file) {
      fm.sections[i].elements = fm.sections[i].elements.map((elem) => {
        if (elem.file) {
          elem.link = "/" + filename(elem.file, elem.title, fm.lang).replace("index", "");
        }
        return elem;
      });
    }

    if (fm.sections[i]._block == "video-gospel") {
      const { audios, books } = await getAudio(fm.lang);
      fm.sections[i].filters = books;
      fm.sections[i].query = false;
      fm.sections[i].elements = audios;
      (fm.sections[i].tags ??= []).push("horizontal");
    }
    if (fm.sections[i]._block == "video-channel") {
      fm.sections[i].elements = videos
        .filter((obj) =>
          JSON.stringify(obj)
            .toLowerCase()
            .includes((fm.sections[i].filter || "").toLowerCase()),
        )
        .filter((item) => {
          const haystack = JSON.stringify(item).toLowerCase();
          if (!fm.sections[i].filters) return true;
          return fm.sections[i].filters.some((word) => haystack.includes(word?.toLowerCase()));
        })
        .map((v) => ({ ...v, src: `https://www.youtube.com/embed/${v.videoId}?autoplay=1`, image: `https://img.youtube.com/vi/${v.videoId}/hqdefault.jpg` }))
        .slice(0, 150);
      // TODO: Decide if we want the videos to be added here or on the Video.vue component (not on both...)

      if (fm.sections[i].filters?.length) {
        //(fm.sections[i].tags ??= []).push("vertical", "small");
      } else {
        (fm.sections[i].tags ??= []).push("horizontal", "medium");
      }
    } else if (fm.sections[i]._block == "calendar") {
      // Calendar.vue renders a grouped table (group -> subkey -> rows). An empty
      // `order` would leave `events` as the raw list and crash the renderer, so
      // fall back to a sensible grouping (by event type, then time).
      const order = fm.sections[i].order?.length ? fm.sections[i].order : ["type", "times"];
      fm.sections[i].events = groupEvents(fm.sections[i].events, order);
    } else if (fm.sections[i]._block == "gospel") {
      fm.sections[i].gospel = await getBibleReadings({ lang: getCode(fm.lang), date: new Date(), gospelOnly: !fm.sections[i].readings });
    }

    if (fm.events) {
      fm.faq = getEventFAQ(fm.events, fm.lang);
    }
  }
}

async function autocomplete(fm) {
  console.log("autocomplete: ", fm.title);
  if (!fm.sections) return;
  for (var i = 0; i < fm.sections.length; i++) {
    fm.sections[i].index = i;
    if (fm.sections[i].links) {
      fm.sections[i].elements = await Promise.all(fm.sections[i].links.map((url) => getPreview(url)));
    }
    if (fm.sections[i]._block == "links") {
      fm.sections[i]._block = "gallery-feature";
      fm.sections[i].type = fm.sections[i].type || "team-cards";
    } else if (fm.sections[i]._block == "gallery-feature") {
      fm.sections[i].type = "team-cards";
      (fm.sections[i].tags ??= []).push("small");
    } else if (fm.sections[i].list) {
      fm.sections[i].elements = fm.sections[i].list.map((i) => {
        return { title: "", description: "", image: i };
      });
      fm.sections[i].type = "gallery";
      (fm.sections[i].tags ??= []).push("small");
      if (!fm.sections[i].elements.length) (fm.sections[i].tags ??= []).push("hidden");
    } else if (fm.sections[i]._block == "calendar") {
      fm.sections[i].events = calendar.filter((obj) => applyComplexFilter(obj, fm.sections[i].filter));
      if (!fm.sections[i].events?.length) (fm.sections[i].tags ??= []).push("hidden");
    } else if (fm.sections[i]._block == "map") {
      const [latitude, longitude] = fm.sections[i].geo?.split(",").map((s) => Number(s.trim())) || [];
      const extra = await getAddress(latitude, longitude, fm.sections[i].name);
      fm.sections[i] = { ...extra, ...fm.sections[i] };
    }

    if (THEME.navStyle == "47herri") {
      let filter = fm.home ? "byday:empty" : fm.title;
      fm.events = calendar.filter((obj) => applyComplexFilter(obj, filter));
      fm.faq = getEventFAQ(fm.events);
    }
  }
  // remove hidden sections
  //fm.sections = fm.sections.filter((obj) => !obj.tags?.includes("hidden"));
}

function absoluteURL(url) {
  if (url.startsWith("/")) {
    const siteurl = CFG.siteurl || "";
    return siteurl + url;
  }
  return url;
}

function imageURL(url) {
  return resolveMedia(url, "medium");
}

// Rewrite every image/media field in a page's data to its remote ?quality= URL,
// so runtime components simply render an absolute URL. Applies under keys
// `image` / `images` anywhere in the tree (sections, elements, events, page).
function bakeMedia(node) {
  if (Array.isArray(node)) {
    for (const item of node) bakeMedia(item);
    return node;
  }
  if (node && typeof node === "object") {
    for (const k of Object.keys(node)) {
      if (k === "image" || k === "images") {
        if (Array.isArray(node[k])) node[k] = node[k].map((i) => (typeof i === "string" ? resolveMedia(i, "medium") : i));
        else if (typeof node[k] === "string") node[k] = resolveMedia(node[k], "medium");
      } else {
        bakeMedia(node[k]);
      }
    }
  }
  return node;
}

function addMeta(fm) {
  fm.head ??= [];
  fm.head.push(["meta", { property: "og:type", content: "website" }]);
  fm.head.push(["meta", { property: "og:title", content: fm.title || CFG.title }]);
  fm.head.push(["meta", { property: "og:description", content: fm.description || CFG.description }]);
  fm.head.push(["meta", { property: "og:image", content: imageURL(fm.image || CFG.image) }]);
  fm.head.push(["meta", { property: "twitter:card", content: "summary_large_image" }]);
  fm.head.push(["meta", { property: "twitter:image", content: imageURL(fm.image || CFG.image) }]);

  if (!fm?.equiv) return;
  for (var i = 0; i < fm.equiv.length; i++) {
    const hreflang = i == 0 ? "x-default" : getCode(fm.equiv[i].lang);
    fm.head.push(["link", { rel: "alternate", hreflang, href: absoluteURL(fm.equiv[i].href).replace(/index$/, "") }]);
  }
}

async function cleanDir(dir) {
  // beware this allows redirecting users if a filename chagnes...
  return
  const files = await fg(["**/*.md", "!aviso-legal.md"], { cwd: dir, absolute: true });
  for (const file of files) {
    try {
      const data = read(file, {}).data;
      const source = read(data.source, {}).data;
      const targetUrl = "/" + filename(file, source.title, data.lang).replace("index", "");
      write(file, {
        source: data.source,
        lang: data.lang,
        head: [["meta", { "http-equiv": "refresh", content: `0; url=${targetUrl}` }]],
      });
    } catch (e) {
      console.log(e);
      fs.unlinkSync(file);
    }
  }
}

function getCode(lang) {
  return lang.split(":")[1] || lang.slice(0, 2).toLowerCase();
}

function filename(name, title, lang) {
  let code = TARGET_LANGS[0] == lang ? "" : getCode(lang) + "/";
  // Home is always "index" (name is the slug "index", or an `.md` path from
  // postComplete's elem.file like "index.md").
  const isIndex = name == "index" || path.basename(name || "") == "index.md";
  if (isIndex) return code + "index";
  const dict = DICTIONARY[lang] || {};
  // Explicit slug mode (run() passes plain slugs, never paths): use it verbatim
  // and never translate it — place names / authored slugs are untranslated.
  // `.md` paths (postComplete's elem.file) keep the old translated-title slug.
  const base = name && !/\.md$/i.test(name) ? slugify(name) : slugify(translateValue(title, dict));
  return code + base;
}

// Deep-clone `template` (never mutating config) and replace {placeholders} with
// each place's fields. Whole-string placeholders like {images} inject the raw
// value (an array); inline {prop} placeholders are string-substituted. In an
// array context a whole-string placeholder that resolves to an array is spliced
// in (e.g. `list: ["{images}"]` -> `list: ["a.webp","b.webp"]`).
function substitute(template, place) {
  // `images` is the placeholder used by templates; the data field is `image`.
  const ctx = { ...place, images: place.image };
  // The editor authors placeholders as `{{name}}` (double braces); also accept
  // the legacy single-brace `{name}` form. A whole-string token splices the raw
  // value (arrays intact); inline tokens are string-substituted.
  const TOKEN = /\{\{\s*([A-Za-z]\w*)\s*\}\}|\{([A-Za-z]\w*)\}/g;
  const WHOLE = /^\s*(?:\{\{\s*([A-Za-z]\w*)\s*\}\}|\{([A-Za-z]\w*)\})\s*$/;
  const replace = (s) => s.replace(TOKEN, (m, a, b) => (a || b) in ctx ? String(ctx[a || b]) : m);

  const clone = structuredClone(template);
  const walk = (node) => {
    if (typeof node === "string") {
      const whole = WHOLE.exec(node);
      if (whole) {
        const key = whole[1] || whole[2];
        if (ctx[key] !== undefined) return ctx[key];
      }
      return replace(node);
    }
    if (Array.isArray(node)) {
      const out = [];
      for (const item of node) {
        const r = walk(item);
        if (Array.isArray(r)) out.push(...r);
        else out.push(r);
      }
      return out;
    }
    if (node && typeof node === "object") {
      const out = {};
      for (const k of Object.keys(node)) out[k] = walk(node[k]);
      return out;
    }
    return node;
  };
  return walk(clone);
}

let videos = [];
let calendar = [];

async function run() {
  // Materialize (or refresh) the remote config before reading any page data.
  try {
    await fetchConfig(SLUG);
  } catch (e) {
    if (SLUG) console.warn("fetch: config fetch failed (using existing):", e.message);
  }
  config = read("./docs/public/config.json");
  loadAppState();

  // Create some basic files. Fonts are downloaded + subset here (pre-build) so
  // the VitePress build step stays offline — config.js's getFontCSS short-
  // circuits on the already-present docs/public/*.woff2.
  await getFontCSS(THEME);
  await printCSS();
  calendar = await fetchCalendar();
  await sendNotifications();
  await createManifest();
  videos = await fetchVideos();
  await buildDictionary();

  // Clean output dir and repopulate

  // Pages are authored as data (config.pages.list) by the editor, not as .md
  // files — iterate that array instead of globbing docs/public/pages/*.md.
  const pagesArr =
    config.pages?.list ??
    (Array.isArray(config.pages) ? config.pages : null) ??
    config.list ??
    [];
  // Places (per-town data) live under info.places in the editor schema.
  const places = config.info?.places ?? config.places?.list ?? [];
  // The town template is a page in pages.list marked protected:"Plantilla
  // pueblos" (its title is a {{name}} placeholder). If none is marked, fall back
  // to any page whose title looks like a placeholder.
  const townTemplate =
    pagesArr.find((p) => p.protected == "Plantilla pueblos") ||
    pagesArr.find((p) => (p.title || "").startsWith("{{"));
  // "Crear una página nueva automaticamente para cada templo" checkbox.
  const perPlace = config.pages?.pageperlocatoin ?? true;

  // The index page is the one marked protected:"Portada" (or home/slug==index).
  const isIndex = (p) => p.home || p.slug == "index" || p.protected == "Portada" || p.title == "Portada";

  const resolveSlug = (p) => (isIndex(p) ? "index" : p.slug || slugify(p.title || "") || "page");

  // Authored pages = the pages.list minus the town template (which is only ever
  // expanded per-place below, never emitted as a literal {{name}} page).
  let pages = pagesArr
    .filter((p) => p !== townTemplate)
    .map((p) => ({ ...p, slug: resolveSlug(p) }));

  // Home fallback: if none marked, the first hand-authored page becomes home.
  if (pages.length && !pages.some((p) => p.slug == "index")) pages[0] = { ...pages[0], slug: "index", home: true };

  // Auto-generate one page per place when the checkbox is on, a towntemplate is
  // authored, and an actual places list exists (skip otherwise).
  if (perPlace && townTemplate && Array.isArray(townTemplate.sections) && townTemplate.sections.length && places.length) {
    const taken = new Set(pages.map((p) => p.slug));
    for (const place of places) {
      if (!place || !place.name) continue;
      const slug = slugify(place.name) || "lugar";
      if (taken.has(slug)) continue; // light dedup — don't clobber an existing page
      taken.add(slug);
      pages.push({ ...substitute(townTemplate, place), title: place.name, slug, home: false });
    }
  }

  for (const page of pages) {
    if (!Array.isArray(page.sections)) continue;
    const slug = page.slug;
    // Config sections use `type` as the block discriminator; the pipeline below
    // dispatches on `_block`, so map it here (never overwrites an existing _block).
    const data = {
      ...page,
      sections: page.sections.map((s, i) => ({ ...s, _block: s._block || s.type, index: i })),
    };
    data.home = slug == "index" || !!page.home;
    data.source = data.home ? "/" : "/" + slug; // 47herri home marker (see autocomplete)

    await autocomplete(data);

    for (const lang of TARGET_LANGS) {
      const dict = DICTIONARY[lang] || {};
      const translatedData = translateObject(data, dict);
      translatedData.lang = lang;
      translatedData.equiv = TARGET_LANGS.map((lan) => {
        return { lang: lan, href: "/" + filename(slug, data.title, lan) };
      });

      await postComplete(translatedData);

      const dest = "./docs/" + filename(slug, data.title, lang) + ".md";
      write(dest, translatedData, ""); // config pages have no markdown body
    }
  }
}

run();
