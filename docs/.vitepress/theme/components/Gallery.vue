<template>
  <div class="gallery pb-6 pt-4 container mx-auto px-4">
    <!-- 1. Card Full - Image with Overlay (YouTube style) -->
    <div v-if="block.type === 'card-full'" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      <div v-for="(item, i) in block.elements" :key="i" @click="handleClick(item)" class="relative h-64 rounded-lg overflow-hidden group cursor-pointer shadow-lg hover:shadow-xl transition-all">
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

    <!-- 2. Image Gallery (Pinterest/Instagram style) -->
    <div v-if="block.type === 'gallery'" :class="grid(block)">
      <div v-for="(item, i) in block.elements" :key="i" :class="{ 'md:col-span-2 md:row-span-2': i % 5 === 0 }">
        <div class="relative aspect-square rounded-lg overflow-hidden group cursor-pointer" @click="currentGalleryIdx = i">
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
      <PopupGallery :images="block.elements" :activeIndex="currentGalleryIdx" @close="currentGalleryIdx = null" @select="(i) => (currentGalleryIdx = i)"></PopupGallery>
    </div>

    <!-- 3. Book/Resource List -->
    <div v-if="block.type === 'resource-list'" class="space-y-4">
      <div v-for="(item, i) in block.elements" :key="i" @click="handleClick(item)" class="bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow p-4 flex gap-4 cursor-pointer">
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

    <!-- 4. Video Grid (YouTube Channel style) -->
    <div v-if="block.type === 'video-grid'" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      <div v-for="(item, i) in block.elements" :key="i" @click="handleClick(item)" class="group cursor-pointer">
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

    <!-- 5. Hero Banner (Featured content) -->
    <div v-if="block.type === 'hero-banner'" class="space-y-6">
      <div v-for="(item, i) in block.elements" :key="i" @click="handleClick(item)" class="relative h-96 rounded-2xl overflow-hidden shadow-2xl group cursor-pointer">
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

    <!-- 6. Portfolio Grid (Designer/Creative work) -->
    <div v-if="block.type === 'portfolio'" class="grid grid-cols-1 md:grid-cols-2 gap-8">
      <div v-for="(item, i) in block.elements" :key="i" @click="handleClick(item)" class="group cursor-pointer">
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

    <!-- 7. Product Cards (E-commerce style) -->
    <div v-if="block.type === 'product-cards'" class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
      <div v-for="(item, i) in block.elements" :key="i" @click="handleClick(item)" class="bg-white rounded-lg overflow-hidden shadow-md hover:shadow-xl transition-shadow group cursor-pointer">
        <div class="aspect-square bg-gray-100 overflow-hidden">
          <Image :index="block.index" :src="item.image" :alt="item.title" class="w-full h-full object-cover group-hover:scale-110 transition-transform" />
        </div>
        <div class="p-4">
          <h3 class="font-semibold text-gray-900 mb-1 line-clamp-1">{{ item.title }}</h3>
          <p class="text-sm text-gray-600 mb-3 line-clamp-2">{{ item.description }}</p>
          <button v-if="item.callToAction" class="w-full bg-accent text-white py-2 rounded-lg hover:opacity-90 transition-opacity text-sm font-medium">
            {{ item.callToAction }}
          </button>
        </div>
      </div>
    </div>

    <!-- 8. Article/Blog List -->
    <div v-if="block.type === 'article-list'" class="container mx-auto flex flex-wrap justify-center gap-6 mb-4 overflow-hidden">
      <a v-for="(item, i) in block.elements" :key="i" :href="item.link" class="w-full sm:w-1/2 md:w-1/4 flex flex-col gap-3 border-2 border-gray-200 hover:border-accent hover:bg-gray-50 p-3 rounded-md transition cursor-pointer group">
        <Image :index="block.index" :src="item.image" :alt="item.title" class="w-full h-40 object-cover rounded-md" />

        <h2 class="text-lg font-semibold text-gray-900 group-hover:text-accent transition-colors flex items-center gap-1">
          {{ item.title }}
          <span class="opacity-0 group-hover:opacity-100 transition">→</span>
        </h2>

        <p v-if="item.description" class="text-gray-600 text-sm leading-snug line-clamp-3">
          {{ item.description }}
        </p>
      </a>
    </div>

    <!-- 9. Team Members/People Cards -->
    <div v-if="block.type === 'team-cards'" :class="grid(block)">
      <a v-for="(item, i) in block.elements" :key="i" :href="item.link">
        <div class="relative mb-4 inline-block">
          <Image :index="block.index" :src="item.image" :alt="'team-cards ' + item.title" class="w-40 h-40 rounded-full object-cover border-4 border-accent shadow-lg group-hover:scale-105 transition-transform" />
        </div>
        <h3 class="text-xl font-bold text-gray-900 mb-1">{{ item.title }}</h3>
        <p class="text-sm text-gray-600 mb-4">{{ item.description }}</p>
        <button v-if="item.callToAction" class="text-accent hover:opacity-80 font-medium text-sm">
          {{ item.callToAction }}
        </button>
      </a>
    </div>

    <!-- 10. Compact List (News/Feed style) -->
    <div v-if="block.type === 'compact-list'" class="max-w-3xl mx-auto bg-white rounded-lg shadow-md divide-y">
      <div v-for="(item, i) in block.elements" :key="i" @click="handleClick(item)" class="p-4 flex gap-4 hover:bg-gray-50 transition-colors cursor-pointer">
        <Image :index="block.index" :src="item.image" :alt="item.title" class="w-20 h-20 object-cover rounded flex-shrink-0" />
        <div class="flex-1 min-w-0">
          <h3 class="font-semibold text-gray-900 mb-1 truncate">{{ item.title }}</h3>
          <p class="text-sm text-gray-600 line-clamp-2 mb-2">{{ item.description }}</p>
          <button v-if="item.callToAction" class="text-accent hover:opacity-80 text-xs font-medium">{{ item.callToAction }} →</button>
        </div>
      </div>
    </div>

    <!-- 11. HTML text -->
    <div v-if="block.type === 'text'" class="[&_img]:mx-auto [&_img]:w-2/3 [&_img]:sm:w-1/2">
      <div v-if="block.html" class="prose p-2 max-w-2xl mx-auto" v-html="block.html"></div>
    </div>

    <!-- 12. Vertical Timeline -->
    <div v-if="block.type === 'timeline'" class="max-w-3xl mx-auto">
      <div v-for="(item, i) in block.elements" :key="i" @click="handleClick(item)" class="relative pl-8 pb-12 last:pb-0 cursor-pointer">
        <div class="absolute left-0 top-0 w-4 h-4 bg-accent rounded-full border-4 border-white shadow"></div>
        <div v-if="i < block.elements.length - 1" class="absolute left-2 top-4 bottom-0 w-0.5 bg-gray-300 -translate-x-1/2"></div>
        <div class="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow">
          <div v-if="item.date" class="text-sm font-semibold text-accent mb-2">{{ item.date }}</div>
          <h3 class="text-xl font-bold text-gray-900 mb-2">{{ item.title }}</h3>
          <p class="text-gray-600 mb-4">{{ item.description }}</p>
          <Image :index="block.index" v-if="item.image" :src="item.image" :alt="item.title" class="w-full h-48 object-cover rounded-lg mb-3" />
          <button v-if="item.callToAction" class="text-accent hover:opacity-80 font-medium text-sm">{{ item.callToAction }} →</button>
        </div>
      </div>
    </div>

    <!-- 13. Calendar/Event Cards with Big Date -->
    <div v-if="block.type === 'calendar-cards'" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      <div v-for="(item, i) in block.elements" :key="i" @click="handleClick(item)" class="bg-white rounded-lg shadow-md hover:shadow-xl transition-all overflow-hidden group cursor-pointer">
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

    <!-- 14. Horizontal Carousel -->
    <div v-if="block.type === 'carousel'" class="relative">
      <div class="overflow-x-auto scrollbar-hide snap-x snap-mandatory">
        <div class="flex gap-6 pb-4">
          <div v-for="(item, i) in block.elements" :key="i" @click="handleClick(item)" class="flex-shrink-0 w-80 snap-start">
            <div class="bg-white rounded-lg shadow-lg overflow-hidden group cursor-pointer h-full">
              <div class="aspect-video bg-gray-200 overflow-hidden">
                <Image :index="block.index" :src="item.image" :alt="item.title" class="w-full h-full object-cover group-hover:scale-110 transition-transform" />
              </div>
              <div class="p-6">
                <h3 class="text-xl font-bold text-gray-900 mb-2">{{ item.title }}</h3>
                <p class="text-gray-600 mb-4 line-clamp-3">{{ item.description }}</p>
                <button v-if="item.callToAction" class="bg-accent text-white px-6 py-2 rounded-lg hover:opacity-90 transition-opacity font-medium">
                  {{ item.callToAction }}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { grid } from "./../../utils.js";
import Image from "./Image.vue";
import PopupGallery from "./PopupGallery.vue";
import { ref } from "vue";
import { useRouter } from "vitepress";

const currentGalleryIdx = ref(null);
const router = useRouter();

const props = defineProps({
  block: {
    type: Object,
    required: true,
  },
});

// Handle clicks with optional links — use SPA navigation to avoid full reloads
const handleClick = (item) => {
  if (item.link) {
    router.go(item.link);
  }
};
</script>

<style>
/* Line clamping utility */
.line-clamp-1 {
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.line-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.line-clamp-3 {
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* Hide scrollbar but keep functionality */
.scrollbar-hide::-webkit-scrollbar {
  display: none;
}

.scrollbar-hide {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
</style>
