<script setup>
import { computed } from "vue";

const props = defineProps({
  src: { type: String, required: true },
  alt: { type: String, default: "" },
  index: { type: Number, default: 0 },
  progressive: { type: Boolean, default: false },
  class: { type: String, default: "" },
});

// Media srcs are baked to absolute remote URLs with a server-side quality
// param, e.g. https://data.parroquia.app/{slug}/{token}.webp?quality=medium.
// When a quality param is present we render a responsive <picture> across
// low/medium/high; any other image renders as a plain <img>.
const hasQuality = computed(() => /(^|[?&])quality=(low|medium|high)($|[&])/.test(props.src));

const base = computed(() => props.src.replace(/quality=[^&]*/, ""));

const srcset = computed(() =>
  `${base.value}quality=low 480w,
  ${base.value}quality=medium 768w,
  ${base.value}quality=high 1080w`.trim(),
);
</script>

<template>
  <picture v-if="hasQuality">
    <source type="image/webp" :srcset="srcset" />
    <img :src="src" :alt="alt" :class="class" :fetchpriority="index >= 1 ? 'low' : 'high'" :loading="index >= 1 ? 'lazy' : 'eager'" />
  </picture>

  <img v-else :src="src" :alt="alt" :class="class" crossorigin="anonymous" :fetchpriority="index >= 1 ? 'low' : 'high'" :loading="index >= 1 ? 'lazy' : 'eager'" />
</template>
