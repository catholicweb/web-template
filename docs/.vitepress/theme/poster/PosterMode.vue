<script setup>
// Printable event poster. Opens with `?print[=<event id>]` on a generated event / event-type page
// (Layout.vue loads this file lazily, so regular visitors never download it). The sheet is plain
// HTML/CSS sized in container units, so one design prints on A4 and A3 (same ratio) and the
// browser does the print-to-PDF. Everything shown comes from the page's own event data; the panel
// only lets a person tune what is printed. Tweaks live in the URL, so a poster can be bookmarked.
import { ref, reactive, computed, watch, onMounted, onBeforeUnmount } from "vue";
import { useData, withBase } from "vitepress";
import { buildPosterModel, fitQr, pickLayout, qrCandidates, shortUrl, titleSize } from "./posterModel.js";
import { panelLabels } from "./posterLabels.js";

const emit = defineEmits(["close"]);
const { frontmatter, lang, theme } = useData();

const PAPER = { A4: { w: "210mm", h: "297mm", minPx: 1100 }, A3: { w: "297mm", h: "420mm", minPx: 1500 } };

const events = computed(() => {
  const seo = frontmatter.value?.seo ?? {};
  return seo.event ? [seo.event] : (seo.events ?? []);
});
const keyOf = (e) => e.id || e.title;
const registrationEvents = computed(() => frontmatter.value?.registration?.events ?? []);
const panel = computed(() => panelLabels(lang.value));

// ---- Options (mirrored in the URL) ------------------------------------------------
const params = new URLSearchParams(typeof location === "undefined" ? "" : location.search);
const flag = (name) => params.get(name) !== "off";
const opts = reactive({
  event: params.get("print") || "",
  paper: params.get("paper") === "A3" ? "A3" : "A4",
  layout: ["image", "plain", "text"].includes(params.get("layout")) ? params.get("layout") : "auto",
  hue: params.has("hue") && Number.isFinite(Number(params.get("hue"))) ? Number(params.get("hue")) : null,
  qr: ["page", "register", "off"].includes(params.get("qr")) ? params.get("qr") : "auto",
  image: params.has("img") ? Number(params.get("img")) || 0 : 0, // index into the event's pictures
  showImage: flag("img"),
  showDescription: flag("desc"),
  showPhone: flag("phone"),
  showLogo: flag("logo"),
  contact: 0,
});
const titleOverride = ref("");
const descOverride = ref(null);

const selected = computed(() => events.value.find((e) => keyOf(e) === opts.event) ?? events.value[0]);
watch(selected, () => {
  titleOverride.value = "";
  descOverride.value = null;
  opts.image = 0;
  opts.contact = 0;
});

// ---- Model -------------------------------------------------------------------------
const pageUrl = ref("");
const model = computed(() =>
  selected.value
    ? buildPosterModel({ event: selected.value, registrationEvents: registrationEvents.value, config: theme.value?.config ?? {}, lang: lang.value, pageUrl: pageUrl.value })
    : null,
);
const m = computed(() => model.value);
const title = computed(() => titleOverride.value.trim() || m.value?.title || "");
const description = computed({
  get: () => (descOverride.value ?? m.value?.description ?? ""),
  set: (v) => (descOverride.value = v),
});
const layout = computed(() => {
  if (!m.value) return "plain";
  const wanted = opts.layout === "auto" ? pickLayout({ ...m.value, title: title.value, description: description.value }) : opts.layout;
  return wanted !== "plain" && !picture.value ? "plain" : wanted;
});
const picture = computed(() => (opts.showImage ? (m.value?.images[opts.image] ?? m.value?.images[0] ?? "") : ""));
const hue = computed(() => (opts.hue ?? m.value?.hue ?? 250));
const contact = computed(() => (opts.showPhone ? (m.value?.contacts[opts.contact] ?? m.value?.contacts[0] ?? null) : null));
const qrTarget = computed(() => (opts.qr === "auto" ? (m.value?.registrationId ? "register" : "page") : opts.qr));
const qr = computed(() =>
  opts.qr === "off" || !m.value ? null : fitQr(qrCandidates(m.value.pageUrl, { target: qrTarget.value, registrationId: m.value.registrationId })),
);
const qrFailed = computed(() => opts.qr !== "off" && !!m.value && !qr.value);
const registering = computed(() => qrTarget.value === "register" && !!m.value?.registrationId);
const sheetStyle = computed(() => ({ "--h": hue.value, "--ts": titleSize(title.value, layout.value) + "cqw" }));
const rootStyle = computed(() => ({ "--pz-w": PAPER[opts.paper].w, "--pz-h": PAPER[opts.paper].h }));

