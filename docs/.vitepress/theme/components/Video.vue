<template>
  <Grid :block="props.block" v-slot="{ item, index }">
    <LazyItem :key="item.src" :alwaysVisible="index < 5">
      <div class="relative">
        <div v-if="playingVideo === item.src" class="w-full h-full items-center rounded-lg overflow-hidden cursor-pointer aspect-[16/9]">
          <div v-if="isAudio(item.src)" class="w-full text-center flex flex-col items-center justify-center h-full bg-black">
            <img :src="item.image" :alt="`Thumbnail for ${item.title}`" :fetchpriority="block.index >= 1 ? 'low' : 'high'" :loading="block.index >= 1 ? 'lazy' : 'eager'" @error.once="$event.target.crossOrigin = 'anonymous'; $event.target.src = item.image" class="absolute inset-0 w-full h-full object-cover rounded-lg opacity-20" />
            <h3 class="text-2xl font-bold text-white mb-4 w-full px-4">{{ item.title }}</h3>

            <audio controls autoplay class="w-full h-10 px-2">
              <source :src="item.src" type="audio/mpeg" />
            </audio>
          </div>

          <iframe v-else :src="item.src" data-testid="embed-iframe" width="100%" frameBorder="0" allowfullscreen="" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" class="w-full h-full rounded-lg overflow-hidden"></iframe>
        </div>

        <div v-else @click="playingVideo = item.src" class="w-full h-full relative facade rounded-lg overflow-hidden cursor-pointer aspect-[16/9]">
          <img :src="item.image" :alt="`Thumbnail for ${item.title}`" :fetchpriority="block.index >= 1 ? 'low' : 'high'" :loading="block.index >= 1 ? 'lazy' : 'eager'" @error.once="$event.target.crossOrigin = 'anonymous'; $event.target.src = item.image" class="absolute inset-0 w-full h-full object-cover rounded-lg" />

          <div class="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 text-center to-transparent flex items-end">
            <h3 class="text-lg font-bold text-white mb-2 w-full px-4">{{ item.title }}</h3>
          </div>

          <div class="absolute inset-0 flex items-center justify-center logo" :class="logo(item)"></div>
        </div>
      </div>

      <div v-if="item.publishedAt && !block.filters?.length" class="pt-2 text-center w-full text-black">
        {{ formatDate(item.publishedAt, $frontmatter.lang) }}
        <div class="w-[14px] h-[14px] mx-auto rounded-full bg-accent"></div>
        <div class="h-[4px] -mt-[8px] bg-accent -mx-[8px]"></div>
      </div>
    </LazyItem>
  </Grid>
</template>

<script setup>
import { ref, watch } from "vue";
import LazyItem from "./LazyItem.vue";
import Grid from "./Grid.vue";
import { formatDate } from "./../../utils.js";
const props = defineProps({ block: { type: Object, required: true } });

const isAudio = (url) => {
  if (!url) return false;
  return url.toLowerCase().includes(".mp3");
};

function logo(item) {
  if (item.src.includes("youtube")) return "youtube-logo";
  if (item.src.includes("spotify")) return "spotify-logo";
  if (item.src.includes("vimeo")) return "vimeo-logo";
  if (item.src.includes(".mp3")) return "audio-logo";
  return "generic-logo";
}

const playingVideo = ref(null);

// Cloudflare Web Analytics has no custom-event API (GoatCounter's
// count({event:true}) is gone), but it records SPA navigations by overriding
// history.pushState. Emulate the event by briefly pushing a synthetic
// `/reproducir/...` route the beacon logs as a page, then restoring the real
// URL — replaceState is not intercepted, so the URL bar and history length
// end unchanged (single-tick, no repaint in between).
watch(playingVideo, (src) => {
  if (!src) return;
  try {
    const item = props.block.elements?.find((i) => i.src === src);
    const real = window.location.pathname + window.location.search;
    const slug = (item?.title || src)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40);
    const fake = `/reproducir/${slug || "video"}`;
    history.pushState(history.state, "", fake);
    history.replaceState(history.state, "", real);
  } catch (e) {
    // Tracking is best-effort — never let a beacon hiccup break the video UI.
  }
});
</script>

<style>
.facade:hover .logo {
  transform: scale(1.1);
}

