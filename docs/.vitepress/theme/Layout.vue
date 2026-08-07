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

    <!-- Footer Component -->
    <component :is="components.Footer" />

    <!-- PWA Component (client-only: uses navigator/serviceWorker) -->
    <ClientOnly><component :is="components.PWA" /></ClientOnly>
  </div>
</template>

<script setup>
import components from "./components";
import { slugify } from "./../utils.js";

function getSectionClasses(tags = []) {
  const classes = [];

  if (tags.includes("dark")) {
    classes.push("[&_*]:text-white", "bg-[#222831]", "pt-4");
  }

  if (tags.includes("twocols")) {
    classes.push("w-full", "md:w-1/2", "flex-none", "align-top", "px-4", "mx-auto");
  } else {
    classes.push("block", "w-full");
  }

  return classes;
}

// Get the component matching the block type.
// NOTE (known limitation — see SANITY.md): only the first hyphen-segment of the
// `_block` name is used, so multi-word blocks like "scrolly-telling" resolve to
// "Scrolly" (not "ScrollyTelling") and fall through to Gallery. Unknown or
// misspelled `_block` values also silently fall back to Gallery (blank section,
// no console warning). "video-gospel"/"video-channel" -> "Video" and
// "gallery-feature" -> "Gallery" work by coincidence of the first segment.
function getBlockComponent(block = "gallery") {
  // e.g. "hero" → "Hero"
  const name = block.split("-")[0].replace(/(^\w)/g, (s) => s.toUpperCase());
  return components[name] || components["Gallery"];
}
</script>
