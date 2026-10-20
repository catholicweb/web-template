<template>
  <div class="gallery pb-6 pt-4 container mx-auto px-4">
    <!--
      Every card type renders through Grid, so the layout options (carousel, 3d,
      masonry, horizontal, sizes, filters...) work for all of them. The card markup
      lives in ./cards/<type>.vue; TYPE_DEFAULTS keeps each type's classic layout
      unless the user picked another one.
    -->
    <Grid v-if="CARDS[block.type]" :block="gridBlock" v-slot="{ item, index }">
      <component :is="CARDS[block.type]" :item="item" :index="index" :block="block" @open="onOpen(item)" />
    </Grid>

    <!-- Lightbox shared by every layout of the image gallery -->
    <PopupGallery v-if="block.type === 'gallery'" :images="block.elements" :activeIndex="currentGalleryIdx" @close="currentGalleryIdx = null" @select="(i) => (currentGalleryIdx = i)"></PopupGallery>

    <!-- The layout IS the design for the three types below, so they stay as they were -->

    <!-- HTML text -->
    <div v-if="block.type === 'text'" class="[&_img]:mx-auto [&_img]:w-2/3 [&_img]:sm:w-1/2">
      <div v-if="block.html" class="prose p-2 max-w-2xl mx-auto" v-html="block.html"></div>
    </div>

    <!-- Compact List (News/Feed style): one card with dividers -->
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

    <!-- Vertical Timeline -->
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
  </div>
</template>

<script setup>
import { computed, ref } from "vue";
import { useRouter } from "vitepress";
import { withDefaultTags } from "./../../utils.js";
import Grid from "./Grid.vue";
import Image from "./Image.vue";
import PopupGallery from "./PopupGallery.vue";

// One card component per block.type, picked up automatically: cards/<type>.vue
const modules = import.meta.glob("./cards/*.vue", { eager: true });
const CARDS = Object.fromEntries(Object.entries(modules).map(([path, mod]) => [path.split("/").pop().replace(".vue", ""), mod.default]));

// Classic layout of each card type. These are only DEFAULTS: when the user picks a
// layout or size tag of the same group, theirs wins (see defaultTags in utils.js).
// `gallery` and `team-cards` get theirs from pageBuilder.js.
const TYPE_DEFAULTS = {
  "card-full": ["wide"],
  "video-grid": ["wide"],
  portfolio: ["wide"],
  "calendar-cards": ["wide"],
  "product-cards": ["small"],
  "article-list": ["medium"],
  "resource-list": ["xl"],
  "hero-banner": ["xl"],
  carousel: ["horizontal", "medium"],
};

const props = defineProps({
  block: {
    type: Object,
    required: true,
  },
});

const gridBlock = computed(() => withDefaultTags(props.block, TYPE_DEFAULTS[props.block.type] || []));

const currentGalleryIdx = ref(null);
const router = useRouter();

// Handle clicks with optional links — use SPA navigation to avoid full reloads
const handleClick = (item) => {
  if (item.link) {
    router.go(item.link);
  }
};

// Image galleries open the lightbox; every other card follows its link.
const onOpen = (item) => {
  if (props.block.type === "gallery") {
    const idx = (props.block.elements || []).indexOf(item);
    if (idx >= 0) currentGalleryIdx.value = idx;
  } else {
    handleClick(item);
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

<style>
.masonry-grid > *:nth-child(5n) {
  grid-column: span 2 / span 2;
  grid-row: span 2 / span 2;
}
@media (min-width: 768px) {
  .masonry-grid > *:nth-child(5n) {
    grid-column: span 2 / span 2;
    grid-row: span 2 / span 2;
  }
}
</style>
