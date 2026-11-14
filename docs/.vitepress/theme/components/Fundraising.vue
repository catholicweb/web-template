<script setup>
import { ref, computed } from "vue";
import Grid from "./Grid.vue";
import Image from "./Image.vue";
import { withDefaultTags } from "./../../utils.js";
import { data } from "./../../blocks.data.js";
import { donationMethods } from "./../../fundraising.js";
import { fundraisingLabels } from "./../../fundraisingLabels.js";
import { useData } from "vitepress";
const { theme, page } = useData();
const config = computed(() => theme.value.config || {});
const props = defineProps({ block: { type: Object, required: true } });

const lang = computed(() => page.value.frontmatter.lang);
const labels = computed(() => fundraisingLabels(lang.value));
// "Write {code} as the reference" -> the text around the code, so the code can be styled.
const refParts = computed(() => labels.value.reference.split("{code}"));

// Ways to donate: the same list the footer prints (Bizum / bank accounts / links), config.info.bank.
const methods = computed(() => donationMethods(config.value.info?.bank));

// Which card has its donation options open (per card, so it also works in grid /
// carousel layouts where there is no "active" card).
const donateIndex = ref(null);
// Which value was just copied ("<card>-<method>"), to flash "Copied".
const copied = ref(null);

const cards = computed(() => data.fundraisings.filter((f) => f.lang === lang.value));

// 3d is only the default: any layout / size tag the user picked wins.
const gridBlock = computed(() => withDefaultTags({ ...props.block, elements: cards.value, query: false }, ["3d"]));

const money = (n) => {
  try {
    return new Intl.NumberFormat(String(lang.value ?? "es").split(":").pop(), { maximumFractionDigits: 0 }).format(n) + "€";
  } catch {
    return n + "€";
  }
};

// "Bizum", "Transferencia · BBVA", "Donar online", or the authored title for anything else.
const caption = (m) => {
  if (m.kind === "other") return m.title;
  const base = labels.value[m.kind === "link" ? "online" : m.kind];
  return m.kind !== "link" && m.title && m.title.toLowerCase() !== base.toLowerCase() ? `${base} · ${m.title}` : base;
};

async function copy(text, key) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Older browsers / insecure context: copy through a throwaway textarea.
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand("copy");
    } catch {}
    ta.remove();
  }
  copied.value = key;
  setTimeout(() => {
    if (copied.value === key) copied.value = null;
  }, 1500);
}
</script>

<template>
  <div class="fundraising container relative max-w-3xl mx-auto p-6 my-6">
    <Grid :block="gridBlock" v-slot="{ item: card, index }">
      <div class="w-full max-w-md bg-white rounded-2xl shadow-lg overflow-hidden">
        <!-- Image Section -->
        <div class="relative aspect-16/9 overflow-hidden">
          <div class="absolute inset-0 flex items-center justify-center">
            <Image :src="card.image" :index="index" :alt="card.title" class="w-full h-full object-cover" />
          </div>
        </div>

        <!-- Content Section -->
        <div class="p-3">
          <h2 class="text-2xl font-bold text-slate-900 mb-1">{{ card.name }}</h2>
          <p class="text-slate-600 mb-4">{{ card.description }}</p>

          <!-- Progress Stats -->
          <div class="mb-4" v-if="card.goal || card.segments?.length">
            <div class="flex justify-between items-baseline mb-2">
              <span class="text-lg font-bold">{{ money(card.raised) }}</span>
              <span v-if="card.goal" class="text-slate-500 text-sm">{{ labels.of }} {{ money(card.goal) }}</span>
            </div>

            <!-- Progress Bar: one coloured segment per source of funding -->
            <div v-if="card.segments?.length" class="flex gap-px w-full h-3 bg-slate-200 rounded-full overflow-hidden" role="img" :aria-label="card.goal ? `${card.progress}% ${labels.funded}` : money(card.raised)">
              <div v-for="(seg, si) in card.segments" :key="si" class="h-full transition-all duration-500 ease-out" :style="{ width: `${seg.width}%`, background: seg.color }" :title="`${seg.other ? labels.other : seg.title}: ${money(seg.amount)}`"></div>
            </div>
            <!-- Single bar when the raised amount is not split by source -->
            <div v-else class="w-full h-3 bg-slate-200 rounded-full overflow-hidden">
              <div class="h-full bg-gradient-to-r from-gray-200 to-accent rounded-full transition-all duration-500 ease-out" :style="{ width: `${Math.min(card.progress, 100)}%` }"></div>
            </div>

            <!-- Legend -->
            <ul v-if="card.segments?.length" class="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-slate-600">
              <li v-for="(seg, si) in card.segments" :key="si" class="flex items-center gap-1.5">
                <span class="inline-block w-2.5 h-2.5 rounded-full" :style="{ background: seg.color }"></span>
                <span>{{ seg.other ? labels.other : seg.title }}</span>
                <span class="font-semibold text-slate-800">{{ money(seg.amount) }}</span>
              </li>
            </ul>

            <div v-if="card.goal" class="text-sm text-slate-600 mt-2">{{ card.progress }}% {{ labels.funded }}</div>
          </div>

          <!-- Donate -->
          <button v-if="methods.length" @click.stop="donateIndex = donateIndex === index ? null : index" :aria-expanded="donateIndex === index" class="w-full bg-accent text-white font-semibold py-3 px-6 rounded-xl hover:shadow-lg hover:scale-101 transition-all duration-200 cursor-pointer">
            {{ donateIndex === index ? labels.close : card.action || labels.donate }}
          </button>

          <div v-if="donateIndex === index" class="mt-3 space-y-3">
            <!-- Short code that tells the parish which campaign the money is for -->
            <p v-if="card.code" class="text-sm text-slate-700">
              {{ refParts[0] }}<code class="px-1.5 py-0.5 rounded bg-accent-50 text-accent-800 font-semibold">{{ card.code }}</code>{{ refParts[1] }}
            </p>

            <ul class="space-y-2">
              <li v-for="(m, mi) in methods" :key="m.i" class="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2">
                <div class="min-w-0">
                  <div class="text-xs uppercase tracking-wide text-slate-500">{{ caption(m) }}</div>
                  <div v-if="m.kind !== 'link'" class="font-semibold text-slate-900 break-all select-all">{{ m.account }}</div>
                </div>
                <a v-if="m.kind === 'link'" :href="m.account" target="_blank" rel="noopener noreferrer" class="shrink-0 bg-accent text-white text-sm font-semibold py-2 px-4 rounded-lg">{{ labels.online }}</a>
                <button v-else @click.stop="copy(m.copy, `${index}-${mi}`)" class="shrink-0 text-sm font-semibold text-accent border border-accent rounded-lg py-1.5 px-3 cursor-pointer">
                  {{ copied === `${index}-${mi}` ? labels.copied : labels.copy }}
                </button>
              </li>
            </ul>

            <!-- Extra information (tax deductions, certificates...), collapsed by default -->
            <details v-if="card.notes" class="text-sm text-slate-600">
              <summary class="cursor-pointer list-none text-accent font-medium">{{ labels.moreInfo }} ▾</summary>
              <p class="mt-2 whitespace-pre-line">{{ card.notes }}</p>
            </details>
          </div>
        </div>
      </div>
    </Grid>
  </div>
</template>
