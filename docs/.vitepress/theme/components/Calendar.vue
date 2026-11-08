<script setup>
import { computed } from "vue";
import { formatDate, slugify, stripIndex, withDefaultTags } from "./../../utils.js";
import { useData, useRoute } from "vitepress";
import Grid from "./Grid.vue";
const props = defineProps({ block: { type: Object, required: true } });
const { localeIndex } = useData();
const route = useRoute();

// Every grouped table (one per event type, by default) is a Grid item, so the layout
// options (horizontal, carousel, sizes...) apply to the tables. `medium` is what the
// section always used.
const gridBlock = computed(() =>
  withDefaultTags(
    {
      ...props.block,
      elements: Object.entries(props.block.events || {}).map(([key, table]) => ({ key, table })),
    },
    ["medium"],
  ),
);

// Same page, whatever the way it is written: "/a/b", "/a/b/", "/a/b.html", "/a/b/index.html".
const normalizePath = (p) =>
  String(p || "")
    .split(/[?#]/)[0]
    .replace(/\.html$/, "")
    .replace(/\/index$/, "")
    .replace(/\/+$/, "") || "/";

// Links to the page being viewed are not useful: they are left out.
const isCurrentPage = (href) => normalizePath(href) === normalizePath(route.path);

// Page-producing events carry a root `/<slug>/` link (set at build time).
// Prefix with the current locale key unless it's the root.
function localizedHref(link) {
  if (!link) return "";
  const idx = localeIndex.value;
  return !idx || idx === "root" || idx === "index" ? link : "/" + idx + link;
}

// A line is the last grouping level: { "<extra info>": [{ link }, ...] }. groupEvents
// leaves a `{ link }` stub there for every event that has its own page (and nothing
// for the rest), so the link of the line is the first one found that is not this page.
function lineHref(line) {
  for (const stubs of Object.values(line || {})) {
    for (const stub of Array.isArray(stubs) ? stubs : []) {
      const href = localizedHref(stub?.link);
      if (href && !isCurrentPage(href)) return href;
    }
  }
  return "";
}

// Page of a place, when it has one. `block.placeLinks` (built per language by
// pageBuilder) already holds the final href, keyed by the place name.
function placeHref(name) {
  const href = props.block.placeLinks?.[name];
  return href && !isCurrentPage(href) ? href : "";
}

function getSubKeys(table) {
  const keys = new Set();
  for (const row in table) {
    for (const subKey in table[row]) keys.add(subKey);
  }
  return Array.from(keys);
}

// Keys can end in "#<n>" when an ordering level uses the opt-in `index` token (it keeps
// identical events apart, see accessMultikey in utils.js). Keys are looked up as they
// are, but every key is shown through stripIndex() so the suffix never reaches the page.

// Text shown for a line (the key of the 4th ordering level, e.g. the time).
function lineLabel(lineKey, lang) {
  return formatDate(stripIndex(lineKey), lang);
}

// Extra info of a line (the keys of the last ordering level, e.g. title / week / place / notes),
// each with the page of its place when it is one.
function lineExtras(line, lang) {
  return Object.keys(line)
    .map((key) => {
      const name = stripIndex(key);
      return { text: formatDate(name, lang), href: placeHref(name) };
    })
    .filter((part) => part.text);
}

function lineText(line, lineKey, lang) {
  return [lineLabel(lineKey, lang), ...lineExtras(line, lang).map((p) => p.text)].filter(Boolean).join(" ");
}
</script>

<template>
  <div class="calendar">
    <Grid :block="gridBlock" v-slot="{ item }">
      <!-- Primer grupo dividir en headers -->
      <div :class="stripIndex(item.key)" class="mb-6">
        <h3 :id="slugify(item.key)" class="text-xl text-left text-gray-800 mb-3 border-b-3 border-accent pb-1">
          {{ formatDate(stripIndex(item.key), $frontmatter.lang) }}
        </h3>
        <div class="overflow-x-auto bg-white">
          <table class="min-w-full border-collapse [border-style:hidden]">
            <!-- Añadir cabezera a la tabla (solo si hay subfields)-->
            <thead v-if="stripIndex(getSubKeys(item.table)[0]) != ''" class="bg-gray-50 text-gray-600 uppercase tracking-wide">
              <tr>
                <th class="p-3 text-left">&nbsp;</th>
                <th v-for="subKey in getSubKeys(item.table)" class="p-3 text-left">
                  {{ formatDate(stripIndex(subKey), $frontmatter.lang) }}
                </th>
              </tr>
            </thead>
            <tbody>
              <!-- Añadir columnas a la tabla -->
              <tr v-for="(row, rowKey, rowIndex) in item.table" class="odd:bg-white even:bg-gray-50">
                <td class="p-3 border-1">
                  {{ formatDate(stripIndex(rowKey), $frontmatter.lang) }}
                </td>
                <!-- Añadir filas -->
                <td v-for="subKey in getSubKeys(item.table)" class="p-3 align-top border-1">
                  <!-- Cada fila de la tabla puede tener múltiples elementos -->
                  <p v-for="(line, lineKey) in row[subKey]" class="text-left pl-8 -indent-8">
                    {{ lineLabel(lineKey, $frontmatter.lang) }}
                    <!-- The " - " separator only shows when there is both a label and extra info -->
                    <span
                      v-if="lineExtras(line, $frontmatter.lang).length"
                      class="extra italic"
                      :class="{ 'with-label': lineLabel(lineKey, $frontmatter.lang) }"
                      ><template v-for="(part, i) in lineExtras(line, $frontmatter.lang)" :key="i"
                        ><template v-if="i">, </template
                        ><a v-if="part.href" :href="part.href" class="place-link">{{ part.text }}</a
                        ><template v-else>{{ part.text }}</template></template
                      ></span
                    ><a
                      v-if="lineHref(line)"
                      :href="lineHref(line)"
                      :aria-label="lineText(line, lineKey, $frontmatter.lang)"
                      class="event-link"
                    ></a>
                  </p>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </Grid>
  </div>
</template>

<style>
.calendar .extra.with-label:before {
  content: " - ";
}
.calendar .extra:after {
  content: "";
}
.calendar h1:empty,
.calendar h3:empty,
.calendar tr:empty,
.calendar i:empty,
.calendar span:empty {
  display: none !important;
}
/* Empty header cells keep their space so the columns stay aligned with the body. */
.calendar th:empty {
  visibility: hidden;
}
/* Empty data cells show a dash instead of collapsing the column. */
.calendar td:empty::after {
  content: "-";
  color: #9ca3af;
}

/* Event page: the line stays normal text, followed by a faint link symbol. */
.calendar a.event-link {
  color: inherit !important;
  text-decoration: none !important;
  margin-left: 0.4em;
  font-size: 0.75em;
  font-style: normal;
  opacity: 0.4;
}
.calendar a.event-link::after {
  content: "\1F517";
  filter: grayscale(1);
}
.calendar a.event-link:hover,
.calendar a.event-link:focus-visible {
  opacity: 1;
}

/* Place page: the place name stays normal text, with a faint dotted underline. */
.calendar a.place-link {
  color: inherit !important;
  font-weight: inherit;
  text-decoration: underline dotted !important;
  text-decoration-color: rgb(0 0 0 / 0.3) !important;
  text-underline-offset: 3px;
}
.calendar a.place-link:hover,
.calendar a.place-link:focus-visible {
  text-decoration-style: solid !important;
}
</style>
