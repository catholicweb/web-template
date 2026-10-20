<script setup>
// Link / people card (also used by the `links` section).
import Image from "../Image.vue";
defineProps({ item: { type: Object, required: true }, index: { type: Number, default: 0 }, block: { type: Object, required: true } });
defineEmits(["open"]);
</script>

<template>
  <a :href="item.link || item.src">
    <div class="relative mb-4 inline-block">
      <Image :index="block.index" :src="item.image" :alt="'team-cards ' + item.title" class="w-40 h-40 rounded-full object-cover border-4 border-accent shadow-lg group-hover:scale-105 transition-transform" />
    </div>
    <h3 class="text-xl font-bold text-gray-900 mb-1">{{ item.title }}</h3>
    <p class="text-sm text-gray-600 mb-4">{{ item.description }}</p>
    <button v-if="item.callToAction" class="text-accent hover:opacity-80 font-medium text-sm">
      {{ item.callToAction }}
    </button>
  </a>
</template>
