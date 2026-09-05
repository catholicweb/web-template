import { clientsClaim } from "workbox-core";
import { cleanupOutdatedCaches, precacheAndRoute, matchPrecache } from "workbox-precaching";
import { NavigationRoute, registerRoute, setCatchHandler } from "workbox-routing";
import { CacheFirst, NetworkFirst, StaleWhileRevalidate } from "workbox-strategies";
import { ExpirationPlugin } from "workbox-expiration";

// Firebase Messaging — must come after Workbox imports so __WB_MANIFEST
// is available for precacheAndRoute above. The /sw import path is the
// SW-specific entry point (see firebase docs).
import { initializeApp } from "firebase/app";
import { getMessaging, onBackgroundMessage, isSupported } from "firebase/messaging/sw";

// Remove precache entries from old service worker versions
cleanupOutdatedCaches();

// Precache all build assets injected by vite-plugin-pwa
precacheAndRoute(self.__WB_MANIFEST);

// Take control of all open clients immediately on activation
clientsClaim();

// When prompted via SKIP_WAITING message, activate the new SW right away
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

// Swallow the known, unfixed Firebase Messaging SDK bug: an internal
// listener sometimes reads `.pushManager` off an undefined registration
// reference after this worker takes over via clientsClaim()/skipWaiting().
// See https://github.com/firebase/firebase-js-sdk/issues/9213 — not our bug,
// this just stops it from surfacing as an uncaught rejection in the SW.
self.addEventListener("unhandledrejection", (event) => {
  const msg = String(event.reason?.message || event.reason || "");
  if (msg.includes("pushManager")) event.preventDefault();
});

// NetworkFirst for page navigations (5 s timeout, then serve from cache).
// Bounded + time-limited so long-lived installs don't accumulate every
// page ever visited.
registerRoute(
  new NavigationRoute(
    new NetworkFirst({
      cacheName: "pages",
      networkTimeoutSeconds: 5,
      plugins: [
        new ExpirationPlugin({
          maxEntries: 50,
          maxAgeSeconds: 7 * 24 * 60 * 60, // 7 days
        }),
      ],
    })
  )
);

// Resolve the data host origin from the same __DATA_BASE__ constant the app
// build uses (see config.js: DATA / SITE_SLUG), rather than hardcoding
// "data.parroquia.app" — keeps this correct if PARROQUIA_DATA changes.
let DATA_ORIGIN = "";
try {
  DATA_ORIGIN = new URL(__DATA_BASE__).origin;
} catch {
  // __DATA_BASE__ missing/malformed — skip the cross-origin data route below.
}

// CacheFirst for hashed, immutable files served from the data host.
// Filenames there are content-hashed, so once cached a given URL's content
// will never change — no need to ever revalidate against the network.
if (DATA_ORIGIN) {
  registerRoute(
    ({ url }) => url.origin === DATA_ORIGIN,
    new CacheFirst({
      cacheName: "data-assets",
      plugins: [
        new ExpirationPlugin({
          maxEntries: 500,
          maxAgeSeconds: 365 * 24 * 60 * 60, // 1 year — safe since filenames are hashed
        }),
      ],
    })
  );
}

// CacheFirst for local hashed build assets under /assets/ (Vite's default
// output dir for hashed JS/CSS/etc.). Registered before the general
// same-origin static route below so it takes precedence for this path —
// Workbox matches routes in registration order.
registerRoute(
  ({ url }) => url.origin === self.location.origin && url.pathname.startsWith("/assets/"),
  new CacheFirst({
    cacheName: "local-hashed-assets",
    plugins: [
      new ExpirationPlugin({
        maxEntries: 300,
        maxAgeSeconds: 365 * 24 * 60 * 60, // 1 year — safe since filenames are hashed
      }),
    ],
  })
);

// StaleWhileRevalidate for other same-origin static assets (scripts, styles,
// images, fonts) that aren't under /assets/ — e.g. root-level icons/manifest
// files whose names aren't hashed and can change between deploys. Scoped by
// request.destination rather than "any same-origin GET" so dynamic
// same-origin fetches (e.g. icon-versions.json) aren't silently served stale.
registerRoute(
  ({ request, url }) =>
    url.origin === self.location.origin &&
    !url.pathname.startsWith("/assets/") &&
    ["script", "style", "image", "font"].includes(request.destination),
  new StaleWhileRevalidate({
    cacheName: "assets",
    plugins: [
      new ExpirationPlugin({
        maxEntries: 200,
        maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
      }),
    ],
  })
);

// Offline fallback: if a navigation has no network and nothing cached yet
// (first-ever visit while offline, or NetworkFirst timeout with an empty
// "pages" cache), serve a precached offline shell instead of failing outright.
// Requires "404.html" to be part of the build and included in the
// injectManifest globPatterns so it lands in the precache.
setCatchHandler(async ({ request }) => {
  if (request.destination === "document") {
    return matchPrecache("/404.html");
  }
  return Response.error();
});

/* ── FCM BACKGROUND MESSAGES ──────────────────────────────────────────────── */

// Initialize Firebase only when config is provided (canary builds / dev
// without env vars get __FIREBASE_CONFIG__ === {} → apiKey is undefined → skipped)
// and only when the current browser/context actually supports Messaging
// (isSupported() guards older Safari, some in-app webviews, etc. where
// getMessaging() would otherwise throw during SW install).
if (typeof __FIREBASE_CONFIG__ !== "undefined" && __FIREBASE_CONFIG__?.apiKey) {
  isSupported()
    .catch(() => false)
    .then((supported) => {
      if (!supported) return;

      initializeApp(__FIREBASE_CONFIG__);
      const messaging = getMessaging();
      onBackgroundMessage(messaging, async (payload) => {
        // Let browser natively handle standard FCM notifications (notification payload)
        if (payload.notification) return;

        const data = payload.data || {};
        const title = data.title || "Nueva notificación";

        let iconUrl = "/icon-192.png";
        const options = {
          body: data.body || "",
          icon: iconUrl,
          badge: iconUrl,
          data: { url: data.url || "/" },
        };
        self.registration.showNotification(title, options);
      });
    });
}

/* ── NOTIFICATION CLICK HANDLERS ────────────────────────────────────────────── */

// Focus an existing tab already showing the target URL instead of always
// opening a new one.
self.addEventListener("notificationclick", (event) => {
  const url = event.notification.data?.url || "/";
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url === url && "focus" in client) return client.focus();
      }
      return clients.openWindow(url);
    })
  );
});