const imgWidth = ref(0);
const lowRes = computed(() => !!picture.value && imgWidth.value > 0 && imgWidth.value < PAPER[opts.paper].minPx);
watch(picture, () => (imgWidth.value = 0));

// ---- URL + @page + chrome ------------------------------------------------------------
function syncUrl() {
  const u = new URL(location.href);
  const set = (k, v, keep) => (keep ? u.searchParams.set(k, v) : u.searchParams.delete(k));
  u.searchParams.set("print", events.value.length > 1 && selected.value ? keyOf(selected.value) : "");
  set("paper", opts.paper, opts.paper !== "A4");
  set("layout", opts.layout, opts.layout !== "auto");
  set("hue", opts.hue, opts.hue !== null);
  set("qr", opts.qr, opts.qr !== "auto");
  set("img", opts.showImage ? opts.image : "off", !opts.showImage || opts.image > 0);
  set("desc", "off", !opts.showDescription);
  set("phone", "off", !opts.showPhone);
  set("logo", "off", !opts.showLogo);
  history.replaceState(history.state, "", u);
}
watch([opts, selected], syncUrl, { deep: true });

let pageStyle;
watch(() => opts.paper, (p) => pageStyle && (pageStyle.textContent = `@page { size: ${p}; margin: 0 }`), { immediate: false });

const onKey = (e) => e.key === "Escape" && close();
function close() {
  const u = new URL(location.href);
  for (const k of ["print", "paper", "layout", "hue", "qr", "img", "desc", "phone", "logo"]) u.searchParams.delete(k);
  history.replaceState(history.state, "", u);
  emit("close");
}

onMounted(() => {
  pageUrl.value = location.origin + location.pathname;
  pageStyle = document.createElement("style");
  pageStyle.textContent = `@page { size: ${opts.paper}; margin: 0 }`;
  document.head.appendChild(pageStyle);
  document.documentElement.classList.add("pz-on");
  window.addEventListener("keydown", onKey);
});
onBeforeUnmount(() => {
  pageStyle?.remove();
  document.documentElement.classList.remove("pz-on");
  window.removeEventListener("keydown", onKey);
});

const print = () => window.print();
const onImgLoad = (e) => (imgWidth.value = e.target.naturalWidth);
const hideBroken = (e) => (e.target.style.display = "none");
</script>

