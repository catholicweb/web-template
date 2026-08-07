// oembed-ultra.js
import { Parser } from "htmlparser2";
import { read } from "./node_utils.js";

function extractIframeSrc(html) {
  // Busca el atributo src dentro del iframe de Spotify
  const match = html.match(/<iframe[^>]+src=["']([^"']+)["']/i);
  return match ? match[1] : null;
}

function round(num) {
  return Math.round(num * 100) / 100;
}

async function fetchOembed(url) {
  const res = await fetch(url);
  const data = await res.json();

  return {
    title: data.title || "",
    author: data.author_name || "",
    src: extractIframeSrc(data.html) || "",
    image: data.thumbnail_url || "",
    aspect: round(data.width / data.height),
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
  { re: /spotify\.com$/, api: "https://open.spotify.com/oembed" }, // Added Spotify
];

export async function getPreview(url) {
  try {
    if (url.endsWith(".md")) {
      return await localLinks(url);
    } else if (url.includes("sallebarne.eus")) {

      const html = await (await fetch('https://sallebarne.eus', { cache: 'no-cache' })).text();
      const match = html.match(/sallebarne\.eus\/wp-content\/uploads\/([^-]+?)-([^\.]+?)\.jpg/);

      if (!match) throw new Error("sallebarne.eus: no image match found");
      console.log(url, match[1])
      return {
        type: "link",
        src: `https://sallebarne.eus/wp-content/uploads/${match[1]}.mp3`,
        title: `Egunez egun ${match[1]?.split('/')[2]?.split('.').toReversed().join('-') || ''}`,
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

  // --- 1) Provider conocido
  const known = KNOWN_PROVIDERS.find((p) => p.re.test(host));
  if (known) {
    const params = new URLSearchParams({ url, format: "json" });
    const oembedUrl = `${known.api}?${params.toString()}`;
    return fetchOembed(oembedUrl);
  }

  console.log("ouch! need to try harder", url);

  // --- 2) Ultra-fast autodiscovery + OG reading
  let oembedUrl = null;
  const og = {};
  let done = false;

  const parser = new Parser(
    {
      onopentag(name, attribs) {
        if (done) return;

        if (name === "link" && attribs.rel === "alternate") {
          if (attribs.type === "application/json+oembed" || attribs.type === "text/xml+oembed") {
            oembedUrl = attribs.href;
            done = true;
          }
        }

        if (name === "meta" && attribs.property?.startsWith("og:") && attribs.content) {
          og[attribs.property.slice(3)] = attribs.content;
        }
      },
      onclosetag(name) {
        if (name === "head") done = true;
      },
    },
    { decodeEntities: true },
  );

  // Stream hasta </head>
  const res = await fetch(url);
  const reader = res.body.getReader();

  while (!done) {
    const { value, done: end } = await reader.read();
    if (end) break;
    parser.write(new TextDecoder().decode(value));
  }
  parser.end();

  if (oembedUrl) return fetchOembed(oembedUrl);

  // --- 3) Fallback OG ultra-minimal
  return {
    type: "link",
    src: og.url || url || "",
    title: og.title || "",
    image: og.image || "",
    aspect: round(16 / 9),
  };
}

function localLinks(linkPath) {
  const { data } = read(linkPath);
  return {
    title: data.title || "",
    description: data.description || "",
    image: data.image || "",
    aspect: round(16 / 9),
    file: linkPath,
  };
}
