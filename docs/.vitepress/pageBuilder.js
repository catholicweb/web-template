// Isomorphic page builder: everything that turns an authored page (raw config
// sections) into renderable sections. No fs / node imports, so it runs both in the
// build adapter (createFiles.js) and in the browser (Layout.vue live preview).
//
// All state comes from a `ctx` built by createContext(); I/O (oembed scraping,
// geocoding, bible API) is injected via ctx.deps so Node and the browser can differ.
import MarkdownIt from "markdown-it";
import { applyComplexFilter, groupEvents, getAddress as rawGetAddress, assembleOrder, defaultTags } from "./utils.js";
import { translateObject } from "./translate-core.js";
import { createNaming, getCode } from "./naming.js";
import { getBibleReadings as rawGetBibleReadings, getAudio as rawGetAudio } from "./gospel.js";
import { getEventFAQ } from "./faq.js";
import { eventCardsFor, planEventPages } from "./eventPages.js";

const md = new MarkdownIt({ html: true, linkify: true, breaks: true });

// Tolerant reads: fields may sit top-level (legacy layout) or nested per the
// editor's tabbed schema (site.* / pages.languages).
export function getConfigFrom(config = {}) {
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
}

// Resolve a media path (/media/...) to its remote URL. Absolute URLs pass through.
// `data`/`slug` only matter for configs without `_media.base`.
export function createResolveMedia(config, { data = "https://data.parroquia.app", slug = "" } = {}) {
  const base = () => config?._media?.base || `${String(data).replace(/\/$/, "")}/${slug}`;
  return (url) => {
    if (!url) return url;
    if (/^(https?:)?\/\//.test(url)) return url;
    if (url.startsWith("/media/")) {
      const token = url.replace(/^\/media\//, "").replace(/\//g, "-");
      return `${base()}/${token}`;
    }
    return url;
  };
}

// ---- browser-safe default deps (Node's createFiles.js passes the raw ones) ----
const memo = (fn) => {
  const cache = new Map();
  return (...args) => {
    const k = JSON.stringify(args);
    if (!cache.has(k)) cache.set(k, fn(...args));
    return cache.get(k);
  };
};
const safe = (fn, fallback) => async (...args) => {
  try {
    return await fn(...args);
  } catch (e) {
    console.warn("preview dep failed (non-fatal):", e?.message || e);
    return fallback;
  }
};
// open-graph-scraper is Node-only; in the browser links render as bare cards.
const stubPreview = async (url) => ({ type: "link", src: url, title: "", description: "", image: "", aspect: 16 / 9 });
const browserDeps = {
  getPreview: stubPreview,
  getAddress: memo(rawGetAddress),
  getAudio: safe(rawGetAudio, { audios: [], books: [] }),
  getBibleReadings: safe(rawGetBibleReadings, undefined),
};

export function createContext({ config = {}, calendar = [], videos = [], instagram = [], dictionary = {}, deps = {}, media = {} } = {}) {
  const CFG = getConfigFrom(config);
  const NAMING = createNaming({ languages: CFG.languages, dictionary });
  const pages = (config.pages?.list ?? []).map((p) => ({ ...p, slug: NAMING.resolveSlug(p) }));
  return {
    config,
    CFG,
    THEME: CFG.theme,
    NAMING,
    pages,
    calendar,
    videos,
    instagram,
    dictionary,
    resolveMedia: createResolveMedia(config, media),
    deps: { ...browserDeps, ...deps },
  };
}

// Raw authored page -> the shape autocomplete/finalize expect.
export function prepare(page, slug = page?.slug) {
  const home = slug == "index" || !!page?.home;
  return {
    ...page,
    sections: Array.isArray(page?.sections) ? page.sections.map((s, i) => ({ ...s, _block: s._block || s.type, index: i })) : page?.sections,
    home,
    source: page?.source || (home ? "/" : "/" + (slug ?? "")),
  };
}

// Pipeline: prepare() -> autocomplete() once per page (language-independent: network
// lookups, event filtering) -> finalize() once per language.
//
// finalize(): translate, then bake media / markdown / grouped events.
export async function finalize(data, lang, ctx, { equiv } = {}) {
  const out = translateObject(data, ctx.dictionary?.[lang] || {});
  out.lang = lang;
  if (equiv) out.equiv = equiv;
  await postComplete(out, ctx);
  return out;
}

export function render(text, index = 1) {
  if (typeof text !== "string") return "";
  const loading = index >= 1 ? 'fetchpriority="low" loading="lazy"' : 'fetchpriority="high" loading="eager"';
  return md.render(text).replaceAll("<img ", "<img " + loading + " ");
}


export async function postComplete(fm, ctx) {
  if (!fm.sections) return;
  const { NAMING, videos, instagram } = ctx;
  const { getAudio, getBibleReadings } = ctx.deps;
  // Resolve every media image to its remote URL up front.
  bakeMedia(fm, ctx.resolveMedia);
  addMeta(fm, ctx);
  for (var i = 0; i < fm.sections.length; i++) {
    if (typeof fm.sections[i].html === "string") {
      fm.sections[i].html = render(fm.sections[i].html, i);
      fm.sections[i].type = "text";
      fm.sections[i]._block = "gallery";
    }
    if (fm.sections[i]._block == "legal") {
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

    // Default tags below only apply when the user has not picked a tag of the same
    // group (layout / size) themselves; see defaultTags() in utils.js.

    // "video-gospel" renders the audio+books reading set for the *current* page
    // language: filters become the book list, elements the audio tracks, all
    // laid out in one horizontal strip by default.
    if (fm.sections[i]._block == "video-gospel") {
      const { audios, books } = await getAudio(fm.lang);
      fm.sections[i].filters = books;
      fm.sections[i].query = false;
      fm.sections[i].elements = audios;
      fm.sections[i].tags = defaultTags(fm.sections[i].tags, ["horizontal"]);
      if (!fm.sections[i].elements.length) (fm.sections[i].tags ??= []).push("hidden");
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
        fm.sections[i].tags = defaultTags(fm.sections[i].tags, ["horizontal", "medium"]);
      }
      if (!fm.sections[i].elements.length) (fm.sections[i].tags ??= []).push("hidden");
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
      if (!fm.sections[i].elements.length) (fm.sections[i].tags ??= []).push("hidden");
    } else if (fm.sections[i]._block == "calendar") {
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
export function resolveLinkElement(url, pages, translatedNames) {
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


export async function autocomplete(fm, pages = [], ctx) {
  const { config, THEME, calendar } = ctx;
  const { getPreview, getAddress } = ctx.deps;
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
      fm.sections[i].type = "team-cards"; // fm.sections[i].type || 
      fm.sections[i].tags = defaultTags(fm.sections[i].tags, ["small"]);
    } else if (fm.sections[i]._block == "gallery-feature") {
      fm.sections[i].type = "team-cards";
      fm.sections[i].tags = defaultTags(fm.sections[i].tags, ["small"]);
    } else if (fm.sections[i].type == 'gallery' && fm.sections[i].images) {
      fm.sections[i].elements = fm.sections[i].images.filter(Boolean).map((i) => {
        return { title: "", description: "", image: i };
      });
      fm.sections[i].type = "gallery";
      fm.sections[i].tags = defaultTags(fm.sections[i].tags, ["small"]);
      if (!fm.sections[i].elements.length) (fm.sections[i].tags ??= []).push("hidden");
    } else if (fm.sections[i]._block == "calendar") {
      fm.sections[i].events = calendar.filter((obj) => applyComplexFilter(obj, fm.sections[i].filter));
      if (!fm.sections[i].events?.length) (fm.sections[i].tags ??= []).push("hidden");
    } else if (fm.sections[i]._block == "eventCards") {
      // One card per event of the selected types (legacy), plus a card for every
      // other type/event that has its own page (see eventPages.js).
      const plan = ctx.eventPages ?? planEventPages({ config, calendar, takenSlugs: new Set(pages.map((p) => p.slug)) });
      fm.sections[i].events = eventCardsFor({ eventsToShow: fm.sections[i].eventsToShow, calendar, config, plan });
      // Masonry is the default layout, but any layout tag the user picked wins.
      fm.sections[i].tags = defaultTags(fm.sections[i].tags, ["visualCards", "masonry", "free-masonry"]);
      if (!fm.sections[i].events?.length) (fm.sections[i].tags ??= []).push("hidden");
    } else if (fm.sections[i]._block == "map") {
      const [latitude, longitude] = fm.sections[i].geo?.split(",").map((s) => Number(s.trim())) || [];
      if (!fm.sections[i].address) {
        const extra = await getAddress(latitude, longitude, fm.sections[i].name);
        fm.sections[i] = { ...extra, ...fm.sections[i], address: extra.address || fm.sections[i].address };
      }
    }

    // 47herri nav style: the home page shows every non-recurring event
    // ("byday:empty"), while non-home pages show only events matching the page
    // title. This replaces fm.events for the whole page.
    if (THEME.navStyle == "47herri" || ( Array.isArray(THEME.navStyle) && THEME.navStyle.includes('showEvents') ) ) {
      let filter = fm.home ? "byday:empty" : fm.title;
      fm.events = calendar.filter((obj) => applyComplexFilter(obj, filter));
      fm.faq = getEventFAQ(fm.events, fm.lang);
    }
  }
  // Sections tagged "hidden" are NOT dropped here: they're filtered out at render
  // time by Layout.vue (v-if="!section.tags?.includes('hidden')").
}


// Rewrite every image/media field in a page's data to its remote URL, so
// runtime components simply render an absolute URL. Applies under keys
// `image` / `images` anywhere in the tree (sections, elements, events, page).
export function bakeMedia(node, resolveMedia) {
  if (Array.isArray(node)) {
    for (const item of node) bakeMedia(item, resolveMedia);
    return node;
  }
  if (node && typeof node === "object") {
    for (const k of Object.keys(node)) {
      if (k === "image" || k === "images") {
        if (Array.isArray(node[k])) node[k] = node[k].map((i) => (typeof i === "string" ? resolveMedia(i) : i));
        else if (typeof node[k] === "string") node[k] = resolveMedia(node[k]);
      } else {
        bakeMedia(node[k], resolveMedia);
      }
    }
  }
  return node;
}


export function addMeta(fm, ctx) {
  const { CFG } = ctx;
  const imageURL = ctx.resolveMedia;
  const absoluteURL = (url) => (url.startsWith("/") ? (CFG.siteurl || "") + url : url);
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
  // The editor authors placeholders as `{{name}}` or `{name}` form.
  // A whole-string token splices the raw value (arrays intact); inline tokens are string-substituted.
  const TOKEN = /\{\{\s*([A-Za-z]\w*)\s*\}\}|\{([A-Za-z]\w*)\}/g;
  const WHOLE = /^\s*(?:\{\{\s*([A-Za-z]\w*)\s*\}\}|\{([A-Za-z]\w*)\})\s*$/;
  const replace = (s) => s.replace(TOKEN, (m, a, b) => (a || b) in ctx ? String(ctx[a || b]) : '');

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
      for (const k of Object.keys(node)) {
        let val = node[k];
        if (['image','images','title','html','geo','address'].includes(k) && ctx[k] !== undefined && (val === "" || val === null || val === undefined || (Array.isArray(val) && val.length === 0))) val = "{" + k + "}";
        out[k] = walk(val);
      }
      return out;
    }
    return node;
  };
  return walk(clone);
}
