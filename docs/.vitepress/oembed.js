// oembed-ultra.js
import { Parser } from "htmlparser2";
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


const DEFAULT_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
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
      image: "",
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
    const oembedUrl = `${known.api}?${params.toString()}`;
    return fetchOembed(oembedUrl);
  }

  return openGraphScraper(url)

}

export async function openGraphScraper(targetUrl) {
  const options = {
    url: targetUrl,
    fetchOptions: {
      headers: {
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    },
  };

  try {
    const { result } = await ogs(options);

// 1. Collect and normalize all candidate URLs into full absolute paths
const rawCandidates = [
  result.ogImage?.[0]?.url,
  result.ogImage?.url,
  result.ogImageSecureUrl,
  result.twitterImage?.[0]?.url,
  result.twitterImage?.url,
  result.twitterImageSrc,
  result.schemaImage,
  result.jsonLD?.[0]?.image?.url,
  result.jsonLD?.[0]?.image,
  result.jsonLD?.[0]?.primaryImageOfPage?.url,
  result.dcImage,
  result.dcImageSrc,
  result.articleImage,
  result.alImage?.url,
  result.favicon,
];

const candidates = [...new Set(
  rawCandidates
    .filter((url) => typeof url === "string" && url.trim().length > 0)
    .map((url) => {
      try {
        return new URL(url, targetUrl).href;
      } catch (e) {
        return url;
      }
    })
)];

// 2. Simple scoring algorithm
function scoreImage(url) {
  const lower = url.toLowerCase();

  // Tier 1: Low quality / generic placeholders (Lowest priority)
  if ( lower.includes("gravatar") || lower.includes("avatar") || lower.includes("150x150") || lower.includes("logo") ) {
    return 1;
  }

  // Tier 2: Icons & SVGs
  if (lower.includes(".ico") || lower.includes(".svg") || lower.includes("favicon")) {
    return 2;
  }

  // Tier 3: Preferred image formats (JPG, PNG, WEBP)
  if (/\.(png|jpe?g|webp)(\?.*)?$/i.test(lower)) {
    return 4;
  }

  // Tier 4: Standard URLs without explicit image extensions
  return 3;
}

// 3. Sort candidates descending by score (highest score first)
candidates.sort((a, b) => scoreImage(b) - scoreImage(a));

const image = candidates[0] || "";
    const title = result.ogTitle || result.twitterTitle || result.ogSiteName || "";

    return {
      type: "link",
      src: result.ogUrl || targetUrl,
      title: cleanTitle(title),
      image,
      aspect: 1.78,
    };
  } catch (error) {
    console.error(error);
    return {
      type: "link",
      src: targetUrl,
      title: "",
      image: "",
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