<template>
  <Teleport to="body">
    <div v-if="m" class="pz-root fixed inset-0 z-[10000] flex flex-col md:flex-row bg-gray-300 text-gray-900" :style="rootStyle">
      <!-- Controls (never printed) -->
      <aside class="pz-panel w-full md:w-80 shrink-0 max-h-[46vh] md:max-h-none overflow-y-auto bg-white p-4 space-y-3 text-sm shadow-lg">
        <div class="flex items-center justify-between gap-2">
          <h2 class="text-lg font-semibold m-0">{{ panel.title }}</h2>
          <button type="button" class="text-2xl leading-none px-2" :aria-label="panel.close" @click="close">×</button>
        </div>

        <button type="button" class="w-full bg-accent text-white font-medium px-4 py-2 rounded-lg" @click="print">{{ panel.print }}</button>
        <p class="text-xs text-gray-500">{{ panel.hint }}</p>

        <label v-if="events.length > 1" class="block font-medium">{{ panel.event }}
          <select v-model="opts.event" class="mt-1 w-full rounded-lg border border-gray-300 px-2 py-1.5 font-normal">
            <option v-for="e in events" :key="keyOf(e)" :value="keyOf(e)">{{ e.title }}</option>
          </select>
        </label>

        <div class="grid grid-cols-2 gap-2">
          <label class="block font-medium">{{ panel.paper }}
            <select v-model="opts.paper" class="mt-1 w-full rounded-lg border border-gray-300 px-2 py-1.5 font-normal"><option>A4</option><option>A3</option></select>
          </label>
          <label class="block font-medium">{{ panel.layout }}
            <select v-model="opts.layout" class="mt-1 w-full rounded-lg border border-gray-300 px-2 py-1.5 font-normal">
              <option value="auto">{{ panel.auto }}</option>
              <option value="image">{{ panel.image }}</option>
              <option value="plain">{{ panel.plain }}</option>
              <option value="text">{{ panel.text }}</option>
            </select>
          </label>
        </div>

        <label class="block font-medium">{{ panel.colour }}
          <input type="range" min="0" max="360" :value="hue" class="mt-1 w-full" @input="opts.hue = Number($event.target.value)" />
        </label>

        <label class="block font-medium">{{ panel.posterTitle }}
          <input v-model="titleOverride" :placeholder="m.title" maxlength="120" class="mt-1 w-full rounded-lg border border-gray-300 px-2 py-1.5 font-normal" />
        </label>
        <label class="block font-medium">{{ panel.description }}
          <textarea v-model="description" rows="4" maxlength="600" class="mt-1 w-full rounded-lg border border-gray-300 px-2 py-1.5 font-normal"></textarea>
        </label>

        <fieldset class="space-y-1">
          <legend class="font-medium">{{ panel.show }}</legend>
          <label class="flex items-center gap-2"><input v-model="opts.showImage" type="checkbox" /> {{ panel.showImage }}</label>
          <label class="flex items-center gap-2"><input v-model="opts.showDescription" type="checkbox" /> {{ panel.showDescription }}</label>
          <label class="flex items-center gap-2"><input v-model="opts.showPhone" type="checkbox" /> {{ panel.showPhone }}</label>
          <label class="flex items-center gap-2"><input v-model="opts.showLogo" type="checkbox" /> {{ panel.showLogo }}</label>
        </fieldset>

        <label v-if="opts.showImage && m.images.length > 1" class="block font-medium">{{ panel.picture }}
          <select v-model.number="opts.image" class="mt-1 w-full rounded-lg border border-gray-300 px-2 py-1.5 font-normal">
            <option v-for="(_, i) in m.images" :key="i" :value="i">{{ i + 1 }} / {{ m.images.length }}</option>
          </select>
        </label>
        <p v-if="lowRes" class="text-xs text-amber-700">{{ panel.lowRes }}</p>

        <label v-if="opts.showPhone && m.contacts.length > 1" class="block font-medium">{{ panel.contact }}
          <select v-model.number="opts.contact" class="mt-1 w-full rounded-lg border border-gray-300 px-2 py-1.5 font-normal">
            <option v-for="(c, i) in m.contacts" :key="i" :value="i">{{ c.name || c.phone }}</option>
          </select>
        </label>

        <label class="block font-medium">{{ panel.qr }}
          <select v-model="opts.qr" class="mt-1 w-full rounded-lg border border-gray-300 px-2 py-1.5 font-normal">
            <option value="auto">{{ panel.qrAuto }}</option>
            <option value="page">{{ panel.qrPage }}</option>
            <option v-if="m.registrationId" value="register">{{ panel.qrRegister }}</option>
            <option value="off">{{ panel.qrOff }}</option>
          </select>
        </label>
        <p v-if="qrFailed" class="text-xs text-red-700">{{ panel.tooLong }}</p>
      </aside>

      <!-- Preview / printed sheet -->
      <div class="pz-stage flex-1 min-h-0 min-w-0 overflow-auto grid place-items-center p-4">
        <article class="pz-sheet" :class="`pz-${layout}`" :style="sheetStyle">
          <figure v-if="layout !== 'plain' && picture" class="pz-img">
            <img :src="picture" alt="" @load="onImgLoad" @error="hideBroken" />
          </figure>

          <header v-if="opts.showLogo" class="pz-brand">
            <img :src="withBase('/icon-512.png')" alt="" @error="hideBroken" />
            <span>{{ m.siteName }}</span>
          </header>

          <section class="pz-body">
            <div v-if="m.dates.items.length === 1" class="pz-date">
              <b>{{ m.dates.items[0].day }}</b>
              <span>{{ m.dates.items[0].month }}</span>
              <i>{{ m.dates.items[0].weekday }}</i>
            </div>
            <h1 class="pz-title">{{ title }}</h1>
            <ul class="pz-meta">
              <template v-if="m.dates.items.length > 1">
                <li v-for="d in m.dates.items" :key="d.iso">{{ d.long }}</li>
                <li v-if="m.dates.more > 0" class="pz-soft">{{ m.labels.more }}</li>
              </template>
              <li v-if="m.recurrence">{{ m.recurrence }}</li>
              <li v-if="m.times">{{ m.times }}</li>
              <li v-if="m.place">{{ m.place }}<span v-if="m.address" class="pz-soft"> · {{ m.address }}</span></li>
            </ul>
            <p v-if="opts.showDescription && description" class="pz-desc">{{ description }}</p>
          </section>

          <footer v-if="qr || contact || registering" class="pz-foot">
            <div v-if="qr" class="pz-qr">
              <svg :viewBox="`-2 -2 ${qr.size + 4} ${qr.size + 4}`" shape-rendering="crispEdges" role="img" aria-label="QR">
                <rect :x="-2" :y="-2" :width="qr.size + 4" :height="qr.size + 4" fill="#fff" />
                <path :d="qr.path" fill="#000" />
              </svg>
            </div>
            <div class="pz-foot-text">
              <p v-if="registering" class="pz-reg">{{ m.labels.register }}</p>
              <p v-if="qr" class="pz-cta">{{ registering ? m.labels.signup : m.labels.info }}</p>
              <p v-if="qr" class="pz-url">{{ shortUrl(m.pageUrl) }}</p>
              <p v-if="contact" class="pz-phone">{{ contact.phone }}<span v-if="contact.name"> · {{ contact.name }}</span></p>
            </div>
          </footer>
        </article>
      </div>
    </div>
  </Teleport>
