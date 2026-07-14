#!/usr/bin/env node
/**
 * migrate.js — sync local ./docs/public/  <-->  remote /sites/:slug/
 *
 * The remote API stores files under OPAQUE base64url tokens, not paths. This
 * script is the only thing that knows the mapping:
 *
 * local  ./docs/public/<relpath>     --base64url-->   remote /sites/:slug/<token>
 * remote /sites/:slug/<token>        --base64url-->   local  ./docs/public/<relpath>
 *
 * upload(slug, token)   walk ./docs/public, encode each relpath to a token,
 * PUT /sites/:slug/<token> (editor bearer token)
 * download(slug, token) GET /sites/:slug/list (tokens), then for each token
 * GET /sites/:slug/<token> (editor bearer token) and
 * decode it back to a local path
 *
 * The server is path-blind (it never decodes tokens), so traversal safety on
 * the server rests on the token charset. On DOWNLOAD this script decodes, so
 * it must contain the decoded path to LOCAL_ROOT (see safeLocalPath) — a token
 * that decodes to ../etc would otherwise escape on the client side.
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
const LOCAL_ROOT = process.env.PARROQUIA_LOCAL_ROOT
  ? path.resolve(process.env.PARROQUIA_LOCAL_ROOT)
  : path.join(process.cwd(), 'docs', 'public');

// The server's token charset. Used here to recognize real tokens (and skip
// anything else, e.g. legacy human-readable keys or internal markers).
export const TOKEN_RE = /^[A-Za-z0-9_-]+$/;

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

// --- token <-> path -------------------------------------------------------

// base64url (unpadded, URL-safe) of a path's UTF-8 bytes. Charset matches the
// server's TOKEN_RE exactly: [A-Za-z0-9_-], no '/', '.', '=', or control.
export function encodePath(relPath) {
  return Buffer.from(relPath, 'utf8').toString('base64url');
}

export function decodeToken(token) {
  return Buffer.from(token, 'base64url').toString('utf8');
}

// Convert an absolute local path to the remote (posix) relative path.
function toRemotePath(absPath) {
  return path.relative(LOCAL_ROOT, absPath).split(path.sep).join('/');
}

// Contain a decoded remote path to LOCAL_ROOT. Returns an absolute local
// destination, or null if the path would escape LOCAL_ROOT (e.g. contains
// '..', is absolute, or has a backslash). This is the client-side counterpart
// to the server's charset defense: a malicious token can't make download
// write outside the sync root.
export function safeLocalPath(relPath) {
  if (!relPath || relPath.includes('\\')) return null;
  const parts = relPath.split('/');
  for (const p of parts) {
    if (p === '' || p === '.' || p === '..') return null;
  }
  const rootResolved = path.resolve(LOCAL_ROOT);
  const destResolved = path.resolve(rootResolved, ...parts);
  const prefix = rootResolved + path.sep;
  if (destResolved !== rootResolved && !destResolved.startsWith(prefix)) {
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
 * Walk ./docs/public, encode each relpath to a base64url token, and PUT it to
 * /sites/:slug/<token> with the editor bearer token. Returns the list of
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
 * path under ./docs/public. Tokens that aren't valid base64url or that decode
 * to a path escaping LOCAL_ROOT are skipped with a warning. Returns the list
 * of local paths written. Throws on list/read failure.
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
    const res = await fetch(`https://data.parroquia.app/${slug}/${tok}`, {
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