import { read, write } from "./node_utils.js";

const EMBED_ID = "01a0444ac55070008a78874abb06cce6e56e";
const URL = `https://www.jotform.com/website-widgets/embed/${EMBED_ID}`;

export async function fetchInstagram() {
  const local = "./docs/public/instagram.json";
  let existing = [];
  try {
    existing = (() => { try { return read(local, []); } catch { return []; } })();
    const config = read("./docs/public/config.json");
    const socialArr = config.social || config.info?.social || [];
    const instagramStr = (socialArr || []).find((s) =>
      typeof s === "string" && s.toLowerCase().includes("instagram")
    );
    if (!instagramStr) {
      console.log("No Instagram account configured in social; skipping instagram fetch.");
      return existing;
    }
    console.log("Fetching instagram...");
    const res = await fetch(URL, { cache: "no-cache" });
    if (!res.ok) throw new Error("instagram fetch status " + res.status);
    const html = await res.text();
    // Extract const widgetData = '{...}';
    const match = html.match(/const widgetData = '(.+?)';\s*<\/script>/s) || html.match(/const widgetData = '(.+?)';/s);
    if (!match) throw new Error("instagram widgetData not found in HTML");
    const widget = JSON.parse(JSON.parse('"' + match[1] + '"'));
    // Navigate to posts inside the embedded social feed data
    // widget.schema[].fields[] contains social_feed_data with nested JSON
    let feedDataStr = null;
    for (const s of (widget.schema || [])) {
      for (const f of (s.fields || [])) {
        if (f.name === "social_feed_data" && f.value) feedDataStr = f.value;
      }
    }
    if (!feedDataStr) throw new Error("social_feed_data field missing");
    // Sanitize common bad escaped characters in embedded JSON before parsing
    feedDataStr = feedDataStr.replace(/\\([^"\\/bfnrtu])/g, "$1");
    let feed;
    try { feed = JSON.parse(feedDataStr); } catch (e) {
      console.error("instagram feedData parse error (non-fatal, bad escapes):", e.message);
      feed = { sources: [] };
    }
    const posts = (feed.sources || []).flatMap((src) => src.posts || []);
    // Normalize to video-like objects for Video.vue / video-instagram block
    const normalized = posts.map((p) => {
      const firstMedia = (p.mediaItems || [])[0] || {};
      return {
        videoId: firstMedia.id || null,
        title: p.text || "Instagram",
        image: p.thumbnailUrl || p.imageUrl || firstMedia.thumbnailUrl || firstMedia.imageUrl || "",
        url: p.linkUrl || p.source || "",
        publishedAt: p.date || null,
        author: p.author || p.username || null,
        mediaType: p.mediaType || firstMedia.type || "IMAGE",
      };
    });
    // Merge: prepend new, preserve cached order for duplicates (simple dedup by url)
    const seen = new Set(existing.map((e) => e.url || e.videoId));
    const merged = [...normalized.filter((n) => !(seen.has(n.url || n.videoId))), ...existing];
    write(local, merged);
    return merged;
  } catch (e) {
    console.error("fetchInstagram error:", e.message || e);
    return existing;
  }
}
