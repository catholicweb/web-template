import { defineConfig } from "vitepress";
import { VitePWA } from "vite-plugin-pwa";

import { read } from "./node_utils.js";
import { getJSONLD } from "./seo.js";

import { generateNav, locales } from "./navBar.js";
import { getFontCSS } from "./css.js";

const config = read("./docs/public/config.json");
const DATA = (process.env.PARROQUIA_DATA || "https://data.parroquia.app").replace(/\/$/, "");
// Languages may live at config.pages.languages (editor schema) or top-level (legacy/flat).
const languages = config.languages ?? config.pages?.languages ?? [];
// Trusted per-site data base — set by SITE_SLUG / config._media.base in fetch.js.
const DATA_BASE = config._media?.base || `${DATA}/${process.env.SITE_SLUG || ""}`;

export default defineConfig(async () => {
  const versions = read("./docs/public/icon-versions.json", {});
  const v = (file) => (versions[file] ? `?v=${versions[file]}` : "");
  const { preloads } = await getFontCSS(config.theme ?? {});
  return {
    head: [
      // Load google fonts
      ["link", { rel: "preconnect", href: "https://fonts.gstatic.com", crossorigin: "anonymous" }],
      ...preloads,
      // Manifest and icons
      ["link", { rel: "icon", href: "/favicon.ico", type: "image/x-icon" }],
      ["link", { rel: "icon", href: `/favicon.png${v("favicon.png")}`, type: "image/png" }],
      ["link", { rel: "manifest", href: "/manifest.webmanifest" }],
      ["link", { rel: "apple-touch-icon", href: `/apple-touch-icon.png${v("apple-touch-icon.png")}` }],
      // iOS / PWA installability
      ["meta", { name: "apple-mobile-web-app-capable", content: "yes" }],
      ["meta", { name: "apple-mobile-web-app-status-bar-style", content: "default" }],
      ["meta", { name: "theme-color", content: config.theme?.accentColor || "#ffffff" }],
      ["meta", { name: "color-scheme", content: "light" }],
      ["meta", { name: "viewport", content: "width=device-width, initial-scale=1" }],
    ],
    locales: locales(languages),
    title: config.info?.title,
    cleanUrls: true,
    description: config.info?.description,
    themeConfig: {
      nav: await generateNav(config),
      config: config,
    },
    sitemap: {
      hostname: config.dev?.siteurl,
      // Keep the synthetic 404 pages out of sitemap.xml — they're error handlers, not content.
      transformItems: (items) => items.filter((i) => !String(i.url).endsWith("/404")),
    },
    async transformHead({ pageData }) {
      const path = pageData.relativePath
        .replace(/\.md$/, "")
        .replace(/\.html$/, "")
        .replace(/index$/, "");
      const head = getJSONLD(pageData.frontmatter, config, path);
      const buttonStyle = config.theme?.buttonStyle || "solid";
      if (buttonStyle !== "solid") {
        head.push(["script", {}, `document.documentElement.setAttribute("data-theme-button","${buttonStyle}")`]);
      }
      return head;
    },
    vite: {
      define: {
        __DATA_BASE__: JSON.stringify(DATA_BASE),
        __FIREBASE_CONFIG__: JSON.stringify({
          apiKey: process.env.FCM_API_KEY,
          projectId: process.env.FCM_PROJECT_ID,
          appId: process.env.FCM_APP_ID,
          messagingSenderId: process.env.FCM_MESSAGING_SENDER_ID,
          vapidKey: process.env.FCM_VAPID_KEY,
        }),
        __FCM_TOPIC__: JSON.stringify(process.env.SITE_SLUG || ""),
        __FCM_TOKEN_ENDPOINT__: JSON.stringify("https://api.parroquia.app/api/fcm/token"),
      },
      plugins: [
        VitePWA({
          strategies: "injectManifest",
          // SW source file: docs/.vitepress/sw.js  (srcDir is relative to Vite root = docs/)
          srcDir: ".vitepress",
          filename: "sw.js",
          manifest: {
            name: config.info.title || "Parroquia",
            short_name: config.info.title || "Parroquia",
            description: config.info.description || "",
            start_url: "/",
            display: "standalone",
            background_color: config.theme?.accentColor || "#ffffff",
            theme_color: config.theme?.accentColor || "#ffffff",
            icons: [
              { src: `/icon-192.png${v("icon-192.png")}`, sizes: "192x192", type: "image/png" },
              { src: `/icon-512.png${v("icon-512.png")}`, sizes: "512x512", type: "image/png" },
              { src: `/apple-touch-icon.png${v("apple-touch-icon.png")}`, sizes: "180x180", type: "image/png" },
            ],
          },
          // Show update banner (PWA.vue uses useRegisterSW to detect the needRefresh signal)
          registerType: "prompt",
          devOptions: { enabled: false },
          injectManifest: {
            // Precache built JS/CSS/HTML and common static assets
            globPatterns: ["**/*.{js,css,html,png,svg,ico,woff2,woff}"],
          },
        }),
      ],
    },
  };
});
