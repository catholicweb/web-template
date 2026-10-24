<template>
	<div class="gospel max-w-md mx-auto py-4 mb-6 px-4">
		<!-- Day navigation -->
		<nav class="flex items-center justify-between gap-2 mb-2" :aria-label="t.nav">
			<button type="button" class="gospel-nav-btn" :disabled="loading" :aria-label="t.prev" @click="go(-1)">
				<svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12.5 4 6.5 10l6 6" /></svg>
			</button>

			<div class="text-center leading-tight min-w-0">
				<div class="text-sm font-semibold">{{ dateLabel }}</div>
				<div v-if="dayTitle" class="text-xs opacity-70 truncate">{{ dayTitle }}</div>
				<button v-if="!isToday" type="button" class="text-xs underline mt-1" style="color: #b30838" :disabled="loading" @click="loadDate(today)">
					{{ t.today }}
				</button>
			</div>

			<button type="button" class="gospel-nav-btn" :disabled="loading" :aria-label="t.next" @click="go(1)">
				<svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m7.5 4 6 6-6 6" /></svg>
			</button>
		</nav>

		<div :class="{ 'opacity-50 transition-opacity': loading }">
			<template v-for="(reading, key) in readings.list" :key="`${viewDate}-${key}`">
				<div v-if="block.images" class="relative w-full sm:w-1/2 mx-auto rounded-lg overflow-hidden my-4">
					<img :src="reading.image" loading="lazy" :alt="`${reading.title} icon`" class="w-full aspect-square object-cover" />

					<!-- Watermark (Top Right) -->
					<div class="absolute top-2 right-2 z-10 text-[9px] text-white/80 hover:text-white">
						&copy; <a href="https://igles-ia.es/" target="_blank" rel="noopener">Igles-IA.es</a>
					</div>

					<!-- Content Overlay (Aligned to Bottom) -->
					<div class="absolute inset-0 w-full h-full p-4 bg-gradient-to-t from-black/80 via-black/30 to-transparent text-white flex flex-col justify-end text-center font-bold">
						<h3 class="text-xl text-white text-center w-full">
							<span>{{ reading.cita }}</span>
						</h3>
						<p class="text-sm text-center w-full mt-1">{{ reading.resum }}</p>
					</div>
				</div>
				<div v-else-if="readings.list.length > 1">
					<h2 class="text-lg text-center font-semibold mb-1 mt-6">{{ reading.title }} - {{ reading.cita }}</h2>
					<p class="text-sm mb-2 italic" style="color: #b30838">{{ reading.resum }}</p>
				</div>
				<div v-else class="flex flex-wrap justify-between items-baseline gap-x-4 gap-y-0.5 mb-3">
					<span class="text-sm font-bold">{{ reading.cita }}</span>
					<span class="text-sm italic" style="color: #b30838">{{ reading.resum }}</span>
				</div>
				<div class="prose max-w-none mb-2" v-html="reading.text"></div>
			</template>
		</div>
	</div>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import { useData } from "vitepress";
// Adjust these paths to wherever the files live in your project
import { getBibleReadings } from "./../../gospel.js";
import { formatDate, getCode } from "./../../utils.js";

const props = defineProps({ block: { type: Object, required: true } });

// ---------------------------------------------------------------------------
// Data: preloaded block first, replaced by fetched data once the user navigates
// (or once we detect the preloaded data is stale).
// ---------------------------------------------------------------------------
const fetched = ref(null);
const readings = computed(() => fetched.value || props.block.gospel || props.block);

// ---------------------------------------------------------------------------
// Language
// ---------------------------------------------------------------------------
const { frontmatter: fm } = useData();

// Bare code ("es", "eu", "en"...) for getBibleReadings and the UI labels
const langCode = computed(() => getCode(fm.value.lang) || "es");
// If the preloaded data only had the gospel, keep fetching only the gospel.
const gospelOnly = computed(() => {
	const list = (props.block.gospel || props.block).list || [];
	return props.block.gospelOnly ?? (list.length > 0 && list.every((r) => r.tag === "evangeli"));
});

// ---------------------------------------------------------------------------
// Date helpers. Dates are handled as "YYYY-MM-DD" strings. Fetch dates are
// built at 12:00 UTC so getBibleReadings' toISOString() always yields the
// intended calendar day, whatever the local timezone is.
// ---------------------------------------------------------------------------
const pad = (n) => String(n).padStart(2, "0");
const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; // local day
const toNoonUTC = (s) => {
	const [y, m, d] = s.split("-").map(Number);
	return new Date(Date.UTC(y, m - 1, d, 12));
};
const shiftDate = (s, days) => {
	const d = toNoonUTC(s);
	d.setUTCDate(d.getUTCDate() + days);
	return d.toISOString().slice(0, 10);
};

