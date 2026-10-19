// Self-hosting of Instagram thumbnails.
//
// Instagram/Elfsight image URLs are signed and expire, so old posts end up with
// broken thumbnails. Instead we keep a local copy of every image in
// docs/public/instagram/ (served at /instagram/<id>.<ext>) and store that local
// path in instagram.json.
//
// Nothing here is committed: like dictionary.json, the images ride along in the
// deployed site and the fetch step (fetch.js) restores them into docs/public/ on
// the next build. instagram.js then only downloads images for posts it has not
// seen before.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export const IMAGE_PREFIX = "/instagram/";
const DEFAULT_ROOT = "./docs/public";
const MAX_BYTES = 15 * 1024 * 1024;
const BATCH = 10;

const EXT = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
};

// instagram.json comes from the deployed site, so treat its paths as untrusted:
// only a flat file name inside /instagram/ with an image extension is accepted
// (no subdirectories, no traversal).
const LOCAL_IMAGE = /^\/instagram\/[A-Za-z0-9._-]+\.(?:jpg|png|webp|gif|avif)$/;

export function isLocalImage(image) {
  return typeof image === "string" && LOCAL_IMAGE.test(image);
}

export function hasLocalFile(image, root = DEFAULT_ROOT) {
  return isLocalImage(image) && fs.existsSync(path.join(root, image));
}

// File extension from the response content-type; falls back to the URL's
// extension only when the server sent no usable type. Returns null if it is not
// an image we can serve.
export function imageExt(contentType = "", url = "") {
  const type = String(contentType).split(";")[0].trim().toLowerCase();
  if (EXT[type]) return EXT[type];
  if (type && type !== "application/octet-stream" && type !== "binary/octet-stream") return null;
  try {
    const m = new URL(url).pathname.match(/\.(jpe?g|png|webp|gif|avif)$/i);
    if (m) return m[1].toLowerCase().replace("jpeg", "jpg");
  } catch {
    /* not a URL */
  }
  return null;
}

// Stable, filesystem-safe base name for a post's image.
export function imageBaseName(item) {
  const id = String(item?.videoId ?? "")
    .replace(/[^A-Za-z0-9_-]/g, "")
    .slice(0, 80);
  if (id) return id;
  return crypto
    .createHash("sha256")
    .update(String(item?.url ?? item?.image ?? ""))
    .digest("hex")
    .slice(0, 16);
}

function save(root, rel, buf) {
  const dest = path.join(root, rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, buf);
}

/**
 * Download a remote image into <root>/instagram/<base>.<ext>.
 * Returns the site-relative path (/instagram/<base>.<ext>) or null on failure
 * (never throws: a missing thumbnail must not break the build).
 *
 * `cache: "no-cache"` makes createFiles.js's patched fetch pass the request
 * straight through instead of trying to JSON-cache the binary body.
 */
export async function downloadImage(src, base, { root = DEFAULT_ROOT, fetchImpl = globalThis.fetch } = {}) {
  if (typeof src !== "string" || !/^https:\/\//i.test(src)) return null;
  try {
    const res = await fetchImpl(src, { cache: "no-cache" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const type = res.headers.get("content-type") || "";
    const ext = imageExt(type, src);
    if (!ext) throw new Error(`unsupported content-type "${type}"`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length || buf.length > MAX_BYTES) throw new Error(`unexpected size ${buf.length}`);
    const rel = `${IMAGE_PREFIX}${base}.${ext}`;
    save(root, rel, buf);
    return rel;
  } catch (e) {
    console.warn(`instagram: image download failed (${base}): ${e.message}`);
    return null;
  }
}

/**
 * Fetch step: copy every thumbnail referenced by the previous build's
 * instagram.json from the live site into <root>/instagram/, skipping files
 * already on disk. Best-effort — anything that cannot be restored is simply
 * picked up again by instagram.js. Returns the number of files restored.
 */
export async function restoreInstagramImages(origin, items, { root = DEFAULT_ROOT, fetchImpl = globalThis.fetch } = {}) {
  const wanted = [...new Set((Array.isArray(items) ? items : []).map((i) => i?.image).filter(isLocalImage))].filter(
    (img) => !fs.existsSync(path.join(root, img)),
  );
  let restored = 0;
  for (let i = 0; i < wanted.length; i += BATCH) {
    await Promise.all(
      wanted.slice(i, i + BATCH).map(async (img) => {
        try {
          const res = await fetchImpl(`${origin}${img}`, { cache: "no-cache" });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          if (!(res.headers.get("content-type") || "").toLowerCase().startsWith("image/")) {
            throw new Error("not an image");
          }
          const buf = Buffer.from(await res.arrayBuffer());
          if (!buf.length || buf.length > MAX_BYTES) throw new Error(`unexpected size ${buf.length}`);
          save(root, img, buf);
          restored++;
        } catch (e) {
          console.warn(`fetch: could not restore ${img} (${e.message})`);
        }
      }),
    );
  }
  console.log(`fetch: restored ${restored}/${wanted.length} instagram images from ${origin}`);
  return restored;
}
