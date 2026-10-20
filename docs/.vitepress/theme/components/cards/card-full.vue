<script setup>
// Image with overlay (YouTube style)
import Image from "../Image.vue";
defineProps({ item: { type: Object, required: true }, index: { type: Number, default: 0 }, block: { type: Object, required: true } });
defineEmits(["open"]);
</script>

<template>
  <div class="text-left">
    <div @click="$emit('open')" class="relative h-64 rounded-lg overflow-hidden group cursor-pointer shadow-lg hover:shadow-xl transition-all">
      <Image :src="item.image" :alt="item.title" :index="block.index" class="w-full h-full object-cover" />
      <div class="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent">
        <div class="absolute bottom-0 left-0 right-0 p-6">
          <h3 class="text-xl font-bold text-white mb-2">{{ item.title }}</h3>
          <p class="text-white/90 text-sm mb-3">{{ item.description }}</p>
          <button v-if="item.callToAction" class="bg-white text-gray-900 px-4 py-2 rounded-lg hover:bg-gray-100 transition-colors text-sm font-semibold">
            {{ item.callToAction }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
