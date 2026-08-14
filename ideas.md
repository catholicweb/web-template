# Ideas — Things to build next

This file captures promising paths that came out of conversation but were out of
scope for the branch that spawned them. They are not commitments — they are
"someone should build this when the time is right" notes.

---

## ✨ Extract the launcher to its own repo with a CI that builds the APK/AAB

### Why

The launcher app (`app/`) is architecturally a completely different thing from the
site factory:

| | web-template (site factory) | the launcher (Capacitor app) |
|---|---|---|
| What it does | Renders static parish websites from config.json | Lists live sites → opens chosen one in a WebView |
| Deps | VitePress, Tailwind, sharp, markdown-it, Leaflet, … | Vite + 5 Capacitor plugins (nothing else) |
| Build | Complex pipeline: fetch → translate → createFiles → vitepress build | `cd app && vite build` (300ms) |
| State | Git-inverted, built per-slug | One app for all sites, content loaded live |
| Lifecycle | Deployed to Cloudflare Pages frequently | Published to stores once, updated occasionally |

Co-locating them in one repo means:

- CI for the web pipeline (heavy, 70+ deps) is forced onto the app developer too.
- The web-template repo's `package.json` carries Capacitor deps that only the
  0.1 % app developer ever needs, and the app's `package.json` must mirror them
  for Capacitor's plugin-discovery to work — redundant and confusing.
- Versioning is coupled: an app fix requires a full web-template release.
- The launcher feels like a second-class citizen hidden in a subdirectory with
  awkward `cd app && …` commands.

### What the idea is

1. **Spin the launcher out into its own Git repo** (e.g. `catholicweb/parroquia-app`):

   - Copy `app/` contents into the new repo root.
   - `package.json` keeps only: `vite`, `@capacitor/core`, `@capacitor/android`,
     `@capacitor/ios`, `@capacitor/preferences`, `@capacitor/inappbrowser`.
   - `capacitor.config.json` stays as-is.
   - `index.html`, `src/`, `vite.config.js` stay as they are. Everything
     the app needs is already self-contained.
   - The web-template repo can drop `app/` entirely (or keep a simplified
     "example app" that people can fork).

2. **Add a GitHub Actions workflow** (`./github/workflows/build.yml`) that
   compiles the native APK/AAB on every tag (or on push to `main`):

   ```yaml
   name: Build and release the app

   on:
     push:
       tags: "v*"
     workflow_dispatch:

   jobs:
     build-android:
       runs-on: ubuntu-24  # has Android SDK pre-installed
       steps:
         - name: Checkout
           uses: actions/checkout@v4

         - name: Setup Node (≥22)
           uses: actions/setup-node@v4
           with:
             node-version: 24
             cache: npm

         - name: Install deps
           run: npm ci

         - name: Build the launcher web app
           run: npm run build   # → dist/

         - name: Sync with Capacitor
           run: npx cap sync android

         - name: Build the Android APK/AAB
           run: npx cap build android --keystore-path … --keystore-pass …
           env:
             # Signing secrets come from GitHub secrets
             ANDROID_KEYSTORE: ${{ secrets.ANDROID_KEYSTORE }}
             ANDROID_KEYSTORE_PASSWORD: ${{ secrets.ANDROID_KEYSTORE_PASSWORD }}

         - name: Upload APK as artifact
           uses: actions/upload-artifact@v4
           with:
             name: parroquia-app
             path: app/android/app/build/outputs/apk/release/*.apk

         - name: Create GitHub Release
           uses: softprops/action-gh-release@v2
           with:
             files: app/android/app/build/outputs/apk/release/*.apk
   ```

   - Signing requires a keystore committed securely (base64-encoded in a
     GitHub secret) — standard Android practice.
   - For **iOS** a separate job would run on `macos-latest` and use
     `npx cap build ios` (needs an Apple Developer account and signing
     certificates in GitHub secrets).

3. **Optional enhancements** (phase 2, not v1):

   - Run `cap add android` and commit the generated native project to speed
     up the CI (tradeoff: bigger repo, but `add` is fast).
   - Add [fastlane](https://fastlane.tools) for automated Play Store /
     App Store uploads after a release.
   - Wire the workflow to also build **a per-site version** of the launcher
     (bundle a specific parish's icon/splash/config instead of the picker) —
     for a parish that wants their own branded app.
   - Filter the site list shown in the app: some API-listed sites may be
     test/internal and shouldn't appear to users. A simple curated allowlist
     in the launcher's config or a filter query param in the API would work.

### What stays behind in web-template

- The `CLAUDE.md` / `README.md` "Native app" docs would be replaced with a
  pointer to the new repo.
- `ideas.md` lives here and says "the launcher was extracted to X".

### Constraints

- The API contract (`dev.siteurl`, `site.title`, `site.icon` shape) must stay
  in sync between repos. A breaking field rename in `config.json` would break
  the launcher — but since the launcher loads live sites, breaking changes
  already break the live web, so this is low risk.
- The `.apk` build requires signing the release keystore. For the first few
  releases a developer can sign locally and upload manually; CI signing can
  come later.

---

## 🔔 Native push notifications

(See main CLAUDE.md — the web-PWA web-push is not touched.)

If the app needs push, a follow-up would wire `@capacitor/push-notifications`
for FCM (Android) / APNs (iOS) instead of web-push. This requires:

- A Firebase project + `google-services.json` in `android/app/`.
- The push notification backend (`notify.js` or a rewrite) to send through
  FCM instead of the web-push API.
- A new endpoint or integration with the existing web-push subscription store.

---

## 🧩 PWA as a lighter alternative (for users who won't install the app)

The web app already ships an installable PWA with a service worker, offline
support via Workbox, and a push notification banner (`PWA.vue`). No extra
work needed — but it could be advertised more prominently as "no app store
required" for Android users who prefer it.