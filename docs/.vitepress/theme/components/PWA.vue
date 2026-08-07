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

    if (isStandalone()) {
      setupNotifications();
    }
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

// --- Notification Logic (Unchanged) ---
async function requestNotificationPermission() {
  const permission = await Notification.requestPermission();
  return permission === "granted";
}

async function setupNotifications() {
  try {
    const sw = await navigator.serviceWorker.ready;
    const existing = await sw.pushManager.getSubscription();
    if (existing) return;

    const granted = await requestNotificationPermission();
    if (!granted) return;

    const sub = await sw.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array("BMmcvUGPuJ2n3Ri1kNPmbOiMuN62RSNfMcDv7QHJd8MZveNj_KPTOXdSkzj7vNOQinq8h4b-Tdv-TpnN4YpF-hM"),
    });

    await fetch("https://arrietaeguren.es/subscriptions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subscription: sub }),
    });
  } catch (err) {
    console.error("Notification setup failed:", err);
  }
}

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}
</script>
