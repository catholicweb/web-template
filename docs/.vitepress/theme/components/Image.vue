<script setup>
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
  <img :src="src" :alt="alt" :class="class" crossorigin="anonymous" :fetchpriority="index >= 1 ? 'low' : 'high'" :loading="index >= 1 ? 'lazy' : 'eager'" />
</template>