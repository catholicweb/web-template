/**
 * media-naming.js — single source of truth for the flattened media object keys
 * used by the vocaciones migration. Both the generator (migrate-vocaciones.js)
 * and the upload CLI (import-media-upload.js) import these so the URL stored in
 * config.json always matches the object key uploaded to the bucket.
 *
 * The convention is the "flattened source name": take the original image
 * filename, drop its extension, and replace every character outside the safe
 * set `[A-Za-z0-9_-]` (slashes included) with `-`. WebP is forced on output.
 *
 * This mirrors (a) createFiles.resolveMedia, which flattens a `/media/...`
 * reference by replacing `/` with `-` before prefixing the data host, and
 * (b) the editor's import-media charset sanitization, so a ref stored as
 * `/media/<flat>.webp` resolves to `https://data.parroquia.app/<slug>/<flat>.webp`
 * — exactly the `<slug>/<flat>.webp` object the uploader writes.
 */

// Flatten any image filename or /media/ reference to its safe base name (no
// extension, no leading /media/, no chars outside [A-Za-z0-9_-]).
export function flattenMediaName(name) {
  let s = String(name || "");
  // Drop a leading /media/ prefix and any leading slash/query.
  s = s.replace(/^\/media\//, "").replace(/^\//, "");
  s = s.split(/[?#]/)[0];
  // Decode percent-encoding (%20 -> space) so keys stay readable, then sanitize.
  try {
    s = decodeURIComponent(s);
  } catch {
    /* keep raw on malformed input */
  }
  // Field is the text before the last dot (the extension), if any.
  const ext = s.lastIndexOf(".");
  if (ext > 0) s = s.slice(0, ext);
  // Collapse any non-safe run (spaces, parens, dots, slashes...) to a single dash.
  return s.replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
}

// Relative config reference for a media name: the normalized form the migration
// stores (createFiles.resolveMedia rewrites it to the data host at build time).
export function mediaRelRef(name) {
  return "/media/" + flattenMediaName(name) + ".webp";
}

// Object-key leaf (the <flat>.webp token) — identical to what resolveMedia
// derives from mediaRelRef, minus the /media/ prefix.
export function mediaKey(name) {
  return flattenMediaName(name) + ".webp";
}
