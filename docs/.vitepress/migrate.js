#!/usr/bin/env node
/**
 * ⚠️⚠️⚠️ CRITICAL INTER-DEPENDENCY WARNING ⚠️⚠️⚠️
 *
 * This file's filename encoding MUST match:
 *   - config-api/src/index.js (FILENAME_RE validation)
 *   - editor/docs/.vitepress/theme/lib/codec.js (browser-side encode/decode)
 *
 * This file's API calls MUST match the endpoints defined in:
 *   - config-api/src/index.js (endpoint definitions)
 *   - editor/docs/.vitepress/theme/lib/api.js (also uses these endpoints)
 *
 * BEFORE making changes, ensure ALL files produce identical results!
 * See ../../../CLAUDE.md for full dependency documentation.
 */

/**
 * migrate.js — sync local ./docs/public/  <-->  remote /sites/:slug/
 *
 * The remote API stores files under validated human-readable filenames. This
 * script handles the mapping:
 *
 * local  ./docs/public/<relpath>     --flatten-->   remote /sites/:slug/<filename>
 * remote /sites/:slug/<filename>     --no decode-->  local  ./docs/public/<relpath>
 *
 * upload(slug, token)   walk ./docs/public, flatten each relpath to a filename,
 * PUT /sites/:slug/<filename> (editor bearer token)
 * download(slug, token) GET /sites/:slug/list (filenames), then for each filename
 * reconstruct local path by replacing - with / (best effort)
 *
 * The server validates filenames but never interprets them as paths. On DOWNLOAD
 * this script must validate filenames before writing to local filesystem (see
 * safeLocalPath) — a malicious filename could otherwise escape LOCAL_ROOT.
 *
 * Env overrides:
 * PARROQUIA_API          Worker base URL (default https://api.parroquia.app)
 * PARROQUIA_LOCAL_ROOT   local sync root (default ./docs/public)
 *
 * CLI:
 * node migrate.js upload    <slug> <editor-token>
 * node migrate.js download <slug> <editor-token>
 */

'use strict';

import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// 1. Updated default API URL
const API = (process.env.PARROQUIA_API || 'https://api.parroquia.app').replace(/\/$/, '');

// Public data host that serves raw file bytes (no auth). This is independent
// of PARROQUIA_API above: overriding PARROQUIA_API does NOT redirect here, so a
// dev override would otherwise keep reading from production data.parroquia.app.
const DATA = (process.env.PARROQUIA_DATA || 'https://data.parroquia.app').replace(/\/$/, '');
const LOCAL_ROOT = process.env.PARROQUIA_LOCAL_ROOT
  ? path.resolve(process.env.PARROQUIA_LOCAL_ROOT)
  : path.join(process.cwd(), 'docs', 'public');

// Allowed file extensions (must match config-api ALLOWED_EXT exactly).
const ALLOWED_EXT = ['md', 'jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf', 'json'];

// Filename validation regex (must match config-api FILENAME_RE exactly).
const FILENAME_RE = /^[A-Za-z0-9_-]+(\.[a-z0-9]{1,5})?$/;

function validateFilename(filename) {
  if (!filename || typeof filename !== 'string') return false;
  if (filename.length > 255) return false;          // filesystem limit
  if (filename.startsWith('-')) return false;        // CLI arg injection guard
  if (!FILENAME_RE.test(filename)) return false;

  // Extension check (if present)
  const dotIndex = filename.lastIndexOf('.');
  if (dotIndex !== -1) {
    const ext = filename.slice(dotIndex + 1).toLowerCase();
    if (!ALLOWED_EXT.includes(ext)) return false;
  }
  return true;
}

const MIME = {
  '.json': 'application/json; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.pdf': 'application/pdf',
};

function contentTypeFor(file) {
  return MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
}

// --- filename <-> path -------------------------------------------------------

// Encode a relative path to a flat filename:
// 1. Normalize path (remove leading/trailing slashes, collapse multiple slashes)
// 2. Replace / with - to flatten
// 3. Extract and validate extension
// 4. Sanitize base name to allowed charset
// 5. Validate final filename
export function encodePath(relPath) {
  // Normalize: remove leading/trailing slashes, collapse multiple slashes
  const normalized = relPath.replace(/^\/+|\/+$/g, '').replace(/\/+/g, '/');
  const flattened = normalized.replace(/\//g, '-');

  // Split extension
  const lastDot = flattened.lastIndexOf('.');
  let base = lastDot === -1 ? flattened : flattened.slice(0, lastDot);
  let ext = lastDot === -1 ? '' : flattened.slice(lastDot + 1).toLowerCase();

  // Sanitize base name: replace any char outside [A-Za-z0-9_-] with -
  base = base.replace(/[^A-Za-z0-9_-]/g, '-');

  // Validate/normalize extension
  if (ext && !ALLOWED_EXT.includes(ext)) {
    // Unknown extension: fold into base name
    base = `${base}-${ext}`.replace(/[^A-Za-z0-9_-]/g, '-');
    ext = '';
  }

  const result = ext ? `${base}.${ext}` : base;
  if (!validateFilename(result)) {
    throw new Error(`encodePath produced invalid filename: ${result}`);
  }
  return result;
}

// Decode is a no-op: filenames are human-readable and not decoded back to paths.
// The local path structure is known from the schema, not from the filename.
export function decodeToken(token) {
  return token;
}

// Export for use by other modules that need to validate filenames.
export const TOKEN_RE = FILENAME_RE;

// Convert an absolute local path to the remote (posix) relative path.
function toRemotePath(absPath) {
  return path.relative(LOCAL_ROOT, absPath).split(path.sep).join('/');
}

// Validate a filename and return the local path if valid, null otherwise.
// This is the client-side defense: a malicious filename can't make download
// write outside the sync root.
// Files are stored flat (no directory structure) in LOCAL_ROOT.
export function safeLocalPath(filename) {
  if (!validateFilename(filename)) return null;
  // Store files flat in LOCAL_ROOT (no subdirectory structure)
  const rootResolved = path.resolve(LOCAL_ROOT);
  const dest = path.join(rootResolved, filename);
  // Ensure the destination is under LOCAL_ROOT
  const destResolved = path.resolve(dest);
  if (destResolved !== rootResolved && !destResolved.startsWith(rootResolved + path.sep)) {
    return null;
  }
  return destResolved;
}

// --- file walking ---------------------------------------------------------

async function walk(dir, out = []) {
  let entries;
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true });
  } catch (err) {
    if (err.code === 'ENOENT') return out; // missing dir = nothing to upload
    throw err;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(full, out);
    } else if (entry.isFile()) {
      out.push(full);
    }
  }
  return out;
}

