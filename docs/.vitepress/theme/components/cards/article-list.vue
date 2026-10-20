<script setup>
// Article / blog card, the whole card is a link
import Image from "../Image.vue";
defineProps({ item: { type: Object, required: true }, index: { type: Number, default: 0 }, block: { type: Object, required: true } });
defineEmits(["open"]);
</script>

<template>
  <div class="text-left">
    <a :href="item.link" class="h-full flex flex-col gap-3 border-2 border-gray-200 hover:border-accent hover:bg-gray-50 p-3 rounded-md transition cursor-pointer group">
      <Image :index="block.index" :src="item.image" :alt="item.title" class="w-full h-40 object-cover rounded-md" />

      <h2 class="text-lg font-semibold text-gray-900 group-hover:text-accent transition-colors flex items-center gap-1">
        {{ item.title }}
        <span class="opacity-0 group-hover:opacity-100 transition">→</span>
      </h2>

      <p v-if="item.description" class="text-gray-600 text-sm leading-snug line-clamp-3">
        {{ item.description }}
      </p>
    </a>
  </div>
</template>
