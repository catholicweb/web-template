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
  onBackgroundMessage(messaging, (payload) => {
    const notification = payload.notification || {};
    const data = payload.data || {};
    const title = notification.title || data.title || "Nueva notificación";
    const options = {
      body: notification.body || data.body || "",
      icon: notification.image || "/icon-192.png",
      badge: "/icon-192.png",
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
