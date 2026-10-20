<script setup>
// Event card with a big date block on the left
import { computed } from "vue";
defineProps({ item: { type: Object, required: true }, index: { type: Number, default: 0 }, block: { type: Object, required: true } });
defineEmits(["open"]);
</script>

<template>
  <div class="text-left">
    <div @click="$emit('open')" class="bg-white rounded-lg shadow-md hover:shadow-xl transition-all overflow-hidden group cursor-pointer">
      <div class="flex">
        <div class="bg-accent text-white p-4 flex flex-col items-center justify-center min-w-[100px]">
          <div class="text-3xl font-bold">{{ item.day || "15" }}</div>
          <div class="text-sm uppercase tracking-wide">{{ item.month || "Jan" }}</div>
          <div v-if="item.year" class="text-xs opacity-80 mt-1">{{ item.year }}</div>
        </div>
        <div class="flex-1 p-4">
          <h3 class="font-bold text-gray-900 mb-2 group-hover:text-accent transition-colors">{{ item.title }}</h3>
          <p class="text-sm text-gray-600 mb-3 line-clamp-2">{{ item.description }}</p>
          <button v-if="item.callToAction" class="text-accent hover:opacity-80 text-sm font-medium">
            {{ item.callToAction }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
