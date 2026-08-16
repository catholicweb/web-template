<script setup>
import { computed } from "vue";
import { useData } from "vitepress";
import { data } from "./../../notFound.data.js";
import Gallery from "./Gallery.vue";

// Matches the same data-loader access pattern as Town.vue / Fundraising.vue.
const { lang } = useData();

// Static fallback used when the data loader yields nothing (e.g. dev server
// without `before-build`, or before the 404.md files are emitted). Spanish-only
// to match the 404 page's base-language copy.
const FALLBACK = {
  type: "text",
  _block: "gallery",
  html:
    `<img src="/good-shepherd.svg" alt="El Buen Pastor" style="width:min(520px,100%)" />` +
    "\n\n" +
    `## ¡Uy! Te has perdido…` +
    "\n\n" +
    `No pasa nada: hasta la oveja descarriada tiene un lugar junto al Buen Pastor. Esta página no existe, pero de aquí no te echa nadie.` +
    "\n\n" +
    `> "Yo soy el camino, y la verdad, y la vida." (Juan 14, 6)` +
    "\n\n" +
    `<a href="/" class="not-prose inline-block bg-accent text-white font-medium px-6 py-2 rounded-lg mt-4">Volver a la página de inicio</a>`,
};

const block = computed(() => {
  const list = data?.entries || [];
  const e = list.find((x) => x.code === lang.value) || list[0];
  return (e?.sections?.[0]) || FALLBACK;
});
</script>

<template>
  <div class="min-h-[70vh] flex items-center justify-center w-full">
    <Gallery :block="block" />
  </div>
</template>
