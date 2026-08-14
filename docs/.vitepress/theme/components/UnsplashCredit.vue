<script setup>
// Atribución mínima y no intrusiva para imágenes de Unsplash. Las directrices
// de Unsplash exigen dar crédito al fotógrafo (nombre + enlace a la página de
// la foto). El editor guarda la URL de images.unsplash.com con un param de
// query — `photographer` — cuando está disponible, así que aquí se lee desde
// la URL para pintar el nombre; si no está presente (imágenes guardadas antes
// de este cambio), se muestra «Foto: Unsplash».
//
// Además se deriva la página de la foto a partir del pathname de la CDN
// (https://images.unsplash.com/photo-<id>) para construir el enlace de
// atribución con los utm params que exige Unsplash.
//
// El componente se coloca como *hermano* del <img> (no lo envuelve): así no
// rompe las clases de diseño que los bloques pasan directamente al img (p. ej.
// `absolute inset-0` en el Hero). Se posiciona de forma absoluta contra el
// contenedor posicionado más cercano, que suele coincidir con el área de la
// imagen. Si el src no es de Unsplash no se pinta nada.

import { computed } from "vue";
import { isUnsplashUrl } from "./unsplash.js";

const props = defineProps({
  src: { type: String, required: true },
});

// Params utm que exige Unsplash en el enlace de atribución.
const UTM_PARAMS = "utm_source=parroquia.app&utm_medium=referral";

// Extrae el id de la foto del pathname de una URL de images.unsplash.com:
//   https://images.unsplash.com/photo-<id>?params...  ->  https://unsplash.com/photos/<id>
// Devuelve null si el src no es una imagen de Unsplash (no se pinta crédito).
function unsplashPhotoUrl(src) {
  if (!isUnsplashUrl(src)) return null;
  let url;
  try {
    url = new URL(src);
  } catch {
    return null;
  }
  const m = url.pathname.match(/^\/photo-([^/]+)/);
  if (!m) return null;
  return `https://unsplash.com/photos/${m[1]}?${UTM_PARAMS}`;
}

function unsplashPhotographer(src) {
  if (!isUnsplashUrl(src)) return null;
  let url;
  try {
    url = new URL(src);
  } catch {
    return null;
  }
  return url.searchParams.get("photographer") || null;
}

const creditUrl = computed(() => unsplashPhotoUrl(props.src));
const label = computed(() => {
  const name = unsplashPhotographer(props.src);
  return name ? `Foto: ${name}` : "Foto: Unsplash";
});
</script>

<template>
  <a
    v-if="creditUrl"
    :href="creditUrl"
    target="_blank"
    rel="noopener"
    :title="label"
    class="absolute bottom-1.5 right-1.5 z-20 rounded-full bg-black/55 px-2 py-0.5 text-[11px] leading-none text-white/90 no-underline transition-colors hover:bg-black/75 hover:text-white"
    @click.stop
  >
    {{ label }}
  </a>
</template>
