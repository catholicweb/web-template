<script setup>
// Product card (e-commerce style)
import Image from "../Image.vue";
defineProps({ item: { type: Object, required: true }, index: { type: Number, default: 0 }, block: { type: Object, required: true } });
defineEmits(["open"]);
</script>

<template>
  <div class="text-left">
    <div @click="$emit('open')" class="bg-white rounded-lg overflow-hidden shadow-md hover:shadow-xl transition-shadow group cursor-pointer h-full">
      <div class="aspect-square bg-gray-100 overflow-hidden">
        <Image :index="block.index" :src="item.image" :alt="item.title" class="w-full h-full object-cover group-hover:scale-110 transition-transform" />
      </div>
      <div class="p-4">
        <h3 class="font-semibold text-gray-900 mb-1 line-clamp-1">{{ item.title }}</h3>
        <p class="text-sm text-gray-600 mb-3 line-clamp-2">{{ item.description }}</p>
        <button v-if="item.callToAction" class="w-full bg-accent text-white py-2 rounded-lg hover:opacity-90 transition-opacity text-sm font-medium">
          {{ item.callToAction }}
        </button>
      </div>
    </div>
  </div>
</template>
