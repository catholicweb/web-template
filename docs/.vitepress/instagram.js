import { read, write } from "./node_utils.js";

const EMBED_MAP = {
  //delejunavarra: "ffbdd8fa-1773-40d2-a55f-509b0c4ded9b",
  corazondejesuspamplona: "ffbdd8fa-1773-40d2-a55f-509b0c4ded9b",
};

function parseInstagramHandle(urlStr) {
  if (!urlStr) return null;
  try {
    const url = new URL(urlStr);
    const host = url.hostname.toLowerCase();
    if (!host.includes("instagram")) return null;
    const path = url.pathname || "";
    const segments = path.split("/").filter((s) => s.length > 0);
    return segments[0] || null;
  } catch {
    // fallback for non-absolute URLs: split on '/' and find segment after instagram.com
    const match = urlStr.match(/instagram\.com\/([^/?#]+)/i);
    return match ? match[1] : null;
  }
}

function getEmbedId(socialUrl) {
  const handle = parseInstagramHandle(socialUrl);
  if (handle && EMBED_MAP[handle]) return EMBED_MAP[handle];
  // Silent fallback to default Elfsight widget id for unmapped accounts
  return "ffbdd8fa-1773-40d2-a55f-509b0c4ded9b";
}

export async function fetchInstagram() {
  const local = "./docs/public/instagram.json";
  let existing = [];
  try {
    existing = (() => { try { return read(local, []); } catch { return []; } })();
    const config = read("./docs/public/config.json");
    const socialArr = config.info?.social || [];
    const instagramStr = (socialArr || []).find((s) =>
      typeof s === "string" && s.toLowerCase().includes("instagram")
    );
    if (!instagramStr) {
      console.log("No Instagram account configured in social; skipping instagram fetch.", socialArr);
      return existing;
    }

    const widgetId = getEmbedId(instagramStr);
    console.log("Fetching instagram via Elfsight (handle=" + (parseInstagramHandle(instagramStr) || "?") + ", widget=" + widgetId + ")...");

    // 1. Fetch boot configuration to obtain tokens and source PIDs
    const bootUrl = `https://core.service.elfsight.com/p/boot/?w=${widgetId}`;
    const bootRes = await fetch(bootUrl, { cache: "no-cache" });
    if (!bootRes.ok) throw new Error("Elfsight boot fetch status " + bootRes.status);
    const bootData = await bootRes.json();

    const widgetData = bootData.data?.widgets?.[widgetId] || Object.values(bootData.data?.widgets || {})[0];
    if (!widgetData) throw new Error("Elfsight widget configuration not found in boot payload");

    const publicWidgetToken = widgetData.public_widget_token || widgetData.data?.public_widget_token;
    const sources = widgetData.data?.settings?.sources || widgetData.sources || [];
    const sourcePID = sources[0]?.sourcePID;

    if (!publicWidgetToken || !sourcePID) {
      throw new Error("Failed to extract public_widget_token or sourcePID from Elfsight boot", bootData);
    }

    // 2. Fetch post data using the extracted token and source PID
    const sourcesParam = encodeURIComponent(JSON.stringify({ pid: sourcePID, filters: [] }));
    const postsUrl = `https://widget-data.service.elfsight.com/api/posts?sources%5B%5D=${sourcesParam}&limit=100`;

    console.log('fetching ', postsUrl, publicWidgetToken)

    const postsRes = await fetch(postsUrl, {
      headers: {
        "x-widget-token": publicWidgetToken,
      },
      cache: "no-cache",
    });

    if (!postsRes.ok) throw new Error("Elfsight posts fetch status " + postsRes.status);
    const postsPayload = await postsRes.json();
    const rawPosts = postsPayload.payload || [];

    console.log('fetching instagram, got: ', postsPayload)

    // 3. Normalize posts to align with application schema
    const normalized = rawPosts.map((p) => {
      const firstMedia = p.media?.[0] || {};
      
      // Extract media thumbnail/cover image from Elfsight payload structure
      const img =
        firstMedia.cover?.thumbnail?.url ||
        firstMedia.cover?.standard?.url ||
        firstMedia.cover?.original?.url ||
        firstMedia.thumbnail?.url ||
        p.images?.native?.url ||
        p.images?.large?.url ||
        p.imageUrl ||
        p.thumbnailUrl ||
        "";

      console.log(JSON.stringify(firstMedia), img)

      // Formulate embed URL
      let postUrl = p.link || p.url || "";
      if (postUrl) {
        if (!postUrl.endsWith("/")) postUrl += "/";
        if (!postUrl.endsWith("embed/")) postUrl += "embed/";
      }

      const authorName = typeof p.author === "object" ? p.author?.username : p.author;

      return {
        videoId: p.vendorId || p.id || null,
        title: p.caption || p.text || "Instagram",
        image: img,
        url: postUrl,
        publishedAt: p.publishedAt || p.created_at || p.timestamp || p.date || null,
        author: authorName || p.user?.username || null,
        mediaType: (p.type || firstMedia.type || p.mediaType || "IMAGE").toUpperCase(),
      };
    });

    // 4. Merge: prepend new entries, preserving existing items by unique identifier
    const seen = new Set(existing.map((e) => e.url || e.videoId));
    const merged = [...normalized.filter((n) => !(seen.has(n.url || n.videoId))), ...existing];
    write(local, merged);
    return merged;

  } catch (e) {
    console.log("instagram fetch skipped/failed (non-fatal):", e.message || e);
    return existing;
  }
}

/* ==========================================================================
   DEAD CODE / LEGACY FALLBACK: Jotform Fetch Strategy
   ========================================================================== */
async function _legacyFetchInstagramJotform(instagramStr, embedId, existing, local) {
  const URL = `https://www.jotform.com/website-widgets/embed/${embedId}`;
  console.log("Fetching instagram via Jotform (handle=" + (parseInstagramHandle(instagramStr) || "?") + ", embed=" + embedId + ")...");
  const res = await fetch(URL, { cache: "no-cache" });
  if (!res.ok) throw new Error("instagram fetch status " + res.status);
  const html = await res.text();
  const match = html.match(/const widgetData = '(.+?)';\s*<\/script>/s) || html.match(/const widgetData = '(.+?)';/s);
  if (!match) throw new Error("instagram widgetData not found in HTML");
  const widget = JSON.parse(JSON.parse('"' + match[1].replace(/\\'/g, "'") + '"'));
  
  let feedDataStr = null;
  for (const s of (widget.schema || [])) {
    for (const f of (s.fields || [])) {
      if (f.name === "social_feed_data" && f.value) feedDataStr = f.value;
    }
  }
  if (!feedDataStr) throw new Error("social_feed_data field missing");
  feedDataStr = feedDataStr.replace(/\\'/g, "'").replace(/\\([^"\\/bfnrtu])/g, "$1");
  let feed;
  try { feed = JSON.parse(feedDataStr); } catch (e) {
    console.log("instagram feedData parse (non-fatal, bad escapes):", e.message);
    feed = { sources: [] };
  }
  const posts = (feed.sources || []).flatMap((src) => src.posts || []);
  const normalized = posts.map((p) => {
    const firstMedia = (p.mediaItems || [])[0] || {};
    return {
      videoId: firstMedia.id || null,
      title: p.text || "Instagram",
      image: p.thumbnailUrl || p.imageUrl || firstMedia.thumbnailUrl || firstMedia.imageUrl || "",
      url: p.linkUrl + 'embed/' || p.source + 'embed/' || "",
      publishedAt: p.date || null,
      author: p.author || p.username || null,
      mediaType: p.mediaType || firstMedia.type || "IMAGE",
    };
  });
  const seen = new Set(existing.map((e) => e.url || e.videoId));
  const merged = [...normalized.filter((n) => !(seen.has(n.url || n.videoId))), ...existing];
  write(local, merged);
  return merged;
}