<script setup>
import UnsplashCredit from "./UnsplashCredit.vue";

const props = defineProps({
  src: { type: String, required: true },
  alt: { type: String, default: "" },
  index: { type: Number, default: 0 },
  progressive: { type: Boolean, default: false },
  class: { type: String, default: "" },
});

// Media srcs are baked to absolute remote URLs, e.g.
// https://data.parroquia.app/{slug}/{token}.webp — no query params.
</script>

<template>
  <!-- El crédito va como hermano (fragmento), nunca envolviendo el <img>: los
       bloques pasan clases de posicionamiento directamente al img (p. ej.
       `absolute inset-0`), y envolverlo rompería esos layouts. UnsplashCredit
       se autoposiciona y no pinta nada salvo que el src sea de Unsplash. -->
  <img :src="src" :alt="alt" :class="class" crossorigin="anonymous" :fetchpriority="index >= 1 ? 'low' : 'high'" :loading="index >= 1 ? 'lazy' : 'eager'" />
  <UnsplashCredit :src="src" />
</template>
