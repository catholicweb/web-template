import { read, write, path } from "./node_utils.js";
import { slugify, applyComplexFilter, groupEvents, getAddress, assembleOrder } from "./utils.js";
import { getPreview } from "./oembed.js";
import { fetchVideos } from "./youtube.js";
import { fetchInstagram } from "./instagram.js";
import { buildDictionary, translateObject, dictionary as DICTIONARY } from "./translate.js";
import { fetchConfig } from "./fetch.js";
import { createNaming, getCode } from "./naming.js";
import { getBibleReadings, getAudio } from "./gospel.js";
import { printCSS, getFontCSS } from "./css.js";
import { getEventFAQ } from "./seo.js";
import { fetchCalendar } from "./calendar.js";
import crypto from "crypto";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

import MarkdownIt from "markdown-it";
import sharp from "sharp";



// Config is materialized by fetch.js (downloads + normalizes the remote
// config.json into ./docs/public/config.json). It's loaded lazily so a bare
// local `npm run before-build` can run fetchConfig() first.
let config = read("./docs/public/config.json");

// Remote media: images are served from the data host with no local
// download/transformation. The flattened token replaces "/" with "-",
// e.g. /media/fotos/iglesia.jpg -> {mediaBase}/media-fotos-iglesia.jpg.
const DATA = (process.env.PARROQUIA_DATA || "https://data.parroquia.app").replace(/\/$/, "");
const SLUG = process.env.SITE_SLUG || "";

export function mediaBase() {
  return config._media?.base || `${DATA}/${SLUG}`;
}

