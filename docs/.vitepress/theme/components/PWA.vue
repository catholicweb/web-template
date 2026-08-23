<template>
  <div>
    <div v-if="state.showUpdateBanner" class="fixed top-0 left-0 right-0 z-[9999] bg-blue-600 text-white p-4 flex gap-3 justify-center items-center shadow">
      <span>Nueva versión disponible</span>
      <button @click="reloadPage" class="px-3 py-1 bg-white text-blue-600 font-semibold rounded cursor-pointer">Refrescar</button>
      <button @click="state.showUpdateBanner = false" class="px-3 py-1 border border-white rounded cursor-pointer">Cerrar</button>
    </div>

    <button v-show="state.showInstallButton" @click="handleInstall" class="fixed bottom-6 right-6 bg-white border border-neutral-300 rounded-full p-3 shadow hover:bg-neutral-100 active:scale-95 cursor-pointer z-[9998]" title="Instalar app">
      <svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor">
        <path d="M12 16l4-5h-3V4h-2v7H8l4 5zm-7 2h14v2H5v-2z" />
      </svg>
    </button>
  </div>
</template>

<script setup>
import { ref, onMounted } from "vue";
import { useData } from "vitepress";
import { useRegisterSW } from "virtual:pwa-register/vue";
import { initializeApp } from "firebase/app";
import { getMessaging, getToken, onMessage } from "firebase/messaging";

const { theme } = useData();
// Default to false so it doesn't flicker on already-installed apps
const state = ref({ showInstallButton: false, showUpdateBanner: false });
let deferredPrompt;

// vite-plugin-pwa: detect when a new SW is waiting and trigger skipWaiting on demand
const { updateServiceWorker } = useRegisterSW({
  onNeedRefresh() {
    // Only auto-reload when the site opts in via theme.pwa.autoReload; the
    // manual "new version available" banner is intentionally unused.
    if (theme.value.pwa?.autoReload) {
      updateServiceWorker(true);
    }
  },
});

function reloadPage() {
  updateServiceWorker(true);
}

// Utility to detect iOS
const isIOS = () => {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
};

// Check if already installed/standalone
const isStandalone = () => {
  return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone;
};

// Wait for SW to be ready, but bail out quickly in dev mode (no SW registered)
const waitForSwReady = () =>
  Promise.race([
    navigator.serviceWorker.ready,
    new Promise((_, __) => setTimeout(__, 5000)),
  ]);

// ─── FCM notification setup (for ALL visitors, not just installed users) ───
async function setupNotifications() {
  if (typeof __FIREBASE_CONFIG__ === "undefined" || !__FIREBASE_CONFIG__?.apiKey) {
    return; // FCM not configured (canary build / unconfigured site)
  }
  if (!__FCM_TOPIC__) return;   // no site slug → no topic → skip
  if (!__FCM_TOKEN_ENDPOINT__) return; // no endpoint → skip

  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;

  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return;

    const app = initializeApp(__FIREBASE_CONFIG__);
    const messaging = getMessaging(app);
    const swRegistration = await waitForSwReady();
    if (!swRegistration) return; // dev mode or SW not ready

    const token = await getToken(messaging, {
      vapidKey: __FIREBASE_CONFIG__.vapidKey,
      serviceWorkerRegistration: swRegistration,
    });

    if (!token) {
      console.warn("No FCM token received");
      return;
    }

    // POST token to the configured endpoint so it can subscribe the
    // token to the site's topic. The endpoint (config-api, a CF Worker)
    // uses the FCM HTTP API with a server key — the browser cannot
    // subscribe tokens to topics itself (web SDK limitation). See
    // firebase/firebase-js-sdk#5289.
    await fetch(__FCM_TOKEN_ENDPOINT__, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, site: __FCM_TOPIC__ }),
    });

    console.log(`FCM token registered for topic: ${__FCM_TOPIC__}`);

    // Foreground message handler — show an in-app notification when
    // the page is open and an FCM message arrives.
    onMessage(messaging, (payload) => {
      const notification = payload.notification || {};
      const data = payload.data || {};
      const title = notification.title || data.title || "Nueva notificación";
      new Notification(title, {
        body: notification.body || data.body || "",
        icon: "/icon-192.png",
        badge: "/icon-192.png",
        data: { url: data.url || "/" },
      });
    });
  } catch (err) {
    console.error("FCM setup failed:", err);
  }
}

onMounted(() => {
  if (typeof window !== "undefined" && "serviceWorker" in navigator) {
    // --- LOGIC FOR ANDROID / CHROME / DESKTOP ---
    window.addEventListener("beforeinstallprompt", (e) => {
      e.preventDefault();
      deferredPrompt = e;
      // Show button only if not already installed
      if (!isStandalone()) {
        state.value.showInstallButton = true;
      }
    });

    // --- LOGIC FOR IOS ---
    // Since iOS doesn't fire beforeinstallprompt, we manually check
    if (isIOS() && !isStandalone()) {
      state.value.showInstallButton = true;
    }

    window.addEventListener("appinstalled", () => {
      state.value.showInstallButton = false;
      deferredPrompt = null;
    });

    // Set up FCM notifications for ALL visitors (not just installed users)
    setupNotifications();
  }
});

async function handleInstall() {
  // If we have the deferredPrompt (Android/Chrome)
  if (deferredPrompt) {
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      state.value.showInstallButton = false;
    }
    deferredPrompt = null;
  }
  // If iOS
  else if (isIOS()) {
    alert("Para instalar esta app en tu iPhone: pulsa el icono 'Compartir' de Safari y selecciona 'Añadir a la pantalla de inicio'.");
  }
}
</script>
