# Sanity check — audit notes

Quick code review of the web-template repo (build pipeline in `docs/.vitepress/*.js` +
custom VitePress/Tailwind theme in `docs/.vitepress/theme/`). Scope chosen: **focused &
safe** — fix clear-cut dead code, unambiguous bugs, needed comments, and the one
behavior-preserving security hardening. Everything risky, architectural, or speculative is
listed below as **Deferred** with a rationale. This file is the record; see the commit on
`feat/sanity-check` for the fixes themselves.

## Fixed

| Area | What | File |
| --- | --- | --- |
| Dead code | Removed `cleanDir()` (never called, `return` before body, referenced undefined `fg`) + orphaned `fs` import + stale comment | `docs/.vitepress/createFiles.js` |
| Dead code | Removed unused `extractVideoId()` and unused `write`/`path` imports | `docs/.vitepress/oembed.js` |
| Dead code | Removed unused `toArray` export and commented-out alternate map URL | `docs/.vitepress/utils.js` |
| Dead code | Removed unused `write` import + commented `videos`/`events` reads | `docs/.vitepress/blocks.data.js` |
| Dead code | Removed unused imports (`ref`/`computed`/`data`) | `theme/components/EventCards.vue` |
| Dead code | Removed unused `ref`/`computed` | `theme/components/Town.vue` |
| Dead code | Removed unused `onMounted` | `theme/components/Map.vue` |
| Dead code | Removed commented-out dead `getBibleReadings` block | `theme/components/Gospel.vue` |
| Dead code | Removed dead commented update-banner `else` branch | `theme/components/PWA.vue` |
| Bug | Guard `progress = raised/goal*100` against missing/zero `goal` (was `Infinity`/`NaN` → `null`) | `docs/.vitepress/blocks.data.js` |
| Bug | `findIndex(...) || 0` now clamps correctly (`-1` was truthy → index started at `-1`) | `theme/components/Grid.vue` |
| Bug | Typo `"videmo"` → `"vimeo"` in the video-logo detector | `theme/components/Video.vue` |
| Bug | `Town.vue` town list now reactive (`ref`) so switching language re-renders | `theme/components/Town.vue` |
| Bug | Removed duplicated `items-center` class | `theme/components/Footer.vue` |
| Bug | FAQ computation moved out of the per-section loop (was recomputed every iteration); `autocomplete` now passes `fm.lang` explicitly to `getEventFAQ` | `docs/.vitepress/createFiles.js` |
| Security | Escaped `<`, `>`, `&` in serialized JSON-LD so a site value containing `</script>` can't break out of the head `<script>` tag (VitePress doesn't HTML-escape head children) | `docs/.vitepress/seo.js` |
| Comments | Block-mapper limitation, video-gospel/video-channel filters, 47herri sub-filter, `.legal`-block hack | `createFiles.js`, `theme/Layout.vue` |
| Comments | `intersectOptions` heuristics, `parseReference` multichapter hack, `siteOrigin` SSRF caveat | `calendar.js`, `gospel.js`, `fetch.js` |

## Deferred (intentionally not changed — recorded here instead)

1. **Secret in the "no-secrets" build job.** `.github/workflows/deploy.yml` (~line 81)
   passes `OPENROUTER_API_KEY` into the build job that executes per-site **untrusted**
   content (markdown-it, sharp, htmlparser2, LLM JSON parsing). Mitigated (dashboard-capped
   key, model-restricted, `npm ci --ignore-scripts`), but it contradicts the documented
   "NO SECRETS" contract. Moving it requires a translation architecture change — out of a
   sanity check's scope.

2. **Site-content trust model (`v-html`) — stored-XSS surface, accepted by design.**
   `markdown-it({ html: true, ... })` (`createFiles.js`) plus raw site HTML rendered via
   `v-html` in `Gallery.vue`, `Accordion.vue`, `Gospel.vue`, `ScrollyTelling.vue` and Leaflet
   popups in `Map.vue`. Sites own their content; sanitizing would change how rich content
   renders and could alter existing sites. Revisit only if the editor/template starts serving
   untrusted third parties.

3. **Untrusted LLM translation output passed verbatim** into generated pages / JSON-LD
   (`translate.js`). Same trust-model rationale as #2; compounds it (prompt-injection via
   site text could make the model emit HTML). Documented, not changed.

4. **CSS injection.** `css.js` `printCSS()` interpolates `config.theme.*` / `styles[]`
   `{selector, cssClass}` unescaped into the generated stylesheet (`theme/style.css`), and
   `getFontCSS` builds a `preload` for a font that may have failed to subset → 404 preload.
   Trust-model tradeoff; would benefit from validation of `cssClass`/selectors.

5. **fetch.js SSRF.** `siteOrigin()` derives the build's server-side fetch origin from
   untrusted `config.dev.siteurl` (scheme-restricted to https, host not allow-listed). Now
   documented at `docs/.vitepress/fetch.js`. Hardening (pin to `PARROQUIA_DATA`) deferred.

6. **oembed.js `localLinks` reads an unvalidated config-authored path** (relative to CWD,
   not contained to `docs/`). Path-traversal surface if a site's `links` are ever attacker-
   edited. Deferred; would require `path.resolve` containment to the docs root.

7. **Block mapper limitation.** `getBlockComponent()` uses only the first hyphen-segment of
   `_block`, so `scrolly-telling` → `"Scrolly"` → silently falls back to `Gallery`
   (`ScrollyTelling.vue` is effectively unreachable), and unknown/misspelled blocks render a
   blank section with no console warning. Documented in `theme/Layout.vue`. A proper fix
   (kebab→Pascal full-name mapping + an `UnknownBlock` stub + `console.warn`) is a behavioral
   change and was deferred.

8. **Locale-sensitive calendar date parsing.** `calendar.js` formats with `es-ES` and
   hand-parses `DD/MM/YYYY`, assuming ICU/es support; recurring-event and in-config dates use
   slightly different paths. Fragile if the runtime locale ever differs.

9. **Silent-failure ergonomics (build-time).** The global `fetch` interceptor in
   `createFiles.js` returns `{}`/HTTP 400 on *any* error, so a downstream failing request
   becomes an "empty success" (empty calendar/videos/readings) instead of failing the build.
   `translateWithLLM`/`downloadAndSubset` swallow errors similarly, and `run()` has no
   top-level try/catch → partial output on disk errors. Improving these would surface real
   outages but changes failure semantics; deferred.

10. **Notify token in a URL query string** and `notify.js` passing an array (`images`) as the
    push `icon`. Deployment/operational concern; surfaced for awareness on the notifications
    server side.

## Notes for future work

- No dedicated slug-validation module exists — validation is inline in the workflows
  (`^[a-z0-9-]{1,63}$` + `api.parroquia.app/sites/list` allowlist). `fetch.js` doesn't
  validate its own slug arg. A shared, tested helper would harden any future caller.
- Three overlapping carousel implementations: `Carousel.vue`, `Gallery.vue`'s internal
  `carousel` branch, and `Grid.vue`'s `tags:['carousel']`. Consolidation candidate.
- `ScrollyTelling.vue` (unreachable via the mapper, #7) and its global `.step` selector would
  both need attention if the block is re-enabled.