.facade .logo {
  background-size: 18%;
  background-position: center;
  background-repeat: no-repeat;
  transition: transform 0.3s;
}
/* YouTube logo overlay centrado */
.youtube-logo {
  background-image: url("data:image/svg+xml,%3Csvg width='159' height='110' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='m154 17.5c-1.82-6.73-7.07-12-13.8-13.8-9.04-3.49-96.6-5.2-122 0.1-6.73 1.82-12 7.07-13.8 13.8-4.08 17.9-4.39 56.6 0.1 74.9 1.82 6.73 7.07 12 13.8 13.8 17.9 4.12 103 4.7 122 0 6.73-1.82 12-7.07 13.8-13.8 4.35-19.5 4.66-55.8-0.1-75z' fill='%23f00'/%3E%3Cpath d='m105 55-40.8-23.4v46.8z' fill='%23fff'/%3E%3C/svg%3E%0A");
}

.generic-logo {
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='white' d='M8 5v14l11-7z'/%3E%3C/svg%3E");
}

.spotify-logo {
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 168 168'%3E%3Ccircle cx='84' cy='84' r='84' fill='black'/%3E%3Cpath d='M83.7 0C37.5 0 0 37.5 0 83.7c0 46.3 37.5 83.7 83.7 83.7 46.3 0 83.7-37.5 83.7-83.7S130 0 83.7 0zM122 120.8c-1.4 2.5-4.6 3.2-7 1.7-19.8-12-44.5-14.7-73.7-8-2.8.5-5.6-1.2-6.2-4-.2-2.8 1.5-5.6 4-6.2 32-7.3 59.6-4.2 81.6 9.3 2.6 1.5 3.4 4.7 1.8 7.2zM132.5 98c-2 3-6 4-9 2.2-22.5-14-56.8-18-83.4-9.8-3.2 1-7-1-8-4.3s1-7 4.6-8c30.4-9 68.2-4.5 94 11 3 2 4 6 2 9zm1-23.8c-27-16-71.6-17.5-97.4-9.7-4 1.3-8.2-1-9.5-5.2-1.3-4 1-8.5 5.2-9.8 29.6-9 78.8-7.2 109.8 11.2 3.7 2.2 5 7 2.7 10.7-2 3.8-7 5-10.6 2.8z' fill='%2392d500'/%3E%3C/svg%3E");
}

.vimeo-logo {
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 168 168'%3E%3Cpath d='M0 48.3c0-1.6 0.4-2.7 1.2-3.5s1.9-1.2 3.4-1.2h13.2c1.6 0 2.7 0.4 3.4 1.2 0.8 0.8 1.2 1.9 1.2 3.5v71.5c0 1.6-0.4 2.7-1.2 3.5-0.8 0.8-1.9 1.2-3.4 1.2H4.6c-1.6 0-2.7-0.4-3.4-1.2-0.8-0.8-1.2-1.9-1.2-3.5V48.3zM39.7 48.3h16.4c1.6 0 2.7 0.4 3.4 1.2 0.8 0.8 1.2 1.9 1.2 3.5v71.5c0 1.6-0.4 2.7-1.2 3.5-0.8 0.8-1.9 1.2-3.4 1.2H39.7c-1.6 0-2.7-0.4-3.4-1.2-0.8-0.8-1.2-1.9-1.2-3.5V48.3zM72.4 57.2h16.3c1.6 0 2.7 0.4 3.4 1.2 0.8 0.8 1.2 1.9 1.2 3.5v9.3c0 1.6-0.4 2.7-1.2 3.5-0.8 0.8-1.9 1.2-3.4 1.2H72.4c-1.6 0-2.7-0.4-3.4-1.2-0.8-0.8-1.2-1.9-1.2-3.5v-9.3c0-1.6 0.4-2.7 1.2-3.5 0.8-0.8 1.9-1.2 3.4-1.2zM72.4 72.3h16.3v-5.8H72.4v5.8zM118.2 48.3h16.4c1.6 0 2.7 0.4 3.4 1.2 0.8 0.8 1.2 1.9 1.2 3.5v71.5c0 1.6-0.4 2.7-1.2 3.5-0.8 0.8-1.9 1.2-3.4 1.2h-16.4c-1.6 0-2.7-0.4-3.4-1.2-0.8-0.8-1.2-1.9-1.2-3.5V48.3z' fill='%23fff'/%3E%3C/svg%3E");
}

.audio-logo {
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='white' d='M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z'/%3E%3C/svg%3E");
}

.hidescrollbar::-webkit-scrollbar {
  display: none;
}
</style>
