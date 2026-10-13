import { read, write, path } from "./node_utils.js";
import { slugify, getAddress, oklchToHex } from "./utils.js";
import { getPreview } from "./oembed.js";
import { fetchVideos } from "./youtube.js";
import { fetchInstagram } from "./instagram.js";
import { buildDictionary, dictionary as DICTIONARY } from "./translate.js";
import { fetchConfig } from "./fetch.js";
import { getBibleReadings, getAudio } from "./gospel.js";
import { printCSS, getFontCSS } from "./css.js";
import { fetchCalendar } from "./calendar.js";
import { planEventPages } from "./eventPages.js";
import crypto from "crypto";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

import { createContext, createResolveMedia, getConfigFrom, prepare, autocomplete, finalize, render, addMeta, bakeMedia as bakeMediaWith, substitute } from "./pageBuilder.js";
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
  return createResolveMedia(config, { data: DATA, slug: SLUG })(url);
}

export const getConfig = () => getConfigFrom(config);

// Rewrite every image/media field in a page's data to its remote URL.
export function bakeMedia(node) {
  return bakeMediaWith(node, resolveMedia);
}

// substitute() lives in pageBuilder.js (pure); re-exported for the tests/other callers.
export { substitute };

let CFG = getConfig();
let THEME = CFG.theme;