</template>

<style>
/* The sheet is the only thing that prints. Sizes are in container units (cqw = 1% of the
   sheet's width) so the same design scales from the preview to A4 and A3. */
html.pz-on { overflow: hidden; }
.pz-stage { container-type: size; }
.pz-sheet {
  --pz-accent: oklch(55% 0.19 var(--h));
  --pz-deep: oklch(30% 0.09 var(--h));
  --pz-soft: oklch(96% 0.02 var(--h));
  position: relative; container-type: inline-size; display: flex; flex-direction: column; overflow: hidden;
  width: min(100cqw - 2rem, (100cqh - 2rem) * 0.7071); aspect-ratio: 210 / 297;
  background: var(--pz-soft); color: var(--pz-deep); box-shadow: 0 0.5rem 2rem rgb(0 0 0 / 0.25);
  -webkit-print-color-adjust: exact; print-color-adjust: exact;
}
.pz-sheet * { box-sizing: border-box; margin: 0; }

.pz-img { position: relative; flex: 1 1 0; min-height: 22cqw; max-height: 74cqw; background: var(--pz-deep); }
.pz-img img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.pz-text .pz-img { max-height: 34cqw; }

.pz-brand { position: absolute; top: 4cqw; left: 4cqw; display: flex; align-items: center; gap: 1.6cqw; max-width: 80cqw; background: #fff; color: var(--pz-deep); border-radius: 99cqw; padding: 1cqw 3cqw 1cqw 1cqw; font-weight: 700; font-size: 2.6cqw; box-shadow: 0 0.4cqw 1.6cqw rgb(0 0 0 / 0.2); }
.pz-brand img { width: 6cqw; height: 6cqw; border-radius: 50%; object-fit: cover; }
.pz-brand span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.pz-body { flex: 0 1 auto; min-height: 0; display: flex; flex-direction: column; gap: 2cqw; padding: 5cqw 7cqw 3cqw; overflow: hidden; }
.pz-date { align-self: flex-start; display: grid; justify-items: center; background: var(--pz-accent); color: #fff; border-radius: 1.6cqw; padding: 1.2cqw 3.4cqw; text-transform: uppercase; line-height: 1.05; }
.pz-date b { font-size: 10cqw; font-weight: 800; }
.pz-date span { font-size: 3cqw; font-weight: 700; letter-spacing: 0.15em; }
.pz-date i { font-size: 2.2cqw; font-style: normal; opacity: 0.9; }
.pz-title { font-size: var(--ts); line-height: 1.04; font-weight: 800; text-wrap: balance; overflow-wrap: anywhere; }
.pz-meta { list-style: none; padding: 0; display: grid; gap: 0.8cqw; font-size: 3.5cqw; font-weight: 700; color: var(--pz-accent); }
.pz-soft { font-weight: 500; opacity: 0.75; }
.pz-desc { font-size: 3cqw; line-height: 1.42; opacity: 0.88; overflow: hidden; }
.pz-text .pz-desc { font-size: 3.5cqw; }

.pz-foot { flex: 0 0 auto; margin-top: auto; display: flex; align-items: center; gap: 5cqw; padding: 3.6cqw 7cqw; background: var(--pz-deep); color: #fff; }
.pz-qr { flex: 0 0 19cqw; border-radius: 1.4cqw; overflow: hidden; background: #fff; }
.pz-qr svg { display: block; width: 100%; height: auto; }
.pz-foot-text { display: grid; gap: 0.8cqw; min-width: 0; }
.pz-reg { font-size: 2.6cqw; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: oklch(82% 0.12 var(--h)); }
.pz-cta { font-size: 4cqw; font-weight: 800; }
.pz-url { font-size: 2.3cqw; opacity: 0.8; overflow-wrap: anywhere; }
.pz-phone { font-size: 4.4cqw; font-weight: 800; }
.pz-phone span { font-size: 2.8cqw; font-weight: 500; opacity: 0.85; }

/* No picture: the colour carries the poster */
.pz-plain { background: var(--pz-accent); color: #fff; }
.pz-plain .pz-body { flex: 1 1 auto; justify-content: center; padding-top: 14cqw; }
.pz-plain .pz-meta { color: #fff; font-size: 4.4cqw; }
.pz-plain .pz-date { background: #fff; color: var(--pz-accent); }
.pz-plain .pz-brand { top: 5cqw; }

@media print {
  html.pz-on, html.pz-on body { overflow: visible !important; height: auto !important; margin: 0 !important; background: none !important; }
  html.pz-on body > *:not(.pz-root) { display: none !important; }
  .pz-root { position: static !important; display: block !important; background: none !important; overflow: visible !important; }
  .pz-panel { display: none !important; }
  .pz-stage { display: block !important; padding: 0 !important; overflow: visible !important; container-type: normal; }
  .pz-sheet { width: var(--pz-w) !important; height: calc(var(--pz-h) - 0.6mm) !important; aspect-ratio: auto; box-shadow: none; break-inside: avoid; }
}
</style>
