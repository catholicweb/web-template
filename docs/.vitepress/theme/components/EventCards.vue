<script setup>
import { formatDate, formatWeekdays, slugify } from "./../../utils.js";
import { useData } from "vitepress";
import Image from "./Image.vue";
import Grid from "./Grid.vue";

const props = defineProps({ block: { type: Object, required: true } });
const { localeIndex } = useData();

// Page-producing events carry a root-language `/<slug>/` link (set at build time in
// createFiles.js). Non-root languages live at `/<code>/<slug>/`, so prefix with the
// current locale key unless it's the root ("root"/"index").
function eventHref(event) {
  if (!event?.link) return "";
  const idx = localeIndex.value;
  return !idx || idx === "root" || idx === "index" ? event.link : "/" + idx + event.link;
}
</script>

<template>
  <!-- Default data-focused card -->
  <div v-if="!props.block.tags?.includes('visualCards')" class="relative z-10 py-10 font-medium">
    <div class="container mx-auto px-4 min-h-30">
      <Grid :block="{ ...props.block, elements: block.events, query: props.block.tags?.includes('visualCards') }" v-slot="{ item: event, index }">  
        <div class="bg-black/50 backdrop-blur-xl p-6 rounded-xl text-white overflow-hidden block">
          <h2 class="text-3xl font-bold mb-4 leading-tight" :id="slugify(event.name || event.title)">
            {{ event.name || event.title || formatDate(event.type, $frontmatter.lang) }}
          </h2>

          <Image v-if="event.images?.[0]" :src="event.images[0]" :index="index" class="float-right w-32 h-32 md:w-40 md:h-40 rounded-full border-4 border-accent object-cover ml-4 mb-2" />

          <div class="space-y-2 text-sm">
            <p class="location-mark" v-if="event.locations.join()" >{{ event.locations.join(", ") }}</p>
            <p class="calendar-mark" v-if="[...formatWeekdays(event.byday), ...event.byweek, ...event.dates].filter(Boolean).join()">
              {{
                [...formatWeekdays(event.byday), ...event.byweek, ...event.dates]
                  .filter(Boolean)
                  .map((i) => formatDate(i, $frontmatter.lang))
                  .join(", ")
              }}
            </p>
            <p class="time-mark" v-if="event.times.join()">{{ event.times.join(", ") }}</p>
          </div>

          <p v-if="event.notes" class="mt-4 italic clear-none">
            {{ event.notes?.map((i) => formatDate(i, $frontmatter.lang)).join(", ") }}
          </p>

          <a
            v-if="eventHref(event)"
            :href="eventHref(event)"
            class="mt-5 inline-block bg-accent text-white px-5 py-2 rounded-lg font-semibold transition hover:opacity-90 no-underline"
          >
            Más información →
          </a>
        </div>
      </Grid>
    </div>
  </div>


  <!-- Visual cards: large image, title under, meta only if present -->
  <div v-else class="mx-auto px-0">
      <Grid :block="{ ...props.block, elements: block.events, query: props.block.tags?.includes('visualCards') }" v-slot="{ item: event, index }">  
        <a :href="eventHref(event)" class="bg-[#2d3436] rounded-xl text-white overflow-hidden block flex flex-col no-underline transition hover:opacity-90">
            <div class="relative">
              <Image v-if="event.images?.[0]" :src="event.images[0]" :alt="'Group image for ' + event.title" :index="index" class="w-full h-64 md:h-80 object-cover" />
            </div>
            <div class="p-6 flex flex-col gap-3">
              <h2 class="text-xl md:text-2xl font-bold leading-tight" :id="slugify(event.name || event.title)">
                {{ event.name || event.title || formatDate(event.type, $frontmatter.lang) }}
              </h2>
              <div v-if="event.locations?.length || event.dates?.length || event.byday?.length || event.byweek?.length || event.times?.length" class="flex flex-wrap gap-3 text-xs md:text-sm opacity-90">
                <span v-if="event.locations?.length && event.locations[0] != ''" class="location-mark">{{ event.locations.join(", ") }}</span>
                <span v-if="[...formatWeekdays(event.byday), ...event.byweek, ...event.dates].filter(Boolean).length" class="calendar-mark">{{ [...formatWeekdays(event.byday), ...event.byweek, ...event.dates].filter(Boolean).map((i) => formatDate(i, $frontmatter.lang)).join(", ") }}</span>
                <span v-if="event.times?.length" class="time-mark">{{ event.times.join(", ") }}</span>
              </div>
            </div>
        </a>
      </Grid>
  </div>
</template>

<style scoped>
/* Clearfix just in case notes are very short and we want to ensure container height */
.block::after {
  content: "";
  display: table;
  clear: both;
}

.location-mark::before,
.time-mark::before,
.calendar-mark::before {
  content: "";
  display: inline-block;
  width: 1em;
  height: 1em;
  margin-right: 0.5em;
  vertical-align: middle;
  background-size: contain;
  background-repeat: no-repeat;
}

.location-mark::before {
  background-image: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5S10.62 6.5 12 6.5s2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>');
}

.time-mark::before {
  background-image: url('data:image/svg+xml;utf8,<svg width="50" height="50" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"  xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="10"/><line x1="12" y1="6" x2="12" y2="12"/><line x1="12" y1="12" x2="16" y2="14"/></svg>');
}

.calendar-mark::before {
  background-image: url('data:image/svg+xml;utf8,<svg width="50" height="50" viewBox="0 0 24 24" fill="none" stroke="white"  stroke-width="2" stroke-linecap="round" stroke-linejoin="round"  xmlns="http://www.w3.org/2000/svg"><rect x="3" y="4" width="18" height="16" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>');
}
</style>
