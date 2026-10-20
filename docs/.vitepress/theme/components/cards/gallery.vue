<script setup>
// Image gallery tile (Pinterest/Instagram style). Click opens the lightbox.
import Image from "../Image.vue";
defineProps({ item: { type: Object, required: true }, index: { type: Number, default: 0 }, block: { type: Object, required: true } });
defineEmits(["open"]);
</script>

<template>
  <div>
    <div class="relative aspect-[4/3] rounded-lg overflow-hidden group cursor-pointer" @click="$emit('open')">
      <Image :src="item.image" :alt="item.title" :index="block.index" class="w-full h-full object-cover transition-transform group-hover:scale-110" />
      <div class="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all">
        <div class="absolute inset-0 p-4 flex flex-col justify-end opacity-0 group-hover:opacity-100 transition-opacity">
          <h3 class="text-white font-bold text-lg mb-1">{{ item.title }}</h3>
          <button v-if="item.callToAction" class="text-white text-sm underline text-left">
            {{ item.callToAction }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
