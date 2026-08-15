<script setup>
import { computed } from "vue";
import ImageCredit from "./ImageCredit.vue";
import { buildImageSrcset } from "./credits.js";

const props = defineProps({
  src: { type: String, required: true },
  alt: { type: String, default: "" },
  index: { type: Number, default: 0 },
  progressive: { type: Boolean, default: false },
  class: { type: String, default: "" },
});

// Media srcs are baked to absolute remote URLs, e.g.
// https://data.parroquia.app/{slug}/{token}.webp — no query params.

// Para URLs de Unsplash o Pexels se genera un srcset responsive a partir de los
// parámetros de su CDN (w/auto/cs); cualquier otro src queda intacto (sin srcset).
const DEFAULT_SIZES = "(min-width: 1024px) 50vw, 100vw";
const srcset = computed(() => buildImageSrcset(props.src));
const isResponsive = computed(() => srcset.value != null);
</script>

<template>
  <!-- El crédito va como hermano (fragmento), nunca envolviendo el <img>: los
       bloques pasan clases de posicionamiento directamente al img (p. ej.
       `absolute inset-0`), y envolverlo rompería esos layouts. ImageCredit
       se autoposiciona y no pinta nada salvo que el src sea de Unsplash/Pexels. -->
  <img :src="src" :srcset="srcset || undefined" :sizes="isResponsive ? DEFAULT_SIZES : undefined" :alt="alt" :class="class" crossorigin="anonymous" :fetchpriority="index >= 1 ? 'low' : 'high'" :loading="index >= 1 ? 'lazy' : 'eager'" />
  <ImageCredit :src="src" />
</template>