function loadAppState() {
  CFG = getConfig();
  THEME = CFG.theme;
}

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
      const accentHue = CFG.theme?.accentHue ?? 200;
      const initial = (CFG.title || CFG.name || "P").charAt(0).toUpperCase();
      const fillColor = oklchToHex(0.64, 0.2, accentHue);
      (CFG.theme ?? {}).fillColor = fillColor
      const size = 192;
      const fontSize = 110;
      const y = Math.round(size / 2 + (fontSize * 0.72) / 2); // 136
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><rect width="${size}" height="${size}" fill="${fillColor}"/><text x="${size / 2}" y="${y}" font-family="sans-serif" font-size="${fontSize}" font-weight="bold" fill="#fff" text-anchor="middle">${initial}</text></svg>`;
      iconBuffer = Buffer.from(svg);
      console.log("⚠️ No remote icon; using fallback accent tile for PWA icons. ", accentHue, svg);
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

    // generate the maskable icon
    try{
      let ACCENT = CFG.theme?.fillColor
      if (!ACCENT) {
        const { dominant } = await sharp(iconBuffer).stats();
        const toHex = ({ r, g, b }) => "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
        ACCENT = toHex(dominant)
      }
      const size = 512;
      const inner = Math.round(size * 0.50); // logo stays inside the safe zone

      const logo = await sharp("docs/public/icon-512.png") // your square logo, ideally with transparent background
        .resize(inner, inner, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .toBuffer();

      await sharp({ create: { width: size, height: size, channels: 4, background: ACCENT } })
        .composite([{ input: logo, gravity: "center" }])
        .png()
        .toFile("docs/public/icon-maskable-512.png");
    } catch (err) {
      console.error(`⚠️ Error generando icon-maskable-512:`, err.message);
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

// Legal / privacy-policy page. The repo-root, hand-authored template
// (aviso-legal-y-politica-de-privacidad.md) ships with {{PLACEHOLDER}} tokens for
// parish identity/contact data. Here we fill them from config and render the
// `.legal` markdown into `.html`, so every generated site gets a real, personalized
// legal/privacy/cookies page instead of a placeholder-filled stub. The parish
// identity fields (CIF, diocese, structured address...) are not in the config
// schema yet, so most are inferred (first temple reverse-geocoded, first
// collaborator contact) and the rest default to blank. Spanish only for now — the
// template is Castilian and legal wording shouldn't be machine-translated.
async function generateLegalPage(bctx) {
  const template = read("./aviso-legal-y-politica-de-privacidad.md");
  const section = template.data?.sections?.[0];
  if (!section?.legal) {
    console.warn("legal: no aviso-legal-y-politica-de-privacidad.md template found; skipping");
    return;
  }

  const address = (config.info?.places?.find( p => !!p.address) || {} ).address || ''

  const collaborators = ( config.info?.collaborators ?? [])
    .flatMap((c) => [...(c.social ?? []), c.phonenumber])
    .filter(Boolean)

  const contact = (config.info?.social ?? []).concat(collaborators)

  console.log(contact)
  const findContact = (re) => contact.find((s) => re.test(s)) || "";


  

  const legalCtx = {
    NOMBRE_PARROQUIA: config.info?.title || "",
    ADDRESS: address,
    DIOCESIS: `Diócesis de ${address?.split(',').toReversed()[0] || ''}`,
    TELEFONO: findContact(/^\+?[\d\s().-]{6,}$/),
    EMAIL_CONTACTO: findContact(/\S+@\S+\.\S+/),
    CIF_PARROQUIA: config.info.cif || '',
    UBICACION_SERVIDOR: "la Unión Europea (Cloudflare)",
    FECHA_ACTUALIZACION: new Date().toLocaleDateString("es-ES", {
      day: "numeric", month: "long", year: "numeric",
    }),
  };

  // Substitute {{NAME}} / {name} tokens in the legal text — same token regex
  // as substitute() above, but driven by the contact context (values may be empty
  // strings, so use an own-key check, not truthiness).
  const TOKEN = /\{\{\s*([A-Za-z]\w*)\s*\}\}|\{([A-Za-z]\w*)\}/g;
  section.legal = section.legal.replace(TOKEN, (m, a, b) => (Object.hasOwn(legalCtx, a || b) ? legalCtx[a || b] : m));

  // Render into a normal gallery/text section (the same path postComplete takes).
  // Spanish only — legal wording must not be auto-translated.
  const esLang = bctx.NAMING.TARGET_LANGS.find((l) => l.endsWith(":es")) || bctx.NAMING.TARGET_LANGS[0];
  const page = {
    title: "Aviso legal y política de privacidad",
    lang: esLang,
    hideHero: true,
    sections: [{ ...section, type: "text", _block: "gallery", html: render(section.legal) }],
  };
  addMeta(page, bctx);
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
  const calendar = await fetchCalendar();
  await generateIcons();
  const videos = await fetchVideos();
  const instagram = await fetchInstagram();
  await buildDictionary();

  // One context for the whole build — the same shape the browser preview builds
  // (see Layout.vue), but with the real Node-side I/O injected.
  const ctx = createContext({
    config, calendar, videos, instagram,
    dictionary: DICTIONARY,
    media: { data: DATA, slug: SLUG },
    deps: { getPreview, getAddress, getBibleReadings, getAudio },
  });
  const NAMING = ctx.NAMING;

  // Pages are authored as data (config.pages.list) by the editor, not as .md
  // files — iterate that array instead of globbing docs/public/pages/*.md.
  const pagesArr = config.pages?.list ?? [];
  const places = config.info?.places ?? [];
  const eventTemplate = pagesArr.find((p) => p.protected == "Plantilla eventos");
  const townTemplate = pagesArr.find((p) => p.protected == "Plantilla templos")
  const perPlace = config.pages?.pageperlocatoin ?? true;

  // Authored pages = the pages.list minus the two template pages (town + event),
  // which are only ever expanded per-place/per-event below, never emitted as a
  // literal {{...}} page.
  let pages = pagesArr
    .filter((p) => p !== townTemplate && p !== eventTemplate)
    .map((p) => ({ ...p, slug: NAMING.resolveSlug(p) }));

  // Home fallback: if none marked, the first hand-authored page becomes home.
  // Skip the injected 404 page so it is never promoted to index — slugify never
  // produces "404" from a title, but the injected page carries slug:"404" verbatim.
  if (pages.length && !pages.some((p) => p.slug == "index")) {
    let firstReal = pagesArr.findIndex((p) => p.protected == "Portada");
    if (firstReal < 0) firstReal = pages.findIndex((p) => p.slug !== "404");
    if (firstReal >= 0) pages[firstReal] = { ...pages[firstReal], slug: "index", home: true };
  }

  // Auto-generate one page per place when the checkbox is on, a towntemplate is
  // authored, and an actual places list exists (skip otherwise).
  if (perPlace && townTemplate && Array.isArray(townTemplate.sections) && townTemplate.sections.length && places.length) {
    for (const place of places) {
      if (!place || !place.name) continue;
      pages.push({
        ...substitute(townTemplate, place),
        title: place.name,
        slug: slugify(place.name),
        home: false,
        group: "templos",
      });
    }
  }

  // "Plantilla eventos" — same idea, for events: a page in pages.list marked
  // protected:"Plantilla eventos" whose sections carry placeholders, expanded once
  // per generated page. What gets a page is decided per event-type by its
  // `pageMode` (see eventPages.js): "type" = one page for the type, "event" = one
  // page per event of the type, "none" = no page. Types without a pageMode that
  // are listed in the legacy pages.pageperevent array resolve to "event".
  // Without a usable template nothing is generated, so the plan stays empty and
  // eventCards never links to a page that does not exist.
  const hasEventTemplate = !!(eventTemplate && Array.isArray(eventTemplate.sections) && eventTemplate.sections.length);
  const eventPlan = hasEventTemplate
    ? planEventPages({ config, calendar, takenSlugs: new Set(pages.map((p) => p.slug)) })
    : planEventPages({ config: {}, calendar: [] });
  ctx.eventPages = eventPlan; // eventCards (pageBuilder.autocomplete) reads the same plan
  if (hasEventTemplate && (eventPlan.typePages.length || eventPlan.eventPages.length)) {
    for (const { type, key, title, slug, data } of eventPlan.typePages) {
      for (const ev of calendar) if (ev?.type === key) ev.link = "/" + slug + "/"; // surface for event cards / calendar
      pages.push({
        ...substitute(eventTemplate, data),
        title,
        slug,
        home: false,
        // Keep the type slug stable across languages (event cards link to /<slug>/).
        filenameMode: "original",
        group: "eventos",
      });
    }

    for (const { ev, slug } of eventPlan.eventPages) {
      // unique, e.g. /campamento-verano-2027-07-20/.
      ev.link = "/" + slug + "/"; // surface for event cards / calendar
      const data = { html: ev.notes?.[0], ...ev.place, ...ev, description: ev.notes?.[0] }
      pages.push({
        ...substitute(eventTemplate, data),
        title: ev.title,
        slug,
        home: false,
        // Event URLs must keep their date-suffixed slug (e.g. /misa-2027-07-20/),
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
    // prepare() maps `type` -> `_block` (never overwrites an existing one) and sets
    // home/source (47herri home marker, see autocomplete).
    const data = prepare(page, slug);

    await autocomplete(data, pages, ctx);

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
      const equiv = NAMING.TARGET_LANGS.map((lan) => ({
        lang: lan,
        href: "/" + NAMING.filename(nameArg, data.title, lan),
      }));
      const translatedData = await finalize(data, lang, ctx, { equiv });

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
    await generateLegalPage(ctx);
  } catch (e) {
    console.warn("legal: could not generate the aviso legal page:", e.message);
  }
}

// Guard run() behind a main-module check (same pattern as fetch.js) so this
// module can be imported by test runners without triggering the full build.
const isMain = fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) run();
export { run };
