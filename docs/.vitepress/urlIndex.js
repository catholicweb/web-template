// URL history index: keeps old page URLs alive after a title (and therefore slug) change.
//
// Page URLs are derived from titles, so renaming a page moves it. To avoid breaking
// inbound links we persist, across builds, a small index of  page id -> URL history.
// It rides along in the deployed site (docs/public/url-index.json, re-downloaded by
// fetch.js on the next build), exactly like dictionary.json / buildtimecache.json.
// From that history the build emits a Cloudflare Pages `_redirects` file (real 301s).
//
// Pure and side-effect free (no fs / network): createFiles.js does the I/O.
//
// Index shape:
//   {
//     "version": 1,
//     "entries": {
//       "page:abc": {
//         "urls": { "es": { "current": "/new-title", "previous": ["/old-title"] } },
//         "goneSince": "2026-11-03"        // only while the id has no live page
//       }
//     }
//   }
// Ids are namespaced by source ("page:", "place:", "event:", "type:") because each
// source numbers its ids independently. URLs are keyed per language code, since each
// language has its own translated slug.

export const INDEX_FILE = "url-index.json";
export const REDIRECTS_FILE = "_redirects";
export const INDEX_VERSION = 1;

// Cloudflare Pages limits: 2000 static rules, 1000 characters per line.
export const MAX_REDIRECT_RULES = 2000;
// Old URLs remembered per page and language (newest first; the oldest are dropped).
export const MAX_PREVIOUS_PER_PAGE = 20;
// Entries whose page no longer exists are kept this long (so a page that comes back
// keeps its history) and then pruned, so deleted/expired events don't grow the index forever.
export const GONE_RETENTION_DAYS = 365;

// Only plain slug-like paths are ever written to _redirects. The index is downloaded
// content: this keeps whitespace, newlines, `:`/`*` (placeholders/splats), `#` and
// absolute URLs (open redirects) out of the generated rules.
const SAFE_PATH = /^\/[A-Za-z0-9\-._~/]*$/;

export const emptyIndex = () => ({ version: INDEX_VERSION, entries: {} });

// "/a/b/" -> "/a/b", "a" -> "/a", "/" stays "/". Query/hash are dropped.
export function normalizeUrl(url) {
  let u = String(url ?? "").split(/[?#]/)[0].trim();
  if (!u) return "";
  if (!u.startsWith("/")) u = "/" + u;
  u = u.replace(/\/{2,}/g, "/");
  if (u.length > 1) u = u.replace(/\/+$/, "");
  return u;
}

// "//host/x" matches SAFE_PATH but is a protocol-relative URL (open redirect): reject it.
export const isSafePath = (u) => typeof u === "string" && u.length <= 500 && SAFE_PATH.test(u) && !u.startsWith("//");

// Validates a previously published index. Returns it, or throws if it is not one
// (callers must NOT silently start fresh on a malformed index: that would drop history).
export function parseIndex(value) {
  const idx = typeof value === "string" ? JSON.parse(value) : value;
  if (!idx || typeof idx !== "object" || Array.isArray(idx) || typeof idx.entries !== "object" || idx.entries === null || Array.isArray(idx.entries)) {
    throw new Error("url index: unexpected shape (expected { version, entries })");
  }
  return { version: idx.version ?? INDEX_VERSION, entries: idx.entries };
}

const isoDay = (d) => d.toISOString().slice(0, 10);
const arr = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === "string") : []);

/**
 * Merge the URLs produced by this build into the previous index.
 *
 *   previous  the index published by the last build (or emptyIndex() on the very first one)
 *   current   [{ id, lang, url }] — every page of this build
 *   now       injectable clock (tests)
 *
 * Returns { index, redirects } where `redirects` is [{ from, to }] (deduplicated,
 * chain-free: every old URL points straight at the page's current URL).
 */
