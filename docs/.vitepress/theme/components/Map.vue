<template>
  <div class="map py-8 max-w-3xl mx-auto md:px-4">
    <div class="w-full h-96 overflow-hidden md:shadow-md">
      <LazyItem class="w-full h-full z-0">
        <div ref="mapContainer" class="w-full h-full z-0"></div>
      </LazyItem>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from "vue";
import LazyItem from "./LazyItem.vue";
import { data } from "./../../blocks.data.js";
import { useData, useRoute } from "vitepress";
const { page } = useData();
const route = useRoute();

const props = defineProps({ block: { type: Object, required: true } });

const mapContainer = ref(null);
let map = null;
let markersLayer = null;
let L = null; // Store Leaflet instance locally

watch(
  () => page.value.frontmatter.lang,
  (lang) => {
    renderMarkers(lang);
  },
);

watch(mapContainer, (newVal) => {
  if (newVal) loadMap();
});

const allMaps = ref([]);

async function loadMap() {
  if (!mapContainer.value) return;

  // 1. Dynamically import Leaflet and its CSS
  // Vite handles the CSS injection automatically here
  const LeafletModule = await import("leaflet");
  await import("leaflet/dist/leaflet.css");

  // 2. Load the plugin (Vite will bundle this separately)
  await import("leaflet-fullscreen");
  await import("leaflet-fullscreen/dist/leaflet.fullscreen.css");

  L = LeafletModule.default || LeafletModule;

  // Try load the geojson file (if any) — served per-site from the data host
  fetch(`${__DATA_BASE__}/map.geojson`)
    .then((response) => response.json()) // Convert the response to JSON
    .then((data) => {
      L.geoJSON(data).addTo(map);
    })
    .catch((error) => {
      console.info("Unable to load geoJSON");
    });

  var supportsTouch = "ontouchstart" in window || navigator.msMaxTouchPoints;

  map = L.map(mapContainer.value, { fullscreenControl: true, zoomControl: !supportsTouch });

  const latLngBounds = data.maps.map((m) => m.geo?.split(",").map((s) => Number(s.trim())));

  var bounds = L.latLngBounds(latLngBounds);

  map.fitBounds(bounds, { padding: [40, 40] });

  L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", { attribution: "Voyager", crossOrigin: "anonymous", maxZoom: 24 }).addTo(map);

  markersLayer = L.layerGroup().addTo(map);

  renderMarkers(page.value.frontmatter.lang);
}

function renderMarkers(lang) {
  if (!markersLayer) return;

  // Create a smaller icon
  const smallIcon = L.icon({
    iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
    shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
    crossOrigin: "anonymous",
    iconSize: [15, 25], // Width and Height in pixels (Original is 25x41)
    iconAnchor: [7, 25], // The point of the icon which will correspond to marker's location
    popupAnchor: [1, -20], // Point from which the popup should open relative to the iconAnchor
    shadowSize: [25, 25], // Shadow needs scaling too
  });

  markersLayer.clearLayers();
  data.maps
    .filter((m) => m.lang === lang && m.geo)
    .forEach((m) => {
      const g = m.geo.split(",").map((s) => Number(s.trim()));

      const googleUrl = `https://www.google.com/maps/dir/?api=1&destination=${m.geo}`;

      let wazeUrl = `https://waze.com/ul?ll=${m.geo}&navigate=yes`;
      if (/Android/i.test(navigator.userAgent)) {
        const fallback = encodeURIComponent(`https://waze.com/ul?ll=${m.geo}&navigate=yes`);
        wazeUrl = `intent://waze.com/ul?ll=${m.geo}&navigate=yes#Intent;package=com.waze;scheme=https;S.browser_fallback_url=${fallback};end;`;
      }

      const html = `
    <h3 class="text-center m-0 text-lg font-bold text-accent">
      ${m.name} (${m.title})
    </h3>
    <div class="relative overflow-hidden">
      <a href="${m.url}" class="block">
        <img src="${m.image}" class="w-full aspect-video object-cover block" />
      </a>
      
      <div class="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-3 bg-white px-3 py-2 rounded-full">
        <a href="${googleUrl}" target="_blank" rel="noopener">
          <img src="https://upload.wikimedia.org/wikipedia/commons/a/aa/Google_Maps_icon_%282020%29.svg" crossorigin="anonymous" loading="lazy" class="w-5 h-5" alt="Google Navigation" />
        </a>
        <div class="w-[1px] h-4 bg-gray-300 self-center"></div>
        <a href="${wazeUrl}" target="_blank" rel="noopener">
          <img src="https://upload.wikimedia.org/wikipedia/commons/8/8b/Tabler-icons_brand-waze.svg" crossorigin="anonymous" loading="lazy" class="w-5 h-5" alt="Waze Navigation" />
        </a>
      </div>
    </div>`;

      const marker = L.marker(g, { icon: smallIcon }).bindPopup(html).addTo(markersLayer);

      if (m.url == route.path) {
        marker._icon.classList.add("special");
      } else {
        marker._icon.classList.add("grayscale", "opacity-50");
      }
    });
}
</script>

<style>
.leaflet-pane .leaflet-marker-pane img {
  filter: hue-rotate(calc(var(--accent-angle) - 204deg));
}

.leaflet-pane .leaflet-marker-pane img.special {
  filter: hue-rotate(calc(var(--primary-angle) - 204deg));
}

.leaflet-popup-content-wrapper {
  padding: 0px !important;
  overflow: hidden;
}

.leaflet-popup {
  width: 300px; /* Increase or decrease the width */
  max-width: 400px; /* Optional: max-width, to prevent the popup from getting too large */
}

.bounce {
  animation: bounce 0.6s infinite alternate ease-in-out;
}

.leaflet-popup-content {
  min-width: 100%;
  min-height: 100%;
  margin: 0px !important;
}

body .leaflet-container a.leaflet-popup-close-button {
  top: 1px;
  right: 3px;
  font: inherit;
  font-weight: bold;
  font-size: large;
}

@keyframes bounce {
  0% {
    transform: translateY(0);
  }

  100% {
    transform: translateY(-10px);
  }
}

.leaflet-pane > svg path.leaflet-interactive {
  stroke: none;
  fill: red;
}
</style>
