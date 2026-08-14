# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> This repo is one of three in the `parroquia` monorepo (web-template, config-api, editor). Read the **parent** `parroquia/CLAUDE.md` for inter-repo contract rules; this file covers web-template only.

## What this repo is

Web-template is a **site factory**, not a single website. It ships the machinery for generating modern parish websites and deploys *one built site per slug* to Cloudflare Pages. Individual sites share this one template; their content is fetched at build time, not committed here.

Files are produced in a 3-stage pipeline:

1. **User input** — site content (site configuration, pages, events, media) lives in a remote R2 bucket behind config-api and is edited with the online editor (`editor.parroquia.app`), not on git. It is materialized at build time by `fetch.js` (which downloads the remote `config.json`, plus the previously published `dictionary.json`, `videos.json`, and `buildtimecache.json`, into `docs/public/`), not committed here. No `.md` files or images are downloaded — media is served remotely (no query params, quality is fixed server-side), and pages/events live inside `config.json`.
2. **Adapter** — `npm run before-build` runs `createFiles.js`, which reads `docs/public/config.json`, enriches and translates each page per language, and writes the renderable output to `docs/*.md`.
3. **Render** — VitePress + Tailwind v4 + a custom theme turn `docs/*.md` into the static site.

## Commands

```bash
npm install                       # install deps
npm run dev                  # VitePress dev server (http://localhost:5173)
npm run before-build         # REQUIRED before build — runs createFiles.js adapter
npm run build                # build static site → docs/.vitepress/dist
npm run preview              # preview the built site
node docs/.vitepress/test.js      # manual scratch script (not a test suite — no test runner exists)
```

Materialize the remote content (see config-api):

```bash
node docs/.vitepress/fetch.js <slug>    # download remote site data -> docs/public/ (config.json + dictionary/videos/buildtimecache)
```

`fetch.js` env overrides: `SITE_SLUG` (slug, or pass as CLI arg), `PARROQUIA_DATA` (public read host, default `https://data.parroquia.app`), `PARROQUIA_LOCAL_ROOT` (default `./docs/public`). `createFiles.js` also calls `fetchConfig()` at the top of its `run()`, so a bare `before-build` re-materializes config automatically when `SITE_SLUG` is set.

**Deployment order matters**: the GitHub workflow runs `fetch.js <slug>` → `before-build` → `build`. `createFiles.js` expects `docs/public/config.json` to exist, so a local `before-build`/`build` needs `fetch.js` run first (or `SITE_SLUG` set).

### Native "home" app (Capacitor)

