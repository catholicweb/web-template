<script setup>
// Atribución mínima y no intrusiva para imágenes de Pexels. La política de
// Pexels exige dar crédito al fotógrafo (nombre + enlace prominente a Pexels).
// El editor guarda la URL de images.pexels.com con un param de query —
// `photographer` (ver el convenio en ./pexels.js) — de modo que aquí se
// *autodetecta* desde la URL y se pinta una pequeña píldora «Foto: <nombre>»
// que enlaza a la página principal de Pexels (que cumple el "enlace prominente
// a Pexels").
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

function pexelsCredit(src) {
  if (!isPexelsUrl(src)) return null;
  let url;
  try {
    url = new URL(src);
  } catch {
    return null;
  }
  const name = url.searchParams.get("photographer");
  return name || null;
}

const creditName = computed(() => pexelsCredit(props.src));
</script>

<template>
  <a
    v-if="creditName"
    href="https://www.pexels.com"
    target="_blank"
    rel="noopener"
    :title="`Foto de ${creditName}`"
    class="absolute bottom-1.5 right-1.5 z-20 rounded-full bg-black/55 px-2 py-0.5 text-[11px] leading-none text-white/90 no-underline transition-colors hover:bg-black/75 hover:text-white"
    @click.stop
  >
    Foto: {{ creditName }}
  </a>
</template>
