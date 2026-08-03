# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> This repo is one of three in the `parroquia` monorepo (web-template, config-api, editor). Read the **parent** `parroquia/CLAUDE.md` for inter-repo contract rules; this file covers web-template only.

## What this repo is

Web-template is a **site factory**, not a single website. It ships the machinery for generating modern parish websites and deploys *one built site per slug* to Cloudflare Pages. Individual sites share this one template; their content is fetched at build time, not committed here.

Files are produced in a 3-stage pipeline:

1. **User input** — site content (site configuration, pages, events, media) lives in a remote R2 bucket behind config-api and is edited with the online editor (`editor.parroquia.app`), not on git. It is fetched at build time via `migrate.js download`, not committed here.
2. **Adapter** — `npm run docs:before-build` runs `createFiles.js`, which reads `docs/public/pages/**`, enriches and translates each page per language, and writes the renderable output to `docs/*.md`.
3. **Render** — VitePress + Tailwind v4 + a custom theme turn `docs/*.md` into the static site.

## Commands

```bash
npm install                       # install deps
npm run docs:dev                  # VitePress dev server (http://localhost:5173)
npm run docs:before-build         # REQUIRED before build — runs createFiles.js adapter
npm run docs:build                # build static site → docs/.vitepress/dist
npm run docs:preview              # preview the built site
node docs/.vitepress/test.js      # manual scratch script (not a test suite — no test runner exists)
```

Content sync with the remote API (see config-api):

```bash
node docs/.vitepress/migrate.js download <slug> [<editor-token>]
node docs/.vitepress/migrate.js upload   <slug> <editor-token>
```

`migrate.js` env overrides: `PARROQUIA_API` (Worker URL, default `https://api.parroquia.app`), `PARROQUIA_DATA` (public read host, default `https://data.parroquia.app`), `PARROQUIA_LOCAL_ROOT` (default `./docs/public`). Note `PARROQUIA_API` does NOT redirect `PARROQUIA_DATA` — override both if you point somewhere other than production.

**Deployment order matters**: the GitHub workflow runs `migrate.js download` → `docs:before-build` → `docs:build`. `createFiles.js` expects `docs/public/pages/` to exist, so a local `docs:before-build`/`docs:build` needs the content in place first.

## Architecture

### Build is a plain Node CLI pipeline (not a Vite plugin)

`docs/.vitepress/createFiles.js` is the adapter that drives everything. It patches `globalThis.fetch` with a JSON cache (`./.buildtimecache.json`) and, per page and per target language, runs:
- `autocomplete()` — fetches oembed previews (`oembed.js`), YouTube videos (`youtube.js`), Google Calendar events (`calendar.js`), gospel readings (`gospel.js`), and geocodes map coordinates (`utils.getAddress`).
- `translateObject()` — auto-translation against a dictionary built by `buildDictionary()` (`translate.js`).
- `postComplete()` — renders markdown via `markdown-it`, rewrites image/`_block` section fields, builds OG/`hreflang` meta.
- file writes via `node_utils.js` (`read`/`write` on gray-matter frontmatter for `.md`, JSON for `.json`).

It also generates the PWA manifest + icons + favicon (`createManifest` using `sharp`), print CSS (`css.js`, which downloads & subsets fonts with `subset-font`), and sends web-push notifications for tomorrow's events (`notify.js`).

To add a build step or a fetched data source, follow the pattern of the existing `*.js` modules and wire it into `createFiles.js` `run()`.

### Global site config: `config.json`

`docs/.vitepress/config.js` reads `docs/public/pages/config.json` and derives VitePress locales, nav, title/description, fonts (`css.js`), and theme. `config.js` is the VitePress entry: it wires up `VitePWA` (injectManifest strategy, SW source `docs/.vitepress/sw.js`), SEO JSON-LD (`seo.js`), and Google Fonts.

### The block/component rendering system

Page markdown frontmatter carries a `sections[]` array. Each section has `_block` (block type), `type`, `tags`, and block-specific fields. `theme/Layout.vue` renders `<main>` by iterating `sections` and mapping each `_block` → a Vue component via `getBlockComponent()` (first token, capitalized, e.g. `hero-options` → `Hero`, falls back to `Gallery`). Section classes come from `tags` (`dark`, `twocols`, `hidden`...). New block types = new component in `theme/components/` + a `_block` value; the `_block` taxonomy mirrors the site schema served by the editor/API (see config-api).

`blocks.data.js` is a VitePress data loader that scans built `docs/*.md` to aggregate global lists (fundraisings, maps, all pages) for cross-page components.

### Git-inverted layout

The tracked tree is the **template machinery**: everything under `docs/.vitepress/` (the adapter modules, custom theme, components). The actual site content is gitignored: `docs/public/*` (except `sw.js`), generated `docs/**/*.md`, `theme/style.css`, cache, dist. Don't be surprised when `git status` shows no content changes — content lives in the API/R2 and is materialized at build time.

### Deployment (GitHub Actions)

- `.github/workflows/deploy.yml` — `workflow_dispatch` with a `site_slug` input. Split into three jobs with a **deliberate security model**: content downloaded at build time is treated as untrusted/attacker-controlled, so `prepare` validates the slug against `api.parroquia.app/sites/list` and locks the identity; `build` downloads content, before-builds, builds, and uploads an artifact with a **zero-scoped `permissions: {}`** token and no secrets; `deploy` (which holds the `CLOUDFLARE_API_TOKEN` secret) only downloads the exact pinned artifact and pushes it to a Pages project named by slug. Keep untrusted content out of the secret-bearing `deploy`/`dispatch` jobs.
- `.github/workflows/dispatch-fleet.yml` — on push to `main` (for `**/*.md`/`**/*.json`) and nightly cron, fans out a `deploy.yml` run per known site. Only job/permission here needed: `actions: write` + `contents: read`.

## Cross-repo contract (web-template's role)

- `migrate.js` implements flat-filename token encoding and calls config-api endpoints. It MUST stay byte-compatible with `config-api/src/index.js` and `editor/docs/.vitepress/theme/lib/codec.js`, and its API calls must match the endpoints. **The canonical contract is `config-api/README.md`** (and GitHub `catholicweb/config-api`). Before changing encoding or API usage, check all three repos.
- `migrate.js download` reads from **both** `PARROQUIA_API` (list) and `PARROQUIA_DATA` (file bytes). It writes files flat under `LOCAL_ROOT` and validates every remote filename (`safeLocalPath`) to prevent path-traversal writes.
