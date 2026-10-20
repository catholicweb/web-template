<script setup>
// Card of the `carousel` type. Laid out as a horizontal strip by default (see TYPE_DEFAULTS in Gallery.vue).
import Image from "../Image.vue";
defineProps({ item: { type: Object, required: true }, index: { type: Number, default: 0 }, block: { type: Object, required: true } });
defineEmits(["open"]);
</script>

<template>
  <div class="text-left">
    <div @click="$emit('open')" class="bg-white rounded-lg shadow-lg overflow-hidden group cursor-pointer h-full">
      <div class="aspect-video bg-gray-200 overflow-hidden">
        <Image :index="block.index" :src="item.image" :alt="item.title" class="w-full h-full object-cover group-hover:scale-110 transition-transform" />
      </div>
      <div class="p-6">
        <h3 class="text-xl font-bold text-gray-900 mb-2">{{ item.title }}</h3>
        <p class="text-gray-600 mb-4 line-clamp-3">{{ item.description }}</p>
        <button v-if="item.callToAction" class="bg-accent text-white px-6 py-2 rounded-lg hover:opacity-90 transition-opacity font-medium">
          {{ item.callToAction }}
        </button>
      </div>
    </div>
  </div>
</template>
