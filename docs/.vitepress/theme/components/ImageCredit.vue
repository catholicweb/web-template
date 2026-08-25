<script setup>
// Atribución mínima y *incrustada* en la imagen para Unsplash y Pexels,
// unificada. Las directrices de ambos servicios exigen crédito enlazando a la
// página de la foto: aquí se autodetecta desde la URL (ver ./credits.js) y se
// pinta una pequeña etiqueta «Foto: <nombre>» en la esquina inferior derecha.
//
// Va *pegada* a la fotografía, sin fondo: `mix-blend-mode: difference` invierte
// el color de cada píxel de detrás (blanco sobre zonas oscuras, negro sobre
// claras), y el bisel de `text-shadow` (sombra arriba + luz abajo) da a las
// letras el aspecto de talladas en la foto. Nota: el efecto diferencia se
// debilita sobre grises planos — |255-128|≈127 — el bisel lo compensa en zonas
// con textura.
//
// El componente se coloca como *hermano* del <img> (no lo envuelve): así no
// rompe las clases de diseño que los bloques pasan directamente al img (p. ej.
// `absolute inset-0` en el Hero). Se posiciona de forma absoluta contra el
// contenedor posicionado más cercano, que suele coincidir con el área de la
// imagen. Si el src no es de Unsplash ni Pexels no se pinta nada.

import { computed } from "vue";
import { imageCredit } from "./credits.js";

const props = defineProps({
  src: { type: String, required: true },
});

const credit = computed(() => imageCredit(props.src));
</script>

<template>
  <a
    v-if="credit"
    :href="credit.url"
    target="_blank"
    rel="noopener"
    :title="`Foto de ${credit.name}`"
    class="absolute bottom-1 right-1 z-20 text-[10px] leading-none text-white no-underline whitespace-nowrap transition-opacity hover:opacity-85"
    style="mix-blend-mode: difference;"
    @click.stop
  >
    Foto: {{ credit.name }}
  </a>
</template>