// Resolve a media path (/media/...) to its remote URL. Absolute URLs
// (including already-resolved media) pass through untouched.
export function resolveMedia(url) {
  if (!url) return url;
  if (/^(https?:)?\/\//.test(url)) return url;
  if (url.startsWith("/media/")) {
    const token = url.replace(/^\/media\//, "").replace(/\//g, "-");
    return `${mediaBase()}/${token}`;
  }
  return url;
}

// Tolerant reads: fields may sit top-level (legacy layout) or nested per the
// editor's tabbed schema (site.* / pages.languages). Fallbacks only kick in
// when the top-level key is absent, so existing configs are unaffected.
export const getConfig = () => {
  const s = config.site ?? {};
  return {
    title: config.title ?? s.title,
    description: config.description ?? s.description,
    image: config.image ?? s.image,
    icon: config.icon ?? s.icon,
    languages: config.languages ?? config.pages?.languages ?? s.languages,
    theme: config.theme ?? s.theme ?? {},
    siteurl: config.dev?.siteurl ?? s.siteurl,
  };
};

let CFG = getConfig();
let THEME = CFG.theme;
// Shared per-site naming helpers (also used by navBar to read these files).
// DICTIONARY is closed over by reference, so in-place translation updates
// during buildDictionary are visible to `filename`.
let NAMING = createNaming({ languages: CFG.languages, dictionary: DICTIONARY });

function loadAppState() {
  CFG = getConfig();
  THEME = CFG.theme;
  NAMING = createNaming({ languages: CFG.languages, dictionary: DICTIONARY });
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

    // Defense-in-depth for Nominatim: if the request fails (429, 403, etc.),
    // return an empty JSON body so callers like getAddress() never see an
    // XML/HTML error page that would break response.json().
    if (!response.ok && urlStr?.includes("nominatim.openstreetmap.org")) {
      return new Response("{}", {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

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

async function generateIcons() {
  try {
    // Generate icons
    // Try icon sources: config.icon first, then theme.icon fallback
    const sources = [CFG.icon, CFG.theme?.icon].filter(Boolean);
    let iconBuffer;
    for (const src of sources) {
      try {
        const iconUrl = resolveMedia(src);
        const res = await originalFetch(iconUrl);
        if (res.ok) {
          iconBuffer = Buffer.from(await res.arrayBuffer());
          break;
        }
      } catch (err) {
        // try next source
      }
    }
    if (!iconBuffer) {
      // Fallback: accent tile + site initial so manifest URLs never 404
      const accent = CFG.theme?.accentColor || CFG.theme?.accentPrimary || "#cfa14d";
      const initial = (CFG.title || CFG.name || "P").charAt(0).toUpperCase();
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="192" height="192"><rect width="192" height="192" fill="${accent}"/><text x="96" y="125" font-family="sans-serif" font-size="110" font-weight="bold" fill="#fff" text-anchor="middle">${initial}</text></svg>`;
      iconBuffer = Buffer.from(svg);
      console.log("⚠️ No remote icon; using fallback accent tile for PWA icons.");
    }
    const versions = {};
    function hashFile(p) {
      try {
        const buf = fs.readFileSync(p);
        versions[path.basename(p)] = crypto.createHash("sha256").update(buf).digest("hex").slice(0, 12);
      } catch (e) {}
    }
    for (const size of [192, 512]) {
      try {
        const p = `./docs/public/icon-${size}.png`;
        await sharp(iconBuffer)
          .resize(size, size)
          .png()
          .toFile(p);
        hashFile(p);
      } catch (err) {
        console.error(`⚠️ Error generando icono ${size}:`, err.message);
      }
    }

    // Generate Apple touch icon (180x180) for iOS home-screen install
    try {
      const p = `./docs/public/apple-touch-icon.png`;
      await sharp(iconBuffer)
        .resize(180, 180)
        .png()
        .toFile(p);
      hashFile(p);
    } catch (err) {
      console.error(`⚠️ Error generando apple-touch-icon:`, err.message);
    }

    // generate the favicon
    try {
      const p = `./docs/public/favicon.png`;
      await sharp(iconBuffer)
        .resize(32, 32)
        .png()
        .toFile(p);
      hashFile(p);
    } catch (err) {
      console.error(`⚠️ Error generando favicon:`, err.message);
    }

    // Write icon versions for query-param cache busting
    try {
      fs.writeFileSync(`./docs/public/icon-versions.json`, JSON.stringify(versions, null, 2));
    } catch (e) {
      console.error("⚠️ Error writing icon-versions.json:", e.message);
    }

  } catch (e) {
    console.log(e, "failed to generateIcons");
  }
}

function render(text, index = 1) {
  if (typeof text !== "string") return "";
  const loading = index >= 1 ? 'fetchpriority="low" loading="lazy"' : 'fetchpriority="high" loading="eager"';
  return md.render(text).replaceAll("<img ", "<img " + loading + " ");
}

async function postComplete(fm) {
  if (!fm.sections) return;
  // Resolve every media image to its remote URL up front.
  bakeMedia(fm);
  addMeta(fm);
  for (var i = 0; i < fm.sections.length; i++) {
    if (typeof fm.sections[i].html === "string") {
      fm.sections[i].html = render(fm.sections[i].html, i);
      fm.sections[i].type = "text";
      fm.sections[i]._block = "gallery";
    }
    if (fm.sections[i]._block == "legal") {
      // The legal block stores its rich content in `.legal`, NOT `.html`. We
      // render it here fresh so the project summary will translate the contact
      // data while this legal boilerplate stays as authored (see the TODO about
      // interpolating {{placeholders}} instead of hardcoding the text).
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
          elem.link = "/" + NAMING.filename(elem.file, elem.title, fm.lang).replace("index", "");
        }
        return elem;
      });
    }

    // "video-gospel" renders the audio+books reading set for the *current* page
    // language: filters become the book list, elements the audio tracks, all
    // laid out in one horizontal strip.
    if (fm.sections[i]._block == "video-gospel") {
      const { audios, books } = await getAudio(fm.lang);
      fm.sections[i].filters = books;
      fm.sections[i].query = false;
      fm.sections[i].elements = audios;
      (fm.sections[i].tags ??= []).push("horizontal");
    }
    // "video-channel" slices the site's YouTube uploads by keyword: an optional
    // `filter` narrows globally, `filters[]` is a word-allowlist, and each match
    // gets an embeddable iframe src + YouTube thumbnail.
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
    } else if (fm.sections[i]._block == "video-instagram") {
      fm.sections[i].elements = instagram
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
        .map((v) => ({ ...v, src: v.url || `https://www.instagram.com/p/${v.videoId || ""}/embed/`, image: v.image || v.thumbnailUrl || "" }))
        .slice(0, 150);
      (fm.sections[i].tags ??= []).push("mansonry");
    } else if (fm.sections[i]._block == "calendar") {
      // Calendar.vue renders a grouped table (group -> subkey -> rows). The
      // order can come from the new per-level single-select fields
      // (orderTabla, orderFila, orderColumna, orderSubfila, orderNotas) or, for
      // backward compatibility, from the legacy `order` array. assembleOrder()
      // normalizes both into the flat array that groupEvents() expects.
      const order = assembleOrder(fm.sections[i]);
      fm.sections[i].events = groupEvents(fm.sections[i].events, order);
    } else if (fm.sections[i]._block == "gospel") {
      fm.sections[i].gospel = await getBibleReadings({ lang: getCode(fm.lang), date: new Date(), gospelOnly: !fm.sections[i].readings });
    }

  }

  // FAQ derived from the page's events — computed once, after the section loop
  // (it doesn't depend on per-section state and was previously recomputed on
  // every iteration).
  if (fm.events) {
    fm.faq = getEventFAQ(fm.events, fm.lang);
  }
}

// Resolve a `_block:"links"` value that is a page ref (stable `id`) into a
// card element carrying that page's data plus a `file` set to the page's output
// slug, so postComplete's link builder (lines ~212-219) emits a correct
// per-language href — mirroring navBar.resolveLink. Returns null for .md paths,
// external URLs, and unknown refs; the caller then falls back to getPreview.
function resolveLinkElement(url, pages, translatedNames) {
  if (
    typeof url !== "string" ||
    url.endsWith(".md") ||
    /^(https?:)?\/\//.test(url) ||
    url.startsWith("/")
  ) {
    return null;
  }
  const s = url;
  const page =
    pages.find((p) => p.id != null && String(p.id) === s) ||
    pages.find((p) => p.name != null && String(p.name) === s);
  if (!page) return null;
  const file = page.slug + (translatedNames ? ".md" : ""); // index.md / index both handled by filename()
  return { title: page.title || "", description: page.description || "", image: page.image || "", aspect: 16 / 9, file };
}

async function autocomplete(fm, pages) {
  console.log("autocomplete: ", fm.title);
  if (!fm.image) fm.image = config?.theme?.image
  if (!fm.sections) return;
  const translatedNames = config.pages?.filenameMode !== "original";
  for (var i = 0; i < fm.sections.length; i++) {
    fm.sections[i].index = i;
    if (fm.sections[i].links) {
      fm.sections[i].elements = await Promise.all(
        fm.sections[i].links.map((url) => resolveLinkElement(url, pages, translatedNames) || getPreview(url))
      );
    }
    if (fm.sections[i]._block == "links") {
      fm.sections[i]._block = "gallery-feature";
      fm.sections[i].type = fm.sections[i].type || "team-cards";
      (fm.sections[i].tags ??= []).push("small");
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

    // 47herri nav style: the home page shows every non-recurring event
    // ("byday:empty"), while non-home pages show only events matching the page
    // title. This replaces fm.events for the whole page.
    if (THEME.navStyle == "47herri") {
      let filter = fm.home ? "byday:empty" : fm.title;
      fm.events = calendar.filter((obj) => applyComplexFilter(obj, filter));
      fm.faq = getEventFAQ(fm.events, fm.lang);
    }
  }
  // Sections tagged "hidden" are NOT dropped here: they're filtered out at render
  // time by Layout.vue (v-if="!section.tags?.includes('hidden')").
}

function absoluteURL(url) {
  if (url.startsWith("/")) {
    const siteurl = CFG.siteurl || "";
    return siteurl + url;
  }
  return url;
}

function imageURL(url) {
  return resolveMedia(url);
}

// Rewrite every image/media field in a page's data to its remote URL, so
// runtime components simply render an absolute URL. Applies under keys
// `image` / `images` anywhere in the tree (sections, elements, events, page).
export function bakeMedia(node) {
  if (Array.isArray(node)) {
    for (const item of node) bakeMedia(item);
    return node;
  }
  if (node && typeof node === "object") {
    for (const k of Object.keys(node)) {
      if (k === "image" || k === "images") {
        if (Array.isArray(node[k])) node[k] = node[k].map((i) => (typeof i === "string" ? resolveMedia(i) : i));
        else if (typeof node[k] === "string") node[k] = resolveMedia(node[k]);
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

// Deep-clone `template` (never mutating config) and replace {placeholders} with
// each place's fields. Whole-string placeholders like {images} inject the raw
// value (an array); inline {prop} placeholders are string-substituted. In an
// array context a whole-string placeholder that resolves to an array is spliced
// in (e.g. `list: ["{images}"]` -> `list: ["a.webp","b.webp"]`).
export function substitute(template, place) {
  const tags = Object.fromEntries((place.tags || []).map(item => [item.key, item.value]))
  const ctx = { ...place, image: place.images?.[0], ...tags };
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
let instagram = [];
let calendar = [];

// Legal / privacy-policy page. The repo-root, hand-authored template
// (aviso-legal-y-politica-de-privacidad.md) ships with {{PLACEHOLDER}} tokens for
// parish identity/contact data. Here we fill them from config and render the
// `.legal` markdown into `.html`, so every generated site gets a real, personalized
// legal/privacy/cookies page instead of a placeholder-filled stub. The parish
// identity fields (CIF, diocese, structured address...) are not in the config
// schema yet, so most are inferred (first temple reverse-geocoded, first
// collaborator contact) and the rest default to blank. Spanish only for now — the
// template is Castilian and legal wording shouldn't be machine-translated.
async function generateLegalPage() {
  const template = read("./aviso-legal-y-politica-de-privacidad.md");
  const section = template.data?.sections?.[0];
  if (!section?.legal) {
    console.warn("legal: no aviso-legal-y-politica-de-privacidad.md template found; skipping");
    return;
  }

  // First temple (info.places[0]) is reverse-geocoded like the map blocks, so we
  // can pull a street / town / province / postcode from real coordinates. When the
  // temple has no `.geo` the address fields stay blank.
  const place = config.info?.places?.[0] ?? config.places?.list?.[0];
  const address = place?.geo
    ? (await getAddress(...place.geo.split(",").map((s) => Number(s.trim())), place.name).catch(() => ({})))
    : {};

  // Contact data lives on collaborators as free-form social[] strings (or legacy
  // phonenumber). Regex-pick the first phone and the first email across them.
  const collaborators = config.info?.collaborators ?? config.site?.collaborators ?? [];
  const contact = collaborators
    .flatMap((c) => [...(c.social ?? []), c.phonenumber].filter(Boolean))
    .filter(Boolean);
  const findContact = (re) => contact.find((s) => re.test(s)) || "";

  const ctx = {
    NOMBRE_PARROQUIA: config.site?.title || config.info?.title || config.title || "",
    DIRECCION_COMPLETA: address.street || "",
    LOCALIDAD: address.city || "",
    PROVINCIA: address.region || "",
    CODIGO_POSTAL: address.zip || "",
    DIOCESIS: address.region ? `Diócesis de ${address.region}` : "",
    TELEFONO: findContact(/^\+?[\d\s().-]{6,}$/),
    EMAIL_CONTACTO: findContact(/\S+@\S+\.\S+/),
    // CIF isn't collected on the schema yet — emit blank and replace.
    CIF_PARROQUIA: "",
    // Hosting is ours (Cloudflare Pages, EU), not the parish's — a factory constant.
    UBICACION_SERVIDOR: "la Unión Europea (Cloudflare)",
    FECHA_ACTUALIZACION: new Date().toLocaleDateString("es-ES", {
      day: "numeric", month: "long", year: "numeric",
    }),
  };

  // Substitute {{NAME}} / legacy {name} tokens in the legal text — same token regex
  // as substitute() above, but driven by the contact context (values may be empty
  // strings, so use an own-key check, not truthiness).
  const TOKEN = /\{\{\s*([A-Za-z]\w*)\s*\}\}|\{([A-Za-z]\w*)\}/g;
  section.legal = section.legal.replace(TOKEN, (m, a, b) => (Object.hasOwn(ctx, a || b) ? ctx[a || b] : m));

  // Render into a normal gallery/text section (the same path postComplete takes).
  // Spanish only — legal wording must not be auto-translated.
  const esLang = NAMING.TARGET_LANGS.find((l) => l.endsWith(":es")) || NAMING.TARGET_LANGS[0];
  const page = {
    title: "Aviso legal y política de privacidad",
    lang: esLang,
    sections: [{ ...section, type: "text", _block: "gallery", html: render(section.legal) }],
  };
  addMeta(page);
  const dest = "./docs/aviso-legal-y-politica-de-privacidad.md"
  write(dest, page, "");
}

async function run() {
  // Materialize (or refresh) the remote config before reading any page data.
  try {
    await fetchConfig(SLUG);
  } catch (e) {
    if (SLUG) console.warn("fetch: config fetch failed (using existing):", e.message);
  }
  config = read("./docs/public/config.json");
  loadAppState();

  // Inject a synthetic 404 page into the page list so it flows through the same
  // LLM translation + per-language emission pipeline as authored pages. We write
  // config.json back to disk first — buildDictionary() re-reads it from disk
  // (translate.js) to harvest translatable strings, so an in-memory-only mutation
  // would miss the 404 copy. The `slug === "404"` guard prevents double-injection
  // on fetch-fallback re-runs.
  if (!config.pages?.list?.some((p) => p.slug === "404")) {
    (config.pages ??= {}).list ??= [];
    config.pages.list.push({
      id: "__nf__404",
      title: "Página no encontrada",
      description: "La página que buscas no existe, pero el Buen Pastor sí te ha encontrado a ti.",
      slug: "404",
      hideHero: true,
      home: false,
      sections: [{
        _block: "gallery",
        type: "text",
        html: [
          `<img src="/good-shepherd.svg" alt="El Buen Pastor" style="width:min(520px,100%)" />`,
          "## ¡Uy! Te has perdido...",
          "No pasa nada: hasta la oveja descarriada tiene un lugar junto al Buen Pastor. Puede que te sientas perdido... pero no te preocupes: por muy perdido que estés, siempre hay un camino de regreso.",
          `> "Yo soy el camino, y la verdad, y la vida." (Juan 14, 6)`,
          `<a href="./" class="not-prose inline-block bg-accent text-white font-medium px-6 py-2 rounded-lg mt-4">Volver a la página de inicio</a>`,
        ].join("\n\n"),
      }],
    });
    write("./docs/public/config.json", config);
    config = read("./docs/public/config.json");
  }

  // Create some basic files. Fonts are downloaded + subset here (pre-build) so
  // the VitePress build step stays offline — config.js's getFontCSS short-
  // circuits on the already-present docs/public/*.woff2.
  await getFontCSS(THEME);
  await printCSS();
  calendar = await fetchCalendar();
  await generateIcons();
  videos = await fetchVideos();
  instagram = await fetchInstagram();
  await buildDictionary();

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
  // to any page whose title looks like a placeholder — but never one that's the
  // event template (which also starts with a `{{` placeholder title).
  const eventTemplate = pagesArr.find((p) => p.protected == "Plantilla eventos");
  const townTemplate =
    pagesArr.find((p) => p.protected == "Plantilla pueblos") ||
    pagesArr.find((p) => p.protected == "Plantilla templos")
  // "Crear una página nueva automaticamente para cada templo" checkbox.
  const perPlace = config.pages?.pageperlocatoin ?? true;

  // The index page is the one marked protected:"Portada" (or home/slug==index),
  // resolved by the shared naming module.
  // Authored pages = the pages.list minus the two template pages (town + event),
  // which are only ever expanded per-place/per-event below, never emitted as a
  // literal {{...}} page.
  let pages = pagesArr
    .filter((p) => p !== townTemplate && p !== eventTemplate)
    .map((p) => ({ ...p, slug: NAMING.resolveSlug(p) }));

  // The legal/privacy page is generated solely by generateLegalPage() below (which
  // fills its {{PLACEHOLDER}} tokens from config). Remove it from the page loop so
  // the loop doesn't emit un-substituted stubs for every language.
  const LEGAL_TITLE = "Aviso legal y política de privacidad";
  pages = pages.filter((p) => p.title !== LEGAL_TITLE);

  // Home fallback: if none marked, the first hand-authored page becomes home.
  // Skip the injected 404 page so it is never promoted to index — slugify never
  // produces "404" from a title, but the injected page carries slug:"404" verbatim.
  if (pages.length && !pages.some((p) => p.slug == "index")) {
    const firstReal = pages.findIndex((p) => p.slug !== "404");
    if (firstReal >= 0) pages[firstReal] = { ...pages[firstReal], slug: "index", home: true };
  }

  // Auto-generate one page per place when the checkbox is on, a towntemplate is
  // authored, and an actual places list exists (skip otherwise).
  if (perPlace && townTemplate && Array.isArray(townTemplate.sections) && townTemplate.sections.length && places.length) {
    const taken = new Set(pages.map((p) => p.slug));
    for (const place of places) {
      if (!place || !place.name) continue;
      const slug = slugify(place.name) || "lugar";
      if (taken.has(slug)) continue; // light dedup — don't clobber an existing page
      taken.add(slug);
      pages.push({
        ...substitute(townTemplate, place),
        title: place.name,
        slug,
        home: false,
        group: "templos",
      });
    }
  }

  // "Plantilla eventos" — same idea, for events: a page in pages.list marked
  // protected:"Plantilla eventos" whose sections carry `{{event.*}}` placeholders,
  // expanded once per selected event. Selection is driven by pages.pageperevent,
  // a site-level list of event-type names/labels (the same editor pattern as
  // the event-type `icon`): every event belonging to a listed type gets a
  // dedicated page.
  const evTypes = config["event-types"]?.list ?? [];
  const pagePerEvent = new Set(
    (config.pages?.pageperevent ?? []).map((s) => String(s).toLowerCase())
  );
  const pageTypes = new Set(
    evTypes
      .filter((t) =>
        [t.name, t.label].filter(Boolean).some((f) =>
          pagePerEvent.has(String(f).toLowerCase())
        )
      )
      .flatMap((t) => [t.name, t.label].filter(Boolean).map((s) => String(s).toLowerCase()))
  );
  if (eventTemplate && Array.isArray(eventTemplate.sections) && eventTemplate.sections.length && pagePerEvent.size) {
    const taken = new Set(pages.map((p) => p.slug));
    for (const ev of calendar) {
      if (!ev || !pagePerEvent.has(ev.type)) continue; // only page-flagged event types
      // unique, e.g. /campamento-verano-2027-07-20/.
      const slug = slugify([ev.title, ev.dates?.[0], ev.rrule?.join('-')].filter(Boolean).join(" ")) || "evento";
      if (taken.has(slug)) continue; // light dedup — don't clobber an existing page
      taken.add(slug);
      ev.link = "/" + slug + "/"; // surface for event cards / calendar
      pages.push({
        ...substitute(eventTemplate, { ...ev, description: ev.notes }),
        title: ev.title,
        slug,
        home: false,
        // Event URLs must keep their date-suffixed slug (e.g. /misa-2027-07-20/),
        // so opt this page out of translated-title basenames — otherwise every
        // "Misa" on a different date would collide on the same .md file.
        filenameMode: "original",
        group: "eventos",
      });
    }
    // Re-write calendar.json with the link field added to page-producing events.
    write("./docs/public/calendar.json", calendar);
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
    data.source = page.source || (data.home ? "/" : "/" + slug); // 47herri home marker (see autocomplete)

    await autocomplete(data, pages);

    // Output basenames are per-language by default: each .md is named from that
    // language's translated title — slug(translate(title)) — e.g. es/imprimir.md,
    // de/drucken.md, ar/<hash>.md. Passing a `.md`-suffixed name makes filename()
    // take its translated-title branch (same path postComplete already uses).
    // A site can opt back into stable source-slug names with
    // pages.filenameMode:"original" (plain `slug` is used verbatim for every lang);
    // individual pages can do the same with their own filenameMode:"original"
    // (event pages use it to keep their date-suffixed slug in the URL).
    const original =
      config.pages?.filenameMode === "original" || page.filenameMode === "original";
    const translatedNames = !original;
    const nameArg = translatedNames ? slug + ".md" : slug;

    for (const lang of NAMING.TARGET_LANGS) {
      const dict = DICTIONARY[lang] || {};
      const translatedData = translateObject(data, dict);
      translatedData.lang = lang;
      translatedData.equiv = NAMING.TARGET_LANGS.map((lan) => {
        const href = "/" + NAMING.filename(nameArg, data.title, lan);
        return { lang: lan, href };
      });

      await postComplete(translatedData);

      // slug/home are pipeline-internal; drop them from the emitted frontmatter
      // (the legacy pages never carried them). Sites opting into stable original
      // slugs keep their frontmatter untouched.
      if (translatedNames) {
        delete translatedData.slug;
        delete translatedData.home;
      }

      const dest =
        "./docs/" +
        NAMING.filename(nameArg, data.title, lang) +
        ".md";
      write(dest, translatedData, ""); // config pages have no markdown body
    }
  }

  // Emit the legal/privacy page last; a failure here (e.g. a geocode timeout)
  // must never abort an otherwise-good build.
  try {
    await generateLegalPage();
  } catch (e) {
    console.warn("legal: could not generate the aviso legal page:", e.message);
  }
}

// Guard run() behind a main-module check (same pattern as fetch.js) so this
// module can be imported by test runners without triggering the full build.
const isMain = fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) run();
export { run };
