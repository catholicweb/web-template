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
import { useData, withBase } from "vitepress";
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

// ---- Live page preview -------------------------------------------------------
// The editor posts a raw page ({ sections, ... }) and, optionally, its unsaved
// `config` and a `lang`. We run the SAME transforms as the build (pageBuilder.js:
// autocomplete + finalize) so what you preview matches what gets generated.
// Everything is imported dynamically so regular visitors never download it.

// Data the build normally gets from disk. Fetched once from the published site.
let staticsPromise = null;
function loadStatics() {
  return (staticsPromise ??= (async () => {
    const get = (file, fallback) =>
      fetch(withBase("/" + file))
        .then((r) => (r.ok ? r.json() : fallback))
        .catch(() => fallback);
    const [config, calendar, videos, instagram, dictionary] = await Promise.all([
      get("config.json", {}),
      get("calendar.json", []),
      get("videos.json", []),
      get("instagram.json", []),
      get("dictionary.json", {}),
    ]);
    return { config, calendar, videos, instagram, dictionary };
  })());
}

// With an editor-supplied config we recompute native events from it (unsaved
// event edits show up). ICS-imported events only exist in the published
// calendar.json, so they are omitted in that case.
async function buildPreviewContext(editorConfig) {
  const [statics, { createContext }, calendarCore] = await Promise.all([
    loadStatics(),
    import("../pageBuilder.js"),
    import("../calendar-core.js"),
  ]);
  const config = editorConfig ?? statics.config;
  const calendar = editorConfig
    ? calendarCore.sortEvents(calendarCore.buildEvents(editorConfig))
    : statics.calendar;
  return createContext({
    config,
    calendar,
    videos: statics.videos,
    instagram: statics.instagram,
    dictionary: statics.dictionary,
  });
}

let previewSeq = 0; // drop results of superseded (slow) previews

async function previewPage(message) {
  const my = ++previewSeq;
  const page = message.pages;
  try {
    const [ctx, pb] = await Promise.all([buildPreviewContext(message.config), import("../pageBuilder.js")]);
    const langs = ctx.NAMING.TARGET_LANGS;
    const lang = langs.find((l) => l === message.lang || l.split(":")[1] === message.lang) ?? langs[0];

    const data = pb.prepare(page);
    await pb.autocomplete(data, ctx.pages, ctx);
    const out = await pb.finalize(data, lang, ctx);
    if (my === previewSeq) previewSections.value = out.sections;
  } catch (e) {
    // Never leave the preview blank: fall back to the raw sections.
    console.error("Preview processing failed, showing raw sections:", e);
    if (my === previewSeq) previewSections.value = page.sections;
  }
}

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
        previewPage(event.data);
      }
    } catch (e) {
      console.error('Preview failed:', e);
    }
  };

  window.addEventListener('message', handler);
});
</script>