async function errBody(res) {
  try {
    return await res.text();
  } catch {
    return '';
  }
}

// --- public API -----------------------------------------------------------

/**
 * upload(slug, token)
 * Walk ./docs/public, encode each relpath to a flat filename token, and PUT it
 * to /sites/:slug/<token> with the editor bearer token. Returns the list of
 * remote tokens written. Throws on any failure.
 */
export async function upload(slug, token) {
  const files = await walk(LOCAL_ROOT);
  if (files.length === 0) {
    throw new Error(`No files found under ${LOCAL_ROOT}`);
  }
  const written = [];
  for (const abs of files) {
    const rel = toRemotePath(abs);
    const tok = encodePath(rel);
    const body = await fsp.readFile(abs);
    const res = await fetch(`${API}/sites/${slug}/${tok}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': contentTypeFor(abs),
      },
      body,
    });
    if (!res.ok) {
      throw new Error(`upload failed: ${rel} -> ${res.status} ${await errBody(res)}`);
    }
    written.push(tok);
  }
  return written;
}

/**
 * download(slug, token)
 * GET /sites/:slug/list, then GET each token and write it to its decoded local
 * path under ./docs/public. Tokens that aren't valid filenames or that would
 * escape LOCAL_ROOT are skipped with a warning. Returns the list of local
 * paths written. Throws on list/read failure.
 */
export async function download(slug, token) {
  console.log('Trying to download... ', slug)
  const listRes = await fetch(`${API}/sites/${slug}/list`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!listRes.ok) {
    throw new Error(`list failed: -> ${listRes.status} ${await errBody(listRes)}`);
  }
  const { files } = await listRes.json();

  console.log(files)
  const written = [];
  for (const tok of files) {
    if (!TOKEN_RE.test(tok)) {
      console.warn(`  ! skipping non-token key: ${tok}`);
      continue;
    }
    const rel = decodeToken(tok);
    const dest = safeLocalPath(rel);
    if (!dest) {
      console.warn(`  ! skipping unsafe decoded path: ${rel}`);
      continue;
    }
    const res = await fetch(`${DATA}/${slug}/${tok}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      throw new Error(`download failed: ${tok} -> ${res.status} ${await errBody(res)}`);
    }
    const buf = Buffer.from(await res.arrayBuffer());
    await fsp.mkdir(path.dirname(dest), { recursive: true });
    await fsp.writeFile(dest, buf);
    written.push(rel);
  }
  return written;
}

// --- CLI ------------------------------------------------------------------

async function main() {
  const [cmd, slug, token] = process.argv.slice(2);
  if (!cmd || !slug || cmd == 'upload' && !token) {
    console.error('usage: node migrate.js <upload|download> <slug> <token>');
    console.error(`       API=${API}  LOCAL_ROOT=${LOCAL_ROOT}`);
    process.exit(1);
  }
  try {
    if (cmd === 'upload') {
      const r = await upload(slug, token);
      console.log(`uploaded ${r.length} file(s) to /sites/${slug}/`);
      for (const t of r) console.log(`  + ${t}`);
    } else if (cmd === 'download') {
      const r = await download(slug, token);
      console.log(`downloaded ${r.length} file(s) to ${LOCAL_ROOT}`);
      for (const f of r) console.log(`  - ${f}`);
    } else {
      console.error(`unknown command: ${cmd} (expected upload|download)`);
      process.exit(1);
    }
  } catch (err) {
    console.error(`migrate ${cmd} failed:`, err.message);
    if (err.cause) {
      console.error("  Reason:", err.cause);
    }
    process.exit(1);
  }
}

// ES Modules equivalent to `require.main === module`
// It checks if this file was run directly from the command line, and only runs main() if so.
const nodePath = path.resolve(process.argv[1]);
const modulePath = fileURLToPath(import.meta.url);

if (nodePath === modulePath) {
  main();
}