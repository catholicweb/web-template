<!-- .vitepress/theme/Layout.vue -->
<template>
  <div class="min-h-screen flex flex-col max-w-screen clip-x">
    <!-- Navbar Component -->
    <component :is="components.Navbar" />

    <!-- Main Content - Block System -->
    <main class="flex-1 flex flex-wrap" v-if="$frontmatter.sections">
      <template v-for="(section, index) in $frontmatter.sections">
        <section :class="getSectionClasses(section.tags)" v-if="!section.tags?.includes('hidden')">
          <div v-if="section.title && section._block != 'hero'" class="text-center mt-12 mb-4 container mx-auto">
            <h2 :id="slugify(section.title)" class="text-4xl font-bold">{{ section.title }}</h2>
          </div>
          <component :key="slugify(section.title)" :is="getBlockComponent(section._block)" :block="section" />
        </section>
      </template>
    </main>

    <!-- 404 Fallback — renders the Good Shepherd 404 content on any broken URL
         (not just /404.html). VitePress sets page.isNotFound when the router fails
         to match a route; without this branch the custom Layout would show an
         empty main area. -->
    <NotFound v-else-if="page.isNotFound" class="flex-1" />

    <!-- Footer Component -->
    <component :is="components.Footer" />

    <!-- PWA Component (client-only: uses navigator/serviceWorker) -->
    <ClientOnly><component :is="components.PWA" /></ClientOnly>
  </div>
</template>

<script setup>
import components from "./components";
import { slugify, getSectionClasses } from "./../utils.js";
import { useData } from "vitepress";
import NotFound from "./components/NotFound.vue";

const { page } = useData();

// Get the component matching the block type.
// only the first hyphen-segment of the `_block` name is used
// eg: "video-gospel"/"video-channel" -> "Video"
// default to Gallery
function getBlockComponent(block = "gallery") {
  // e.g. "hero" → "Hero"
  const name = block.split("-")[0].replace(/(^\w)/g, (s) => s.toUpperCase());
  return components[name] || components["Gallery"];
}
</script>
