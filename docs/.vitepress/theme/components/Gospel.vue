<template>
	<div class="gospel max-w-md mx-auto py-4 mb-6 px-4">
		<template v-for="(reading, key) in readings.list" :key="key">
			<div v-if="block.images" class="relative w-full sm:w-1/2 mx-auto rounded-lg overflow-hidden my-4">
				<img :src="reading.image" loading="lazy" :alt="`${reading.title} icon`" class="w-full aspect-square object-cover" />

				<div class="absolute inset-0 w-full h-full p-4 bg-gradient-to-b from-black/60 via-black/10 text-white flex flex-col items-end text-center font-bold">
					<h2 class="text-xl text-white! text-center w-full">
						{{ reading.title }}<span class="">: {{ reading.cita }}</span>
					</h2>
					<p class="text-sm text-center w-full">{{ reading.resum }}</p>
				</div>
				<div class="absolute bottom-2 right-2 text-xs text-white">&copy; <a href="https://igles-ia.es/">Igles-IA.es</a></div>
			</div>
			<div v-else-if="readings.list.length > 1">
				<h2 class="text-lg text-center font-semibold mb-1 mt-6">{{ reading.title }} - {{ reading.cita }}</h2>
				<p class="text-sm mb-2 italic" style="color: #b30838">{{ reading.resum }}</p>
			</div>
			<div v-else class="flex justify-between items-center">
				<span class="text-sm mb-2 font-bold">{{ reading.cita }}</span>
				<span class="text-sm mb-2 italic" style="color: #b30838">{{ reading.resum }}</span>
			</div>
			<div class="prose max-w-none mb-2" v-html="reading.text"></div>
		</template>
	</div>
</template>

<script setup>
import { computed } from "vue";

const props = defineProps({ block: { type: Object, required: true } });
const readings = computed(() => props.block.gospel || props.block);
</script>

<style>
.gospel .prose p {
	margin-bottom: 0.5rem;
}
.gospel .prose strong {
	color: #b30838;
}
</style>
