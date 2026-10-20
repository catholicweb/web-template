<script setup>
// Video thumbnail with title (YouTube channel style)
import Image from "../Image.vue";
defineProps({ item: { type: Object, required: true }, index: { type: Number, default: 0 }, block: { type: Object, required: true } });
defineEmits(["open"]);
</script>

<template>
  <div class="text-left">
    <div @click="$emit('open')" class="group cursor-pointer">
      <div class="relative aspect-video rounded-lg overflow-hidden mb-3 bg-gray-200 facade youtube">
        <Image :src="item.image" :alt="item.title" :index="block.index" class="w-full h-full object-cover group-hover:scale-105 transition-transform" />
      </div>
      <h3 class="font-semibold text-gray-900 mb-1">{{ item.title }}</h3>
      <p class="text-sm text-gray-600 mb-2">{{ item.description }}</p>
      <button v-if="item.callToAction" class="text-accent hover:opacity-80 text-sm font-medium">
        {{ item.callToAction }}
      </button>
    </div>
  </div>
</template>