Alongside the web factory there is a single native **launcher** app in `app/` — not per-site:
it lists every published parish (fetched live from the parroquia API) and opens the chosen
site inside an embedded full-screen WebView, remembering the choice across launches
(system back navigates the site's history, then closes back to the picker).

```bash
npm run app:build   # build the launcher web app -> app/dist (Capacitor webDir)
npm run app:add     # generate the Android native project under app/android
npm run app:sync    # copy app/dist into the native project (+ sync plugins)
npm run app:open    # open app/android in Android Studio
npm run app:run     # sync + build + install to an attached device/emulator
```

- Config lives in `app/capacitor.config.json` (appId/name/webDir — keep it a plain JSON
  file: reading it as `.ts` would pull a TypeScript dependency into the build); the launcher
  UI is a small Vite app (`app/` — isolated from the VitePress docs/ pipeline).
- WebView loading uses first-party `@capacitor/inappbrowser` (`openInWebView`,
  `android.hardwareBack` for the back-to-picker flow). See `app/src/main.js`.
- Native projects (`app/android`, `app/ios`) are **generated and gitignored** — only the
  template machinery is committed, matching the repo's content model.
- **Build env**: Capacitor 8 needs Node ≥22 (see `.nvmrc`). Compiling a real `.apk` needs
  the Android SDK + a JDK (not available on this box); iOS needs a Mac. Native push (APNs/FCM)
  is deliberate not wired up yet — the web-PWA push is untouched.

## Architecture

### Build is a plain Node CLI pipeline (not a Vite plugin)

`docs/.vitepress/createFiles.js` is the adapter that drives everything. It patches `globalThis.fetch` with a JSON cache (`docs/public/buildtimecache.json` — persisted across builds by riding along in the deployed site and being re-downloaded by the fetch step) and, per page and per target language, runs:
- `autocomplete()` — fetches oembed previews (`oembed.js`), YouTube videos (`youtube.js`), Google Calendar events (`calendar.js`), gospel readings (`gospel.js`), and geocodes map coordinates (`utils.getAddress`).
- `translateObject()` — auto-translation against a dictionary built by `buildDictionary()` (`translate.js`).
- `postComplete()` — renders markdown via `markdown-it`, rewrites image/`_block` section fields, builds OG/`hreflang` meta.
- file writes via `node_utils.js` (`read`/`write` on gray-matter frontmatter for `.md`, JSON for `.json`).

It also downloads & subsets the site fonts (`css.js` `getFontCSS` — done in pre-build so the VitePress build step stays offline), generates the PWA manifest + icons + favicon (`createManifest` using `sharp`), emits print CSS (`css.js` `printCSS`), and sends web-push notifications for tomorrow's events (`notify.js`).

To add a build step or a fetched data source, follow the pattern of the existing `*.js` modules and wire it into `createFiles.js` `run()`.

### Global site config: `config.json`

`docs/.vitepress/config.js` reads `docs/public/config.json` and derives VitePress locales, nav, title/description, fonts (`css.js`), and theme. `config.js` is the VitePress entry: it wires up `VitePWA` (injectManifest strategy, SW source `docs/.vitepress/sw.js`), SEO JSON-LD (`seo.js`), and Google Fonts.

### Look & feel: the `theme` object

`config.theme` is the single source of site appearance. Beyond colors and fonts, it now drives several design tokens and structural layouts, all with defaults that keep existing sites looking close to before:

**Design tokens** (generated into the Tailwind `@theme` block by `css.js` `printCSS()`, so every component's `rounded-*` / `shadow-*` utility auto-updates — no per-component edits needed):
- `theme.radius`: `sharp | soft | rounded | pill` (default `soft` ≈ current Tailwind values). Emits `--radius-sm…3xl`; `--radius-full` stays `9999px`.
- `theme.shadow`: `none | light | medium | strong` (default `medium` ≈ current). Emits `--shadow-sm…xl`.
- `theme.container`: `wide` (default, `80rem`). Declarative `--container-max` token, ready to extend.

**Structural options** (branch in components):
- `theme.navStyle`: `default | 47herri | centered | minimal | two-row | solid-dark` (default `default`). Handled in `Navbar.vue` via a per-style class map (`NAV_STYLES`); `centered` centers links, `minimal` shows only a hamburger, `two-row` stacks logo above links, `solid-dark` uses a dark bar. `47herri` keeps its hero-image scrim + `EventCards` behavior.
- `theme.footerStyle`: `auto | standard | minimal | expanded` (default `auto`). Handled in `Footer.vue`; `auto` shows only the columns (contact / description+social / bank) that actually have data and gives richer sections more grid space (`md:col-span-2`), `standard` is the legacy 3-column, `minimal` is copyright + one contact line, `expanded` adds a nav-links column and a full-width social row.
- `theme.buttonStyle`: `solid | outline | soft | pill` (default `solid`). `css.js` emits override CSS keyed by a `data-theme-button` attribute that `config.js`'s `transformHead` injects on `<html>`; `outline`/`soft` retarget `.bg-accent` CTAs and `pill` adds horizontal padding.

Defaults are applied with `||` fallbacks in `css.js` `printCSS()`, so configs that omit these fields render the legacy look.

### The block/component rendering system

Page markdown frontmatter carries a `sections[]` array. Each section has `_block` (block type), `type`, `tags`, and block-specific fields. `theme/Layout.vue` renders `<main>` by iterating `sections` and mapping each `_block` → a Vue component via `getBlockComponent()` (first token, capitalized, e.g. `hero-options` → `Hero`, falls back to `Gallery`). Section classes come from `tags` (`dark`, `twocols`, `hidden`...). New block types = new component in `theme/components/` + a `_block` value; the `_block` taxonomy mirrors the site schema served by the editor/API (see config-api).

`blocks.data.js` is a VitePress data loader that scans built `docs/*.md` to aggregate global lists (fundraisings, maps, all pages) for cross-page components.

### Git-inverted layout

The tracked tree is the **template machinery**: everything under `docs/.vitepress/` (the adapter modules, custom theme, components). The actual site content is gitignored: `docs/public/*` (except `sw.js`), generated `docs/**/*.md`, `theme/style.css`, cache, dist. Don't be surprised when `git status` shows no content changes — content lives in the API/R2 and is materialized at build time.

### Deployment (GitHub Actions)

- `.github/workflows/deploy.yml` — `workflow_dispatch` with a `site_slug` input. Split into three jobs with a **deliberate security model**: content downloaded at build time is treated as untrusted/attacker-controlled, so `prepare` validates the slug against `api.parroquia.app/sites/list` and locks the identity; `build` downloads content, before-builds, builds, and uploads an artifact with a **zero-scoped `permissions: {}`** token and no secrets; `deploy` (which holds the `CLOUDFLARE_API_TOKEN` secret) only downloads the exact pinned artifact and pushes it to a Pages project named by slug. Keep untrusted content out of the secret-bearing `deploy`/`dispatch` jobs.
- `.github/workflows/dispatch-fleet.yml` — on push to `main` (for `**/*.md`/`**/*.json`) and nightly cron, fans out a `deploy.yml` run per known site. Only job/permission here needed: `actions: write` + `contents: read`.

## Cross-repo contract (web-template's role)

- `fetch.js` reads the site config from the public data host (`PARROQUIA_DATA` / `https://data.parroquia.app/{slug}/config.json`). It expects the config to follow the editor/config-api schema: `pages.list` (index page `protected:"Portada"`, town template `protected:"Plantilla pueblos"`), `calendar.events.{list,urls}` + `event-types.list`, and `config.json` must be reachable as a plain flat filename.
- Media field values in `config.json` are **absolute URLs** (e.g. `https://data.parroquia.app/<slug>/<name>.webp`) authored by the editor. `resolveMedia()` in `createFiles.js` passes them through untouched and only rewrites legacy `/media/…` values (flattening slashes to `-`) for backward compat. The canonical endpoint/URL contract is `config-api/README.md` (GitHub `catholicweb/config-api`).
