<script setup>
import { ref, watch } from "vue";
import Image from "./Image.vue";
import Grid from "./Grid.vue";
import { data } from "./../../blocks.data.js";
import { useData } from "vitepress";
const { page } = useData();

const props = defineProps({ block: { type: Object, required: true } });

// Must be reactive (`ref`) so switching language re-renders the grid — a plain
// `let` reassigned in the watch below would not trigger a re-render.
const allItems = ref(data.pages.filter((f) => f.lang === page.value.frontmatter.lang));

watch(
  () => page.value.frontmatter.lang,
  (lang) => {
    allItems.value = data.pages.filter((f) => f.lang === lang);
  },
);
</script>

<template>
  <Grid :block="{ ...props.block, elements: allItems, query: true, tags: ['small'] }" v-slot="{ item, index }">
    <div>
      <a :key="item.url" :href="item.url" class="group flex flex-col overflow-hidden rounded-xl bg-[#2d3436] transition-transform">
        <div class="aspect-square overflow-hidden bg-gray-200">
          <Image :src="item.image" :alt="'Cover image for ' + item.title" :index="block.index" class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
        </div>
        <div class="p-4 text-center">
          <h3 class="text-white font-bold capitalize text-lg m-0">
            {{ item.title }}
          </h3>
        </div>
      </a>
    </div>
  </Grid>
</template>
