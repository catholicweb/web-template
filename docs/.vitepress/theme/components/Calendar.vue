<script setup>
import { data } from "./../../blocks.data.js";
import { formatDate, slugify, grid } from "./../../utils.js";
import { useData } from "vitepress";
const props = defineProps({ block: { type: Object, required: true } });
const { localeIndex } = useData();

// Page-producing events carry a root `/<slug>/` link (set at build time).
// Prefix with the current locale key unless it's the root.
function eventHref(event) {
  if (!event?.link) return "";
  const idx = localeIndex.value;
  return !idx || idx === "root" || idx === "index" ? event.link : "/" + idx + event.link;
}

function getSubKeys(table) {
  const keys = new Set();
  for (const row in table) {
    for (const subKey in table[row]) keys.add(subKey);
  }
  return Array.from(keys);
}
</script>

<template>
  <div class="calendar" :class="grid(block)">
    <!-- Primer grupo dividir en headers -->
    <div v-for="(table, tableKey) in block.events" :class="tableKey" class="mb-6">
      <h3 :id="slugify(tableKey)" class="text-xl text-left text-gray-800 mb-3 border-b-3 border-accent pb-1">
        {{ formatDate(tableKey, $frontmatter.lang) }}
      </h3>
      <div class="overflow-x-auto bg-white">
        <table class="min-w-full border-collapse [border-style:hidden]">
          <!-- Añadir cabezera a la tabla (solo si hay subfields)-->
          <thead v-if="getSubKeys(table)[0] != ''" class="bg-gray-50 text-gray-600 uppercase tracking-wide">
            <tr>
              <th class="p-3 text-left">&nbsp;</th>
              <th v-for="subKey in getSubKeys(table)" class="p-3 text-left">
                {{ formatDate(subKey, $frontmatter.lang) }}
              </th>
            </tr>
          </thead>
          <tbody>
            <!-- Añadir columnas a la tabla -->
            <tr v-for="(row, rowKey, rowIndex) in table" class="odd:bg-white even:bg-gray-50">
              <td class="p-3 border-1">
                {{ formatDate(rowKey, $frontmatter.lang) }}
              </td>
              <!-- Añadir filas -->
              <td v-for="subKey in getSubKeys(table)" class="p-3 align-top border-1">
                <!-- Cada fila de la tabla puede tener múltiples elementos -->
                <p v-for="(line, lineKey) in row[subKey]" class="text-left pl-8 -indent-8">
                  <a
                    v-if="eventHref(line)"
                    :href="eventHref(line)"
                    class="text-accent font-medium hover:underline no-underline"
                  >
                    {{ line.title || formatDate(lineKey, $frontmatter.lang) }}
                  </a>
                  <template v-else>
                    {{ formatDate(lineKey, $frontmatter.lang) }}
                  </template>
                  <span class="extra italic text-sm">
                    {{
                      Object.keys(line)
                        .map((i) => formatDate(i, $frontmatter.lang))
                        .join(", ")
                    }}</span
                  >
                </p>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<style>
.calendar .extra:before {
  content: " - ";
}
.calendar .extra:after {
  content: "";
}
.calendar h1:empty,
.calendar h3:empty,
.calendar td:empty,
.calendar th:empty,
.calendar tr:empty,
.calendar i:empty,
.calendar span:empty {
  display: none !important;
}
</style>
