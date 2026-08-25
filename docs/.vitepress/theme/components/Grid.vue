<script setup>
/*
	Grid system allowing:
	+ carousel
	+ 3d carousel
	+ horizontal scroll
	+ vertical scroll
	+ different grid sizes (using flex)
*/

import { ref, computed, onMounted, onUnmounted } from "vue";
import { grid } from "./../../utils.js";
const props = defineProps({ block: { type: Object, required: true } });

// --- Filters ---
const searchQuery = ref("");
const selectedFilter = ref(0);
const filteredItems = computed(() => {
	const needle = selectedFilter.value === 0 ? props.block.filters : [props.block.filters?.[selectedFilter.value]];
	return (props.block.elements || []).filter((item) => {
		const haystack = JSON.stringify(item).toLowerCase();
		const matchesfilter = !props.block.filters || searchQuery.value || needle?.some((word) => haystack.includes(word?.toLowerCase()));
		const matchesSearch = !searchQuery.value || haystack.includes(searchQuery.value.toLowerCase());
		return matchesfilter && matchesSearch;
	});
});

// --- Swipe handlers ---
// findIndex returns -1 when no item matches the block name; `-1` is truthy so the
// old `|| 0` guard let activeIndex start at -1 (only corrected to 0 on mount).
// Clamp explicitly instead.
const initialIndex = filteredItems.value.findIndex((item) => item.name === props.block.name);
const activeIndex = ref(initialIndex < 0 ? 0 : initialIndex);

let startX = 0;
const onStart = (e) => {
	stopSlider();
	startX = e.touches ? e.touches[0].clientX : e.clientX;
};

const onEnd = (e) => {
	const endX = e.changedTouches ? e.changedTouches[0].clientX : e.touches ? e.touches[0].clientX : e.clientX;
	// Sensitivity threshold of 50px
	if (startX - endX > 50) nextItem();
	if (startX - endX < -50) prevItem();
	startSlider();
};

const nextItem = () => {
	if (activeIndex.value < filteredItems.value.length - 1) activeIndex.value++;
};

const prevItem = () => {
	if (activeIndex.value > 0) activeIndex.value--;
};

// --- Autoplay ---
const startSlider = () => {
	if (!props.block.tags?.includes("carousel")) return;
	if (filteredItems.value.length <= 1) return;
	timer = setInterval(() => {
		activeIndex.value = (activeIndex.value + 1) % filteredItems.value.length;
	}, 5000);
};
let timer = null;
const stopSlider = () => {
	if (timer) clearInterval(timer);
};
onMounted(() => {
	activeIndex.value = 0;
	startSlider();
});
onUnmounted(stopSlider);

// 3D Carousel
const getCardClass = (index) => {
	const diff = index - activeIndex.value;

	if (diff === 0) return "card-active";
	if (diff === 1) return "card-next-1";
	if (diff === -1) return "card-prev-1";
	if (diff === 2) return "card-next-2";
	if (diff === -2) return "card-prev-2";

	return diff > 0 ? "card-hidden-right" : "card-hidden-left";
};

// 1. Curated pattern (prevents long streaks of tall/wide cards)
const TILE_PATTERN = {
  1: '[&>*>*]:!aspect-square',  // 1 = Square
  2: '[&>*>*]:!aspect-[16/9]',  // 2 = Wide
  3: '[&>*>*]:!aspect-[9/16]'   // 3 = Tall
};

// A rhythmically balanced sequence of 20 items (1, 2, 3)
const BALANCED_SEQUENCE = [ 1, 2, 3, 1, 3, 2, 1, 1, 3, 2, 3, 1, 2, 3, 1, 2, 2, 1, 3, 2];

// 2. Random starting point generated ONCE per load
const randomOffset = Math.floor(Math.random() * BALANCED_SEQUENCE.length);

// 3. Pure lookup function
const randomTileClass = (index) => {
  const patternValue = BALANCED_SEQUENCE[(index) % 20];
  return TILE_PATTERN[patternValue];
};