export function updateIndex(previous, current, { now = new Date() } = {}) {
  const entries = {};
  // Deep copy + sanitize what we read, so a corrupt index can't throw later.
  for (const [id, entry] of Object.entries(previous?.entries ?? {})) {
    const urls = {};
    for (const [lang, slot] of Object.entries(entry?.urls ?? {})) {
      const cur = normalizeUrl(slot?.current);
      if (!cur) continue;
      urls[lang] = { current: cur, previous: arr(slot?.previous).map(normalizeUrl).filter(Boolean) };
    }
    entries[id] = { urls, ...(entry?.goneSince ? { goneSince: String(entry.goneSince) } : {}) };
  }

  // 1. Record this build's URLs; a changed URL pushes the old one into `previous`.
  const seen = new Set(); // `${id}\0${lang}` pairs that exist in this build
  const live = new Set(); // every URL served by this build
  for (const { id, lang, url } of current) {
    const u = normalizeUrl(url);
    if (!id || !u) continue;
    const key = `${id}\0${lang}`;
    if (seen.has(key)) {
      console.warn(`url index: "${id}" (${lang}) produced more than one page; keeping the first`);
      continue;
    }
    seen.add(key);
    live.add(u);
    const entry = (entries[id] ??= { urls: {} });
    const slot = entry.urls[lang];
    if (!slot) entry.urls[lang] = { current: u, previous: [] };
    else if (slot.current !== u) {
      slot.previous = [slot.current, ...slot.previous.filter((p) => p !== slot.current)];
      slot.current = u;
    }
  }

  // 2. Housekeeping: live pages win over history, bound the history, track/prune gone pages.
  const today = isoDay(now);
  for (const [id, entry] of Object.entries(entries)) {
    for (const slot of Object.values(entry.urls)) {
      slot.previous = [...new Set(slot.previous)].filter((p) => p !== slot.current && !live.has(p)).slice(0, MAX_PREVIOUS_PER_PAGE);
    }
    const alive = Object.keys(entry.urls).some((lang) => seen.has(`${id}\0${lang}`));
    if (alive) delete entry.goneSince;
    else {
      entry.goneSince ??= today;
      const days = (now - new Date(entry.goneSince)) / 86_400_000;
      if (days > GONE_RETENTION_DAYS) delete entries[id];
    }
  }

  // 3. Redirects: only for pages that exist now, never from a live URL, one target per source.
  const redirects = [];
  const claimed = new Map(); // from -> id
  for (const [id, entry] of Object.entries(entries)) {
    for (const [lang, slot] of Object.entries(entry.urls)) {
      if (!seen.has(`${id}\0${lang}`)) continue;
      for (const from of slot.previous) {
        if (live.has(from) || from === slot.current) continue;
        if (claimed.has(from)) {
          console.warn(`url index: ${from} was used by both "${claimed.get(from)}" and "${id}"; redirecting to the first`);
          continue;
        }
        claimed.set(from, id);
        redirects.push({ from, to: slot.current });
      }
    }
  }

  return { index: { version: INDEX_VERSION, entries }, redirects };
}

/**
 * Cloudflare Pages `_redirects` content. Each old URL is emitted with and without a
 * trailing slash (the old page no longer exists, so Pages can't normalize it for us).
 * Unsafe paths are skipped and the 2000-rule limit is respected (newest history first,
 * which is the order `updateIndex` returns).
 */
export function buildRedirectsFile(redirects, { max = MAX_REDIRECT_RULES } = {}) {
  const lines = [];
  let skipped = 0;
  const add = (from, to) => {
    if (lines.length >= max) return void skipped++;
    lines.push(`${from} ${to} 301`);
  };
  for (const { from, to } of redirects) {
    if (!isSafePath(from) || !isSafePath(to) || from === "/") {
      skipped++;
      continue;
    }
    add(from, to);
    add(from + "/", to);
  }
  if (skipped) console.warn(`url index: ${skipped} redirect rule(s) skipped (unsafe path or over the ${max}-rule Cloudflare limit)`);
  return ["# Generated by urlIndex.js from url-index.json — do not edit.", ...lines, ""].join("\n");
}
