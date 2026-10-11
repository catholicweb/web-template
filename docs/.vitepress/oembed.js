// oembed-ultra.js
import { read } from "./node_utils.js";
import ogs from "open-graph-scraper";

function extractIframeSrc(html) {
  const match = html?.match(/<iframe[^>]+src=["']([^"']+)["']/i);
  return match ? match[1] : null;
}

function round(num) {
  if (!num) return 1.78;
  return Math.round(num * 100) / 100;
}

function cleanTitle(str) {
  if (!str) return "";
  return str.split("|")[0].trim();
}

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const DEFAULT_HEADERS = {
  "User-Agent": UA,
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
  "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
};

async function fetchOembed(url) {
  const cleanUrl = url.replace(/&(?:amp|#038);/g, "&");
  const res = await fetch(cleanUrl, { headers: DEFAULT_HEADERS });
  if (!res.ok) throw new Error(`oEmbed failed with status ${res.status}`);
  const data = await res.json();

  return {
    title: cleanTitle(data.title),
    author: data.author_name || "",
    src: extractIframeSrc(data.html) || "",
    image: data.thumbnail_url || "",
    aspect: round((data.width || 16) / (data.height || 9)),
  };
}

const KNOWN_PROVIDERS = [
  { re: /youtube\.com|youtu\.be$/, api: "https://www.youtube.com/oembed" },
  { re: /vimeo\.com$/, api: "https://vimeo.com/api/oembed.json" },
  { re: /flickr\.com|flic\.kr$/, api: "https://www.flickr.com/services/oembed/" },
  { re: /dailymotion\.com|dai\.ly$/, api: "https://www.dailymotion.com/services/oembed" },
  { re: /soundcloud\.com$/, api: "https://soundcloud.com/oembed" },
  { re: /twitter\.com$/, api: "https://publish.twitter.com/oembed" },
  { re: /slideshare\.net$/, api: "https://www.slideshare.net/api/oembed/2" },
  { re: /scribd\.com$/, api: "https://www.scribd.com/services/oembed" },
  { re: /spotify\.com$/, api: "https://open.spotify.com/oembed" },
];

export async function getPreview(url) {
  try {
    if (url.endsWith(".md")) {
      return await localLinks(url);
    } else if (url.includes("sallebarne.eus")) {
      const html = await (await fetch("https://sallebarne.eus", { cache: "no-cache" })).text();
      const match = html.match(/sallebarne\.eus\/wp-content\/uploads\/([^-]+?)-([^\.]+?)\.jpg/);

      if (!match) throw new Error("sallebarne.eus: no image match found");
      return {
        type: "link",
        src: `https://sallebarne.eus/wp-content/uploads/${match[1]}.mp3`,
        title: cleanTitle(`Egunez egun ${match[1]?.split("/")[2]?.split(".").toReversed().join("-") || ""}`),
        image: `https://sallebarne.eus/wp-content/uploads/${match[1]}-${match[2]}.jpg`,
        aspect: round(16 / 9),
      };
    } else {
      return await getOEmbed(url);
    }
  } catch (e) {
    console.log(e);
    return {
      type: "link",
      src: url,
      title: "",
      image: googleFavicon(url),
      aspect: round(16 / 9),
    };
  }
}

async function getOEmbed(url) {
  const host = new URL(url).hostname.toLowerCase();

  // --- 1) Known Provider Check
  const known = KNOWN_PROVIDERS.find((p) => p.re.test(host));
  if (known) {
    const params = new URLSearchParams({ url, format: "json" });
    // Vimeo sizes its thumbnail to the requested width (default is tiny)
    if (/vimeo\.com$/.test(host)) params.set("width", "1280");
    const oembedUrl = `${known.api}?${params.toString()}`;
    return fetchOembed(oembedUrl);
  }

  return openGraphScraper(url);
}

/* ── IMAGE DISCOVERY ───────────────────────────────────────────────────────── */

const asArray = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);

// Google's favicon service: always returns something, up to 256px
function googleFavicon(targetUrl) {
  try {
    const { hostname } = new URL(targetUrl);
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=256`;
  } catch {
    return "";
  }
}

// First social/preview image the site itself declares, in order of trust:
// og:image → twitter:image → JSON-LD → other metadata. No network, no scoring.
function pickSocialImage(result, targetUrl) {
  const nodes = asArray(result.jsonLD).flatMap((n) => asArray(n?.["@graph"] ?? n));
  const candidates = [
    ...asArray(result.ogImage),
    result.ogImageSecureUrl,
    ...asArray(result.twitterImage),
    result.twitterImageSrc,
    ...nodes.flatMap((n) => [...asArray(n?.image), ...asArray(n?.primaryImageOfPage), ...asArray(n?.thumbnailUrl)]),
    result.schemaImage,
    result.dcImage,
    result.dcImageSrc,
    result.articleImage,
    ...asArray(result.alImage),
  ];

  for (const c of candidates) {
    const raw = typeof c === "string" ? c : c?.url;
    if (typeof raw !== "string" || !raw.trim() || raw.startsWith("data:")) continue;
    try {
      const url = new URL(raw.trim(), targetUrl).href;
      if (/^https?:/.test(url)) return url;
    } catch {}
  }
  return "";
}

export async function openGraphScraper(targetUrl) {
  try {
    const { result } = await ogs({
      url: targetUrl,
      fetchOptions: { headers: { "user-agent": UA } },
    });

    const title = result.ogTitle || result.twitterTitle || result.ogSiteName || "";

    return {
      type: "link",
      src: result.ogUrl || targetUrl,
      title: cleanTitle(title),
      image: pickSocialImage(result, targetUrl) || googleFavicon(targetUrl),
      aspect: 1.78,
    };
  } catch (error) {
    console.error(error);
    return {
      type: "link",
      src: targetUrl,
      title: "",
      image: googleFavicon(targetUrl),
      aspect: 1.78,
    };
  }
}

function localLinks(linkPath) {
  const { data } = read(linkPath);
  return {
    title: cleanTitle(data.title),
    description: data.description || "",
    image: data.image || "",
    aspect: round(16 / 9),
    file: linkPath,
  };
}