function vtr(key, lang) {
	const code = lang.split(":").toReversed()[0];
	const dict = {
		buscar: { eu: "Bilatu", es: "Buscar", ca: "Cercar", en: "Search", fr: "Rechercher", de: "Suchen", it: "Cercare", pt: "Buscar", ro: "Căuta", ar: "بحث", bg: "търсене" },
		resultados: { eu: "emaitzak", es: "resultados", ca: "resultats", en: "results", fr: "résultats", de: "ergebnisse", it: "risultati", pt: "resultados", ro: "rezultate" },
	};
	return dict[key]?.[code] || dict[key] || key;
}
</script>
<template>
	<div v-if="block.filters" class="max-w-4xl mx-auto px-3 flex flex-wrap justify-center gap-0 my-4">
		<button
			v-for="(filter, index) in block.filters"
			:key="index"
			@click="
				searchQuery = '';
				selectedFilter = index;
			"
			class="px-3 py-2 rounded-full transition-colors duration-200 text-sm cursor-pointer font-bold"
			:class="[selectedFilter === index ? 'bg-[#2d3436] text-white' : 'bg-transparent text-gray-700 hover:bg-gray-200']"
		>
			{{ filter }}
		</button>
	</div>

	<div v-if="block.query" class="relative max-w-md px-8 mx-auto mb-4">
		<span class="absolute inset-y-0 left-12 flex items-center text-gray-500">
			<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
			</svg>
		</span>
		<input v-model="searchQuery" type="text" :placeholder="vtr('buscar', $frontmatter.lang)" class="w-full pl-12 pr-4 py-3 border border-gray-200 rounded-full focus:outline-none focus:ring-2 focus:ring-gray-200 transition-all shadow-sm placeholder-gray-500" />
		<span class="absolute inset-y-0 right-12 flex items-center text-gray-500">
			<span>{{ filteredItems.length }} {{ vtr("resultados", $frontmatter.lang) }}</span>
		</span>
	</div>

	<template v-if="block?.tags?.includes('carousel')">
		<div class="overflow-hidden relative max-w-xl" @touchstart.passive="onStart" @touchend.passive="onEnd" @mousedown.passive="onStart" @mouseup.passive="onEnd">
			<div class="flex transition-transform duration-500 ease-out" :style="{ transform: `translateX(-${activeIndex * 100}%)` }">
				<div v-for="(item, index) in filteredItems" :key="index" class="min-w-full px-2">
					<slot :item="item" :index="index"></slot>
				</div>
			</div>
		</div>
		<div class="flex gap-2 mt-4 ml-4">
			<button v-for="(_, index) in filteredItems" :key="index" @click="activeIndex = index" :aria-label="'Go to item ' + index" class="w-4 h-4 rounded-full transition-colors" :class="activeIndex === index ? 'bg-accent' : 'bg-gray-500'" />
		</div>
	</template>

	<template v-else-if="block?.tags?.includes('3d')">
		<!-- 3D Carousel Container -->
		<div class="flex flex-col items-center justify-center px-4 overflow-hidden">
			<div class="perspective-1000 relative w-full max-w-4xl h-[400px] flex items-center justify-center">
				<!-- Cards -->
				<div class="relative w-full" @touchstart.passive="onStart" @touchend.passive="onEnd" @mousedown.passive="onStart" @mouseup.passive="onEnd">
					<div v-for="(item, index) in filteredItems" :key="index" class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 transition-all duration-700 ease-out cursor-pointer" :class="getCardClass(index)" @click="activeIndex = index">
						<slot :item="item" :index="index" :activeIndex="activeIndex"></slot>
					</div>
				</div>
			</div>
			<div>
				<!-- Navigation Arrows -->
				<button v-if="filteredItems.length > 1" @click="prevItem" :disabled="activeIndex === 0" aria-label="Previous item" :class="['absolute left-4 top-1/2 -translate-y-1/2 z-25 w-14 h-14 rounded-full bg-black/30 backdrop-blur-md text-white flex items-center justify-center transition-all duration-200 hover:bg-black/50 hover:scale-110 cursor-pointer hidden md:flex', activeIndex === 0 ? 'opacity-30 cursor-not-allowed' : 'opacity-100']">
					<svg class="w-6 h-6" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
						<polyline points="15 18 9 12 15 6" />
					</svg>
				</button>

				<button v-if="filteredItems.length > 1" @click="nextItem" aria-label="Next item" :disabled="activeIndex === filteredItems.length - 1" :class="['absolute right-4 top-1/2 -translate-y-1/2 z-25 w-14 h-14 rounded-full bg-black/30 backdrop-blur-md text-white flex items-center justify-center transition-all duration-200 hover:bg-black/50 hover:scale-110 cursor-pointer hidden md:flex', activeIndex === filteredItems.length - 1 ? 'opacity-30 cursor-not-allowed' : 'opacity-100']">
					<svg class="w-6 h-6" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
						<polyline points="9 18 15 12 9 6" />
					</svg>
				</button>
			</div>
			<div class="flex gap-2 mt-4 ml-4">
				<button v-for="(_, index) in filteredItems" :key="index" @click="activeIndex = index" :aria-label="'Go to item ' + index" class="w-4 h-4 rounded-full transition-colors" :class="activeIndex === index ? 'bg-accent' : 'bg-gray-500'" />
			</div>
		</div>
	</template>

	<template v-else-if="block?.tags?.includes('masonry')">
		<div :class="grid(block)">
			<div v-for="(item, index) in filteredItems" :key="index" :class="randomTileClass(index)">
				<slot :item="item" :index="index"></slot>
			</div>
		</div>
	</template>
	<template v-else>
		<div :class="grid(block)">
			<template v-for="(item, index) in filteredItems">
				<slot :item="item" :index="index"></slot>
			</template>
		</div>
	</template>
</template>

<style>
/* Base card state */
.card-active,
.card-prev-1,
.card-next-1,
.card-prev-2,
.card-next-2,
.card-hidden-left,
.card-hidden-right {
	position: absolute;
	will-change: transform, opacity;
}

.card-active {
	transform: translateX(0%) scale(1) translateZ(0);
	opacity: 1;
	z-index: 15;
	filter: grayscale(0%);
}

.card-prev-1 {
	transform: translateX(-35%) scale(0.85) translateZ(-100px);
	opacity: 0.6;
	z-index: 10;
	filter: grayscale(80%);
}

.card-next-1 {
	transform: translateX(35%) scale(0.85) translateZ(-100px);
	opacity: 0.6;
	z-index: 10;
	filter: grayscale(80%);
}

.card-prev-2 {
	transform: translateX(-60%) scale(0.7) translateZ(-200px);
	opacity: 0.3;
	z-index: 5;
	filter: grayscale(100%);
}

.card-next-2 {
	transform: translateX(60%) scale(0.7) translateZ(-200px);
	opacity: 0.3;
	z-index: 5;
	filter: grayscale(100%);
}

.card-hidden-left {
	transform: translateX(-80%) scale(0.6) translateZ(-300px);
	opacity: 0;
	z-index: 0;
}

.card-hidden-right {
	transform: translateX(80%) scale(0.6) translateZ(-300px);
	opacity: 0;
	z-index: 0;
}
</style>
