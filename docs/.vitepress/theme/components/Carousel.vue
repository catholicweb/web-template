<script setup>
import { ref, onMounted, onUnmounted } from "vue";
import Image from "./Image.vue";

let props = defineProps({
  block: {
    type: Object,
    required: true,
  },
  interval: { type: Number, default: 4000 }, // ms between slides
});

let current = ref(0);
let timer = null;

onMounted(() => {
  timer = setInterval(() => {
    current.value = (current.value + 1) % props.block.elements.length;
  }, props.interval);
});

onUnmounted(() => clearInterval(timer));
</script>

<template>
  <div class="carousel w-full text-center">
    <div class="relative mx-auto container px-8 h-[10vh]">
      <div v-for="(item, i) in block.elements" :key="i" class="absolute inset-0 w-full transition-all duration-2000 ease-in-out" :class="{ 'opacity-100': current === i, 'opacity-0': current !== i }">
        <Image :src="item.image" class="w-full object-cover aspect-16/9" alt="" />
        <div class="bg-black/50 opacity-75 text-white p-4 w-full">
          <h3 class="text-lg font-semibold">{{ item.title }}</h3>
          <p class="text-sm">{{ item.description }}</p>
        </div>
      </div>
    </div>
    <!-- Controls -->
    <div class="absolute flex justify-center w-full gap-2 bottom-2">
      <button v-for="(item, i) in block.elements" :key="'dot-' + i" class="btn btn-xs btn-circle" :class="{ 'btn-primary': current === i }" @click="current = i"></button>
    </div>
  </div>
</template>
