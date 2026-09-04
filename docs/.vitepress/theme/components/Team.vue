<script setup>
import Image from "./Image.vue";
defineProps({ block: { type: Object, required: true } });

import { ref } from "vue";
import { useData } from "vitepress";
const { theme } = useData();
const config = ref(theme.value.config || {});
const getPhone = (social) => social?.find((s) => /^\+?[\d\s().-]{6,}$/.test(s)) || "";
const getEmail = (social) => social?.find((s) => /\S+@\S+\.\S+/.test(s)) || "";
</script>

<template>
  <div class="w-full max-w-6xl mx-auto p-4 mb-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 font-bold">
    <div v-for="(collab, index) in config.info.collaborators" :key="index" class="flex items-center px-2 py-6 rounded-xl bg-[#1e252b] shadow-lg transition-transform">
      <div class="relative flex-shrink-0 w-1/3 md:w-1/2 rounded-full border-4 border-accent overflow-hidden aspect-square">
        <Image :index="block.index" :src="collab.image" :alt="'Foto de ' + collab.name" class="w-full h-full object-cover hover:scale-[1.05]" />
      </div>

      <div class="ml-6 flex flex-col items-start">
        <h3 class="text-2xl font-bold text-white mb-1">
          {{ collab.name }}
        </h3>

        <p class="text-gray-300 italic mb-2">
          {{ collab.description }}
        </p>

        <a v-if="collab.phonenumber" :href="`tel:+34${collab.phonenumber.replace(/\s/g, '')}`" class="inline-flex items-center justify-center px-3 py-2 bg-accent hover:bg-accent-700 text-white rounded-full text-xs transition-colors duration-200">
          <svg class="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
            <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
          </svg>
          <span>{{ collab.phonenumber }}</span>
        </a>
        <a v-if="getEmail(collab.social)" :href="`mailto:${getEmail(collab.social)}`" class="inline-flex items-center justify-center px-3 text-xs py-2 bg-accent hover:bg-accent-700 text-white rounded-full transition-colors duration-200">
          <svg class="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
            <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
            <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
          </svg>
          <span>{{ getEmail(collab.social) }}</span>
        </a>
      </div>
    </div>
  </div>
</template>
