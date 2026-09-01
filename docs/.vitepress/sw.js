import { clientsClaim } from "workbox-core";
import { cleanupOutdatedCaches, precacheAndRoute } from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";
import { NetworkFirst, StaleWhileRevalidate } from "workbox-strategies";

// Firebase Messaging — must come after Workbox imports so __WB_MANIFEST
// is available for precacheAndRoute above. The /sw import path is the
// SW-specific entry point (see firebase docs).
import { initializeApp } from "firebase/app";
import { getMessaging, onBackgroundMessage } from "firebase/messaging/sw";

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

// NetworkFirst for page navigations (5 s timeout, then serve from cache)
registerRoute(
  new NavigationRoute(
    new NetworkFirst({
      cacheName: "pages",
      networkTimeoutSeconds: 5,
    })
  )
);

// StaleWhileRevalidate for all other same-origin GET requests (JS, CSS, images…)
registerRoute(
  ({ url }) => url.origin === self.location.origin,
  new StaleWhileRevalidate({ cacheName: "assets" })
);

/* ── FCM BACKGROUND MESSAGES ──────────────────────────────────────────────── */

// Initialize Firebase only when config is provided (canary builds / dev
// without env vars get __FIREBASE_CONFIG__ === {} → apiKey is undefined → skipped)
if (typeof __FIREBASE_CONFIG__ !== "undefined" && __FIREBASE_CONFIG__?.apiKey) {
  initializeApp(__FIREBASE_CONFIG__);
  const messaging = getMessaging();
  onBackgroundMessage(messaging, async (payload) => {
    // Let browser natively handle standard FCM notifications (notification payload)
    if (payload.notification) return;

    const data = payload.data || {};
    const title = data.title || "Nueva notificación";

    let iconUrl = "/icon-192.png";
    try {
      const res = await fetch("/icon-versions.json");
      if (res.ok) {
        const versions = await res.json();
        const hash = versions["icon-192.png"] || versions["icon-192"];
        if (hash) iconUrl = `/icon-192.png?v=${hash}`;
      }
    } catch {
      // fallback: unversioned URL
    }

    const options = {
      body: data.body || "",
      icon: iconUrl,
      badge: iconUrl,
      data: { url: data.url || "/" },
    };
    self.registration.showNotification(title, options);
  });
}

/* ── NOTIFICATION CLICK HANDLERS ────────────────────────────────────────────── */

self.addEventListener("notificationclick", (event) => {
  const url = event.notification.data?.url || "/";
  event.notification.close();
  event.waitUntil(clients.openWindow(url));
});
