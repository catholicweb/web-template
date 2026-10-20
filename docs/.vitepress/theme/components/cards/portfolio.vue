<script setup>
// Portfolio tile (designer / creative work)
import Image from "../Image.vue";
defineProps({ item: { type: Object, required: true }, index: { type: Number, default: 0 }, block: { type: Object, required: true } });
defineEmits(["open"]);
</script>

<template>
  <div class="text-left">
    <div @click="$emit('open')" class="group cursor-pointer">
      <div class="relative aspect-[4/3] rounded-lg overflow-hidden mb-4 bg-gray-100">
        <Image :index="block.index" :src="item.image" :alt="item.title" class="w-full h-full object-cover transition-all group-hover:scale-105 group-hover:brightness-75" />
      </div>
      <h3 class="text-2xl font-bold text-gray-900 mb-2">{{ item.title }}</h3>
      <p class="text-gray-600 mb-4">{{ item.description }}</p>
      <button v-if="item.callToAction" class="text-accent hover:opacity-80 font-semibold flex items-center gap-2">
        {{ item.callToAction }}
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
        </svg>
      </button>
    </div>
  </div>
</template>