// Works out which day a block of readings belongs to. Uses an explicit `date`
// field if present, otherwise reads it from the image URL
// (".../reading-images/2025-01-31/evangeli.png").
const detectDate = (data) => {
	if (data?.date) return String(data.date).slice(0, 10);
	for (const r of data?.list || []) {
		const m = r.image?.match(/reading-images\/(\d{4}-\d{2}-\d{2})\//);
		if (m) return m[1];
	}
	return null;
};

const today = ref(toISO(new Date()));
const viewDate = ref(detectDate(readings.value) || today.value);
const isToday = computed(() => viewDate.value === today.value);
const loading = ref(false);

// Date with weekday in the page language: "Martes 20 octubre" (es),
// "Tuesday 20 October" (en), "Asteartea, urriak 20" (eu). See formatDate.
const dateLabel = computed(() => formatDate(viewDate.value, fm.value.lang, { weekday: true }));

// Subtitle: the weekday is already in the date label, so hide titles that only
// say "<weekday> of week N of <season>" (ordinary time, Advent, Lent, Easter...)
// and "Sunday N of <season>". Feasts, memorials and special days ("Santos Simón
// y Judas, apóstoles (F)", "Domingo de Ramos", "Jueves Santo"...) stay.
const ROUTINE_DAY = /^\s*(?:(?:lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)\b.*\b(?:semana|tiempo ordinario)\b|domingo\s+(?:de la\s+)?[IVXLC]+\b)/i;
const dayTitle = computed(() => {
	const title = readings.value.day_title || "";
	return ROUTINE_DAY.test(title) ? "" : title;
});

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------
let requestId = 0; // ignore out-of-order responses when clicking quickly

async function loadDate(dateStr, { keepOnEmpty = false } = {}) {
	const id = ++requestId;
	viewDate.value = dateStr;
	loading.value = true;
	try {
		const result = await getBibleReadings({
			date: toNoonUTC(dateStr),
			lang: langCode.value,
			gospelOnly: gospelOnly.value,
		});
		if (id !== requestId) return;
		if (keepOnEmpty && !result.list.length) {
			// Fetch failed while correcting stale data: keep what we had
			viewDate.value = detectDate(readings.value) || dateStr;
			return;
		}
		fetched.value = { ...result, date: dateStr };
	} finally {
		if (id === requestId) loading.value = false;
	}
}

const go = (delta) => loadDate(shiftDate(viewDate.value, delta));

// On mount (client only, so it also runs after static generation) check that
// the preloaded data is for today and reload if it is stale.
onMounted(() => {
	today.value = toISO(new Date());
	const dataDate = detectDate(readings.value);
	if (dataDate !== today.value) loadDate(today.value, { keepOnEmpty: true });
});

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------
const labels = {
	es: { prev: "Día anterior", next: "Día siguiente", today: "Volver a hoy", loading: "Cargando lecturas…", empty: "No hay lecturas para este día.", nav: "Navegar por días" },
	eu: { prev: "Aurreko eguna", next: "Hurrengo eguna", today: "Gaur", loading: "Irakurgaiak kargatzen…", empty: "Egun honetarako ez dago irakurgairik.", nav: "Egunen artean nabigatu" },
	en: { prev: "Previous day", next: "Next day", today: "Back to today", loading: "Loading readings…", empty: "No readings for this day.", nav: "Browse days" },
};
const t = computed(() => labels[langCode.value] || labels.es);
</script>

<style>
.gospel .prose {
	font-size: 17px; /* readings body: 1px above the 16px prose default */
}
.gospel .prose p {
	margin-bottom: 0.5rem;
}
.gospel .prose strong {
	color: #b30838;
}
.gospel .gospel-nav-btn {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 2.5rem;
	height: 2.5rem;
	border-radius: 9999px;
	color: #b30838;
	flex-shrink: 0;
}
.gospel .gospel-nav-btn:hover:not(:disabled) {
	background: rgba(179, 8, 56, 0.1);
}
.gospel .gospel-nav-btn:focus-visible {
	outline: 2px solid #b30838;
	outline-offset: 2px;
}
.gospel .gospel-nav-btn:disabled {
	opacity: 0.4;
	cursor: default;
}
</style>
