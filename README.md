# Template for parish websites

Visit parroquia.app for a working example.

This repository is a **site factory**: a single template used to build many parish
websites. There are no site-specific files committed here — each site's content is
stored remotely and fetched at build time.

The aim is to provide a simple template for non-technical users to be able to create a
modern parish website. Site content is edited with an online editor, fetched at build
time, processed into something a modern tool like Vitepress can render, and published
to Cloudflare — one site per parish.

The pipeline has three stages:

1. **User input** — site content lives in a remote R2 bucket (behind the config-api)
   and is edited with the online editor (`editor.parroquia.app`), not on git.
2. **Adapter** — `npm run docs:before-build` downloads the site's remote `config.json`
   (via `fetch.js`) and processes the pages/events it contains into the files Vitepress
   needs.
3. **Render** — VitePress + Tailwind CSS v4 turn the processed content into a static
   website.

## Setup

```bash
npm install
node docs/.vitepress/fetch.js <site-slug>
npm run docs:before-build
npm run docs:build # or npm run docs:dev
```

## Stage 1. User input: the editor + API

Site content (site configuration, pages, events, media) is stored in a remote R2
bucket and managed through a schema-driven online editor (`editor.parroquia.app`), as
described in [catholicweb/config-api](https://github.com/catholicweb/config-api). It is
not stored in this repository.

At build time we materialize that content for a given site. The site lives in a single
remote JSON document, and the fetch step also pulls the previously published per-site
data files, so every local file is ready before the adapter runs — no `.md` files and
no images are downloaded:

```bash
node docs/.vitepress/fetch.js <site-slug>
```

`fetch.js` downloads `https://data.parroquia.app/<site-slug>/config.json` (pages under
`pages.list`, events under `calendar.events`), normalizes it, and writes
`docs/public/config.json` for the adapter. It also best-effort materializes
`dictionary.json` + `buildtimecache.json` from the site's public URL and `videos.json`
from the data host, all into `docs/public/`. Media is served remotely — it is
never downloaded or transformed locally. See
[CLAUDE.md](CLAUDE.md) for the env overrides and the cross-repo data contract.

## Stage 2. The adapter: 'npm run docs:before-build'

This is the key stage: it takes the materialized content and processes it, creating the
files stage 3 (Vitepress) needs to render. It reads the site's pages, translates and
enriches them (transform/fetch resources/...) and saves them per language under
`docs/*.md`.

```bash
npm run docs:before-build
```

Key bits are:

- Translate - Autotranslates key fields
- Rewrites media to remote URLs, generates PWA icons...
- Fetch Youtube videos
- Fetch Google calendar events, merging them with the site's own events
- Fetch gospel
- Fetch internal/external pages preview (oembed), eg: fetches youtube video thumbnail from its url
- ...

## Stage 3. Publishing: Vitepress + Tailwind CSS v4

Takes the processed content at `docs/*.md` and creates a magnificent website.

```bash
npm run docs:build
	# or
npm run docs:dev
```

Key elements are:

- `docs/.vitepress/theme/Layout.vue` - We follow a modular approach, this component takes each section defined in the processed `.md` and renders it
- `docs/.vitepress/theme/components/*` - Each section is rendered using a custom `.vue` component

## Deployment

This single repository builds and deploys one Cloudflare Pages project per site. A
GitHub Actions workflow (`.github/workflows/deploy.yml`) is triggered with a
`site_slug`; the `prepare` job validates the slug, the `build` job runs
`fetch.js <slug>` → `docs:before-build` → `docs:build` and uploads the
artifact with a zero-scoped token, and the `deploy` job pushes that artifact to the
Cloudflare Pages project named after the slug. A fleet workflow
(`.github/workflows/dispatch-fleet.yml`) fans out a build per known site on content
changes and nightly.
