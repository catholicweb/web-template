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
import { onMounted } from "vue";
import { generateThemeCSS } from "../themeBuilder.js";

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

const isDev = import.meta.env?.DEV ?? false;

onMounted(() => {
  if (typeof window === 'undefined') return;
  const handler = (event) => {
    // Security: editor origin always allowed; localhost only in dev mode
    const isLocalhost = event.origin.includes("localhost");
    if (event.origin !== "https://editor.parroquia.app" && !(isDev && isLocalhost)) return;
    if (!event.data || !event.data.theme) return;
    try {
      const css = generateThemeCSS(event.data.theme);
      // Replace existing theme/style.css link with generated inline style
      const existing = document.querySelector('link[href*="style.css"]');
      if (existing) existing.remove();
      let style = document.getElementById('theme-preview');
      if (!style) {
        style = document.createElement('style');
        style.id = 'theme-preview';
        document.head.appendChild(style);
      }
      style.textContent = css;
    } catch (e) {
      // Fail silently so a bad message doesn't break the site
      console.error('Theme preview message error:', e);
    }
  };
  window.addEventListener('message', handler);
});
</script>
