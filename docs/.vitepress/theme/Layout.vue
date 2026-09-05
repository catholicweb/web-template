<!-- .vitepress/theme/Layout.vue -->
<template>
  <div class="min-h-screen flex flex-col max-w-screen clip-x">
    <!-- Navbar Component -->
    <component :is="components.Navbar" />

    <!-- Main Content - Block System -->
    <main class="flex-1 flex flex-wrap" v-if="sections">
      <template v-for="(section, index) in sections" :key="section.title ? slugify(section.title) : index">
        <section :class="getSectionClasses(section.tags)" v-if="!section.tags?.includes('hidden')">
          <div v-if="section.title && section._block != 'hero'" class="text-center mt-12 mb-4 container mx-auto">
            <h2 :id="slugify(section.title)" class="text-3xl font-bold">{{ section.title }}</h2>
          </div>
          <component :is="getBlockComponent(section._block)" :block="section" />
        </section>
      </template>
    </main>

    <!-- 404 Fallback -->
    <NotFound v-else-if="page.isNotFound" class="flex-1" />

    <!-- Footer Component -->
    <component :is="components.Footer" />

    <!-- PWA Component -->
    <ClientOnly><component :is="components.PWA" /></ClientOnly>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from "vue";
import { useData } from "vitepress";
import components from "./components";
import { slugify, getSectionClasses } from "./../utils.js";
import NotFound from "./components/NotFound.vue";
import { generateThemeCSS } from "../themeBuilder.js";

const { page, frontmatter } = useData();

// Prefers live preview over static frontmatter
const previewSections = ref(null);
const sections = computed(() => {
  return previewSections.value || frontmatter.value.sections || null;
});

function getBlockComponent(block = "gallery") {
  const name = block.split("-")[0].replace(/(^\w)/g, (s) => s.toUpperCase());
  return components[name] || components["Gallery"];
}

const isDev = import.meta.env?.DEV ?? false;

onMounted(() => {
  if (typeof window === 'undefined') return;
  const handler = (event) => {
    const isLocalhost = event.origin.includes("localhost");
    if (event.origin !== "https://editor.parroquia.app" && !(isDev && isLocalhost)) return;
    if (!event.data) return;

    try {
      if (event.data.theme) {
        const css = generateThemeCSS(event.data.theme);
        const existing = document.querySelector('link[href*="style.css"]');
        if (existing) existing.remove();
        let style = document.getElementById('theme-preview');
        if (!style) {
          style = document.createElement('style');
          style.id = 'theme-preview';
          document.head.appendChild(style);
        }
        style.textContent = css;
      
      } else if (event.data.pages) {
        // TODO: here we should call autocomplete+postcomplete in order to populate the page
        previewSections.value = event.data.pages.sections;
      }
    } catch (e) {
      console.error('Preview failed:', e);
    }
  };

  window.addEventListener('message', handler);
});
</script>