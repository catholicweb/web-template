<template>
  <div class="hero relative flex items-center justify-center min-h-[50vh] mb-2 text-white font-extrabold [text-shadow:_0_0_8px_rgba(0,0,0,1)]" :class="alignmentClass">
    <!-- Imagen -->
    <Image :index="block.index" :src="block.image" alt="" class="absolute inset-0 size-full object-cover" />
    <!-- Overlay -->
    <div class="absolute inset-0 [background:radial-gradient(closest-side,rgba(0,0,0,0.4)_0%,rgba(0,0,0,0)_100%)]"></div>

    <!-- Content -->
    <div class="relative z-10 px-4">
      <h1 v-if="block.title" class="mb-5 text-5xl">
        {{ block.title }}
      </h1>
      <p v-if="block.description" class="mb-5">
        {{ block.description }}
      </p>

      <div class="flex flex-wrap justify-center gap-4 [text-shadow:none]">
        <a v-for="(elem, idx) in block.elements" :key="idx" :href="elem.link" class="bg-accent text-white font-medium px-5 py-2 rounded-lg transition-colors">
          {{ elem.title }}
        </a>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from "vue";
import Image from "./Image.vue";
import { resolveNavTokens } from "./../../utils.js";

const props = defineProps({
  block: {
    type: Object,
    required: true,
  },
  navStyle: {
    type: Array,
    default: () => [],
  },
});

const alignmentClass = computed(() => {
  const t = resolveNavTokens(props.navStyle);
  return t.titleAlignment === "left" ? "text-left" : "text-center";
});
</script>
