<script setup>
// Atribución mínima y no intrusiva para imágenes de Unsplash. Las directrices
// de Unsplash exigen dar crédito (enlazando a la página de la foto) cuando se
// usan sus imágenes; aquí se *autodetecta* automáticamente desde la URL: si el
// src apunta a `images.unsplash.com`, se deriva la página de la foto
// (`https://unsplash.com/photos/<id>`) y se pinta una pequeña píldora
// «Foto: Unsplash» en la esquina inferior derecha.
//
// El componente se coloca como *hermano* del <img> (no lo envuelve): así no
// rompe las clases de diseño que los bloques pasan directamente al img (p. ej.
// `absolute inset-0` en el Hero). Se posiciona de forma absoluta contra el
// contenedor posicionado más cercano, que suele coincidir con el área de la
// imagen. Si el src no es de Unsplash no se pinta nada (solo un comentario).

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

const creditUrl = computed(() => unsplashPhotoUrl(props.src));
</script>

<template>
  <a
    v-if="creditUrl"
    :href="creditUrl"
    target="_blank"
    rel="noopener"
    title="Foto de Unsplash"
    class="absolute bottom-1.5 right-1.5 z-20 rounded-full bg-black/55 px-2 py-0.5 text-[11px] leading-none text-white/90 no-underline transition-colors hover:bg-black/75 hover:text-white"
    @click.stop
  >
    Foto: Unsplash
  </a>
</template>
