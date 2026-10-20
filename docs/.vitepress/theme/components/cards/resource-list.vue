<script setup>
// Book / resource row: small cover on the left, text on the right
import Image from "../Image.vue";
defineProps({ item: { type: Object, required: true }, index: { type: Number, default: 0 }, block: { type: Object, required: true } });
defineEmits(["open"]);
</script>

<template>
  <div class="text-left">
    <div @click="$emit('open')" class="bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow p-4 flex gap-4 cursor-pointer">
      <Image :src="item.image" :alt="item.title" :index="block.index" class="w-24 h-32 object-cover rounded shadow-sm flex-shrink-0" />
      <div class="flex-1 flex flex-col">
        <h3 class="text-lg font-bold text-gray-900 mb-1">{{ item.title }}</h3>
        <p class="text-gray-600 text-sm mb-3 flex-1">{{ item.description }}</p>
        <button v-if="item.callToAction" class="bg-accent text-white px-4 py-2 rounded-lg hover:opacity-90 transition-opacity text-sm self-start">
          {{ item.callToAction }}
        </button>
      </div>
    </div>
  </div>
</template>
