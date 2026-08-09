<script setup>
import { onMounted, onUnmounted } from "vue";
import Image from "./Image.vue";

const props = defineProps({
  images: { type: Array, required: true },
  activeIndex: { type: Number, default: null }, // The "input" that opens the modal
});

const emit = defineEmits(["close", "select"]);

const closeModal = () => emit("close");
const selectImage = (index) => emit("select", index);

const handleKeydown = (e) => {
  if (props.activeIndex === null) return;
  if (e.key === "Escape") closeModal();
  if (e.key === "ArrowRight") selectImage((props.activeIndex + 1) % props.images.length);
  if (e.key === "ArrowLeft") selectImage((props.activeIndex - 1 + props.images.length) % props.images.length);
};

onMounted(() => window.addEventListener("keydown", handleKeydown));
onUnmounted(() => window.removeEventListener("keydown", handleKeydown));
</script>

<template>
  <div v-if="activeIndex !== null" class="fixed inset-0 z-[9999] min-w-screen h-screen flex flex-col items-center justify-center bg-black/90 p-4" @click.self="closeModal">
    <button @click="closeModal" class="absolute top-5 right-10 text-white text-4xl hover:opacity-70">&times;</button>

    <div class="flex-1 flex items-center justify-center w-full">
      <Image :src="images[activeIndex].image" :alt="images[activeIndex].alt" class="max-h-[75vh] max-w-full rounded shadow-2xl object-contain" />
    </div>

    <div class="h-20 w-full flex items-center justify-center gap-2 mt-4">
      <div v-for="(img, index) in images" :key="index" @click="selectImage(index)" class="h-14 w-14 cursor-pointer rounded border-2 transition-all overflow-hidden" :class="activeIndex === index ? 'border-white scale-110' : 'border-transparent opacity-40'">
        <img :src="img.image" class="w-full h-full object-cover" />
      </div>
    </div>
  </div>
</template>
