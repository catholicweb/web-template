<script setup>
import { computed, onMounted, reactive, ref } from "vue";
import { formatDate, slugify, stripIndex, withDefaultTags } from "./../../utils.js";
import { useData, useRoute } from "vitepress";
import { toISODay, tableView } from "./../../calendar-view.js";
import { calendarLabels } from "./../../calendarLabels.js";
import Grid from "./Grid.vue";
const props = defineProps({ block: { type: Object, required: true } });
const { localeIndex, frontmatter } = useData();
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

// "Today" drives the highlighted lines, the faded week-of-the-month lines and the horizon.
// It starts as the day of the build (what the static HTML was rendered with, so hydration
// matches) and becomes the visitor's own day once the page is in the browser.
const today = ref(props.block.builtAt || toISODay(new Date()));
onMounted(() => {
  today.value = toISODay(new Date());
});

// Months after which lines are collapsed behind the "show more" button (0: show everything).
// Set by the build when the section's filter has the `withinHorizon` term.
const horizon = computed(() => Number(props.block.horizon) || 0);
const views = computed(() => Object.fromEntries(Object.entries(props.block.events || {}).map(([key, table]) => [key, tableView(table, today.value, horizon.value)])));
const labels = computed(() => calendarLabels(frontmatter.value?.lang));
// Tables whose far lines were revealed.
const expanded = reactive({});
const lineClass = (status) => ({ "is-today": status.today, "is-muted": status.muted });

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

// A line is the last grouping level: { "<extra info>": [{ link?, dates?, byweek? }, ...] }.
// groupEvents leaves a stub there for every event; the ones with their own page carry a
// `link`, so the link of the line is the first one found that is not this page.
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
        <!-- Collapsed with nothing left to show (every line is far away): only the title and the button stay -->
        <div v-show="views[item.key].visible || expanded[item.key]" class="overflow-x-auto bg-white">
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
              <!-- Añadir columnas a la tabla. Far rows stay in the page (hidden) until the table is expanded -->
              <tr
                v-for="row in views[item.key].rows"
                :key="row.key"
                v-show="expanded[item.key] || !row.far"
                :class="(expanded[item.key] ? row.index : row.stripe) % 2 ? 'bg-gray-50' : 'bg-white'"
              >
                <td class="p-3 border-1" :class="{ 'font-semibold': row.today }">
                  {{ formatDate(stripIndex(row.key), $frontmatter.lang) }}
                </td>
                <!-- Añadir filas -->
                <td v-for="subKey in getSubKeys(item.table)" class="p-3 align-top border-1">
                  <!-- Cada fila de la tabla puede tener múltiples elementos -->
                  <p
                    v-for="(line, lineKey) in item.table[row.key][subKey]"
                    :key="lineKey"
                    v-show="expanded[item.key] || !row.lines[subKey][lineKey].far"
                    :class="lineClass(row.lines[subKey][lineKey])"
                    :aria-current="row.lines[subKey][lineKey].today ? 'date' : undefined"
                    class="text-left pl-8 -indent-8"
                  >
                    <span v-if="row.lines[subKey][lineKey].today" class="sr-only">{{ labels.today }}: </span>
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
        <div v-if="views[item.key].hidden" class="text-right">
          <button type="button" class="calendar-more" :aria-expanded="!!expanded[item.key]" @click="expanded[item.key] = !expanded[item.key]">
            {{ expanded[item.key] ? labels.less : labels.more(views[item.key].hidden) }}
          </button>
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

/* Today: the lines that happen today are inverted. The shadow grows the box without moving the text. */
.calendar p.is-today {
  background: #000;
  color: #fff;
  border-radius: 0.2rem;
  box-shadow: 0 0 0 0.25rem #000;
}
/* Lines limited to certain weeks of the month that do not happen in the next 7 days. */
.calendar p.is-muted {
  color: #6b7280;
}

/* "Show more": a quiet text button under the table. */
.calendar .calendar-more {
  margin-top: 0.25rem;
  padding: 0.25rem 0;
  font-size: 0.8rem;
  color: #6b7280;
  background: none;
  border: 0;
  cursor: pointer;
  text-decoration: underline dotted;
  text-decoration-color: rgb(0 0 0 / 0.3);
  text-underline-offset: 3px;
}
.calendar .calendar-more:hover,
.calendar .calendar-more:focus-visible {
  color: #111827;
  text-decoration-style: solid;
}

/* Paper shows the whole calendar, without the screen-only markers. */
@media print {
  .calendar [style*="display:none"],
  .calendar [style*="display: none"] {
    display: revert !important;
  }
  .calendar .calendar-more {
    display: none;
  }
  .calendar p.is-today {
    background: none;
    color: inherit;
    box-shadow: none;
  }
  .calendar p.is-muted {
    color: inherit;
  }
}
</style>
