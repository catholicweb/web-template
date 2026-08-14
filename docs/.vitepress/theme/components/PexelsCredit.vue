<script setup>
// Atribución mínima y no intrusiva para imágenes de Pexels. La política de
// Pexels exige dar crédito al fotógrafo (nombre + enlace a la página de la
// foto). El editor guarda la URL de images.pexels.com con dos params de query —
// `photographer` y `url` (ver el convenio en ./pexels.js) — de modo que aquí se
// *autodetectan* desde la URL y se pinta una pequeña píldora «Foto: <nombre>»
// que enlaza a la página de la foto (que además cumple el "enlace prominente a
// Pexels").
//
// El componente se coloca como *hermano* del <img> (no lo envuelve): así no
// rompe las clases de diseño que los bloques pasan directamente al img (p. ej.
// `absolute inset-0` en el Hero). Se posiciona de forma absoluta contra el
// contenedor posicionado más cercano, que suele coincidir con el área de la
// imagen. Si el src no es de Pexels (o no lleva fotógrafo) no se pinta nada.
import { computed } from "vue";
import { isPexelsUrl } from "./pexels.js";

const props = defineProps({
  src: { type: String, required: true },
});

// Devuelve { name, url } de la atribución codificada en la URL, o null si el
// src no es una imagen de Pexels con esos params.
function pexelsCredit(src) {
  if (!isPexelsUrl(src)) return null;
  let url;
  try {
    url = new URL(src);
  } catch {
    return null;
  }
  const name = url.searchParams.get("photographer");
  const photoUrl = url.searchParams.get("url");
  if (!name || !photoUrl) return null;
  return { name, url: photoUrl };
}

const credit = computed(() => pexelsCredit(props.src));
</script>

<template>
  <a
    v-if="credit"
    :href="credit.url"
    target="_blank"
    rel="noopener"
    :title="`Foto de ${credit.name}`"
    class="absolute bottom-1.5 right-1.5 z-20 rounded-full bg-black/55 px-2 py-0.5 text-[11px] leading-none text-white/90 no-underline transition-colors hover:bg-black/75 hover:text-white"
    @click.stop
  >
    Foto: {{ credit.name }}
  </a>
</template>
