import { read, write, fg, fs, path } from "./node_utils.js";
import { slugify, applyComplexFilter, groupEvents, getAddress } from "./utils.js";
import { getPreview } from "./oembed.js";
import { fetchVideos } from "./youtube.js";
import { buildDictionary, translateObject, translateValue, dictionary as DICTIONARY } from "./translate.js";
import { createImages } from "./images.js";
import { download } from "./migrate.js";
import { getBibleReadings, getAudio } from "./gospel.js";
import { printCSS } from "./css.js";
import { getEventFAQ } from "./seo.js";
import { fetchCalendar } from "./calendar.js";
import { sendNotifications } from "./notify.js";
import crypto from "crypto";

import MarkdownIt from "markdown-it";
import sharp from "sharp";



const config = read("./docs/public/pages/config.json");
// Lista de lenguas a generar
const TARGET_LANGS = config.languages?.length ? config.languages : ["Español:es"];

const md = new MarkdownIt({ html: true, linkify: true, breaks: true });

const CACHE_FILE = "./.buildtimecache.json";
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
      name: config.title,
      short_name: config.title,
      description: config.description,
      start_url: "/",
      display: "standalone",
      background_color: config.theme.accentColor,
      theme_color: config.theme.accentColor,
      icons: [
        { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
        { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      ],
    };
    write("./docs/public/manifest.json", manifest);

    // Generate icons
    if (!config.icon) return;
    for (const size of [192, 512]) {
      try {
        await sharp("./docs/public" + config.icon)
          .resize(size, size)
          .png()
          .toFile(`./docs/public/icon-${size}.png`);
      } catch (err) {
        console.error(`⚠️ Error generando icono ${size}:`, err.message);
      }
    }

    // generate the favicon

    await sharp("./docs/public" + config.icon)
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
      fm.sections[i].events = groupEvents(fm.sections[i].events, fm.sections[i].order);
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

    if (config.theme.navStyle == "47herri") {
      let filter = fm.source == "./docs/public/pages/index.md" ? "byday:empty" : fm.title;
      fm.events = calendar.filter((obj) => applyComplexFilter(obj, filter));
      fm.faq = getEventFAQ(fm.events);
    }
  }
  // remove hidden sections
  //fm.sections = fm.sections.filter((obj) => !obj.tags?.includes("hidden"));
}

function absoluteURL(url) {
  if (url.startsWith("/")) {
    const siteurl = config?.dev?.siteurl || "";
    return siteurl + url;
  }
  return url;
}

function imageURL(url) {
  const basePath = url.replace(/^\/media\//, "").replace(/\.[^/.]+$/, ".webp");
  return absoluteURL(`/media/md/${basePath}`);
}

function addMeta(fm) {
  fm.head ??= [];
  fm.head.push(["meta", { property: "og:type", content: "website" }]);
  fm.head.push(["meta", { property: "og:title", content: fm.title || config.title }]);
  fm.head.push(["meta", { property: "og:description", content: fm.description || config.description }]);
  fm.head.push(["meta", { property: "og:image", content: imageURL(fm.image || config.image) }]);
  fm.head.push(["meta", { property: "twitter:card", content: "summary_large_image" }]);
  fm.head.push(["meta", { property: "twitter:image", content: imageURL(fm.image || config.image) }]);

  if (!fm?.equiv) return;
  for (var i = 0; i < fm.equiv.length; i++) {
    const hreflang = i == 0 ? "x-default" : getCode(fm.equiv[i].lang);
    fm.head.push(["link", { rel: "alternate", hreflang, href: absoluteURL(fm.equiv[i].href).replace(/index$/, "") }]);
  }
}

async function cleanDir(dir) {
  console.log("TODO: since ./docs is no longer stored on git, this should be rethinked...");
  console.log("Cleaning directory (writing redirects)");
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

function filename(file, title, lang) {
  let code = TARGET_LANGS[0] == lang ? "" : getCode(lang) + "/";
  if (path.basename(file) == "index.md") return code + path.parse(file).name;
  const dict = DICTIONARY[lang] || {};
  return code + slugify(translateValue(title, dict));
}

let videos = [];
let calendar = [];

async function run() {
  // Create some basic files
  await printCSS();
  calendar = await fetchCalendar();
  await sendNotifications();
  await createManifest();
  videos = await fetchVideos();
  await buildDictionary();
  await createImages();

  // Clean output dir and repopulate
  //await cleanDir("./docs/");
  const files = await fg(["**/*.md"], { cwd: "./docs/public/pages/", absolute: false });
  for (const file of files) {
    const { data, content } = read("./docs/public/pages/" + file);
    data.source = "./docs/public/pages/" + file;
    await autocomplete(data);

    for (const lang of TARGET_LANGS) {
      const dict = DICTIONARY[lang] || {};
      const translatedData = translateObject(data, dict);
      translatedData.lang = lang;
      translatedData.equiv = TARGET_LANGS.map((lan) => {
        return { lang: lan, href: "/" + filename(file, data.title, lan) };
      });

      await postComplete(translatedData);

      const dest = "./docs/" + filename(file, data.title, lang) + ".md";
      write(dest, translatedData, content);
    }
  }
}

run();
