<script setup>
// Large featured banner. Works well as a carousel (add the `carousel` option).
import Image from "../Image.vue";
defineProps({ item: { type: Object, required: true }, index: { type: Number, default: 0 }, block: { type: Object, required: true } });
defineEmits(["open"]);
</script>

<template>
  <div class="text-left">
    <div @click="$emit('open')" class="relative h-96 rounded-2xl overflow-hidden shadow-2xl group cursor-pointer">
      <Image :src="item.image" :alt="item.title" :index="block.index" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
      <div class="absolute inset-0 bg-gradient-to-r from-black/80 via-black/50 to-transparent">
        <div class="absolute inset-0 p-8 md:p-12 flex flex-col justify-center max-w-2xl">
          <h2 class="text-3xl md:text-5xl font-bold text-white mb-4">{{ item.title }}</h2>
          <p class="text-lg text-white/90 mb-6">{{ item.description }}</p>
          <button v-if="item.callToAction" class="bg-white text-gray-900 px-8 py-4 rounded-lg hover:bg-gray-100 transition-colors text-lg font-semibold self-start">
            {{ item.callToAction }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
