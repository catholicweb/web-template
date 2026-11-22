<script setup>
// Printable event poster. Opens with `?print[=<event id>]` on a generated event / event-type page
// (Layout.vue loads this file lazily, so regular visitors never download it). The sheet is plain
// HTML/CSS sized in container units, so one design prints on A4 and A3 (same ratio) and the
// browser does the print-to-PDF. Everything shown comes from the page's own event data; the panel
// only lets a person tune what is printed. Tweaks live in the URL, so a poster can be bookmarked.
import { ref, reactive, computed, watch, nextTick, onMounted, onBeforeUnmount } from "vue";
import { useData, withBase } from "vitepress";
import { buildHomeModel, buildListModel, buildPosterModel, fitQr, joinBi, pickLayout, PICTURE_LAYOUTS, qrCandidates, shortUrl, titleSize } from "./posterModel.js";
import PosterList from "./PosterList.vue";
import PosterHome from "./PosterHome.vue";
import { panelLabels } from "./posterLabels.js";
import { getCode } from "../../utils.js";

const emit = defineEmits(["close"]);
const { frontmatter, lang, theme } = useData();

const SHAPES = ["rect", "rounded", "arch", "circle", "blob", "diagonal", "wave", "fade", "vignette"];
const SHAPE_LAYOUTS = ["image", "text", "arch"]; // layouts whose picture can be cut to a shape
const TONE_LAYOUTS = ["image", "text", "arch", "polaroid"]; // layouts that can go dark / vivid
const PAPER = { A4: { w: "210mm", h: "297mm", minPx: 1100 }, A3: { w: "297mm", h: "420mm", minPx: 1500 } };

const events = computed(() => {
  const seo = frontmatter.value?.seo ?? {};
  return seo.event ? [seo.event] : (seo.events ?? []);
});
const keyOf = (e) => e.id || e.title;
const registrationEvents = computed(() => frontmatter.value?.registration?.events ?? []);
// The page's own language, read the way the Navbar / SEO do (authored "Label:code"), not from the router.
const pageLang = computed(() => frontmatter.value?.lang || lang.value);
const panel = computed(() => panelLabels(pageLang.value));

// ---- Options (mirrored in the URL) ------------------------------------------------
const params = new URLSearchParams(typeof location === "undefined" ? "" : location.search);
const flag = (name) => params.get(name) !== "off";
const opts = reactive({
  event: params.get("print") || "",
  paper: params.get("paper") === "A3" ? "A3" : "A4",
  layout: ["image", "plain", "text", "cover", "sticker", "bold", "arch", "polaroid"].includes(params.get("layout")) ? params.get("layout") : "auto",
  shape: SHAPES.includes(params.get("shape")) ? params.get("shape") : "auto",
  tone: ["dark", "vivid"].includes(params.get("tone")) ? params.get("tone") : "light",
  mode: params.get("mode") || (params.get("print") ? "event" : "list"), // type pages: "list" of events or one "event"
  cal: Number(params.get("cal")) || 0, // home: which calendar section feeds the schedule
  place: params.get("place") || "", // home: temple that lends its name and picture
  second: params.get("lang2") || "", // code of the extra language of a bilingual poster
  showAddress: params.get("addr") === "on",
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
const descOverride2 = ref(null);

// What the poster is about: one event, the list of events of an event-type page, or the home page.
const isHome = computed(() => !!frontmatter.value?.home && !events.value.length);
const kind = computed(() => (isHome.value ? "home" : opts.mode === "event" || events.value.length < 2 ? "event" : "list"));
const excluded = ref([]); // keys of the events left out of the list poster
const toggle = (key) => (excluded.value = excluded.value.includes(key) ? excluded.value.filter((k) => k !== key) : [...excluded.value, key]);
const placeSel = computed(() => (theme.value?.config?.info?.places ?? []).find((p) => p?.name === opts.place) ?? null);

const selected = computed(() => events.value.find((e) => keyOf(e) === opts.event) ?? events.value[0]);
watch(selected, () => {
  titleOverride.value = "";
  descOverride.value = null;
  descOverride2.value = null;
  opts.image = 0;
  opts.contact = 0;
});

// ---- Second language ---------------------------------------------------------------
// createFiles.js embeds the text of every language's version of an event page as `posterLangs`.
const secondLangs = computed(() => {
  const texts = frontmatter.value?.posterLangs;
  if (!texts && !isHome.value) return [];
  const own = getCode(String(pageLang.value));
  return (frontmatter.value?.equiv ?? [])
    .map((e) => ({ code: getCode(String(e.lang)), label: String(e.lang).split(":")[0], full: String(e.lang) }))
    .filter((l) => l.code !== own && (isHome.value || texts[l.code]));
});
const secondFull = computed(() => secondLangs.value.find((l) => l.code === opts.second)?.full ?? "");
const secondText = computed(() => {
  if (!opts.second || !secondLangs.value.some((l) => l.code === opts.second)) return null;
  return frontmatter.value.posterLangs[opts.second]?.[events.value.indexOf(selected.value)] ?? null;
});

// ---- Model -------------------------------------------------------------------------
const pageUrl = ref("");
const model = computed(() => {
  const common = { config: theme.value?.config ?? {}, lang: pageLang.value, pageUrl: pageUrl.value };
  if (kind.value === "home") {
    return buildHomeModel({ ...common, sections: frontmatter.value?.sections, calIndex: opts.cal, place: placeSel.value, second: secondFull.value ? { lang: secondFull.value } : undefined });
  }
  if (kind.value === "list") {
    const second = secondLangs.value.some((l) => l.code === opts.second) ? { lang: opts.second } : undefined;
    return buildListModel({
      ...common,
      events: events.value,
      title: frontmatter.value?.title ?? "",
      images: [frontmatter.value?.image].filter((i) => typeof i === "string"),
      texts2: second ? frontmatter.value?.posterLangs?.[opts.second] : undefined,
      second,
    });
  }
  return selected.value
    ? buildPosterModel({
        event: selected.value,
        registrationEvents: registrationEvents.value,
        ...common,
        second: secondText.value ? { lang: opts.second, ...secondText.value } : undefined,
      })
    : null;
});
const m = computed(() => model.value);
const title = computed(() => titleOverride.value.trim() || m.value?.title || "");
const description = computed({
  get: () => (descOverride.value ?? m.value?.description ?? ""),
  set: (v) => (descOverride.value = v),
});
const description2 = computed({
  get: () => descOverride2.value ?? m.value?.second?.description ?? "",
  set: (v) => (descOverride2.value = v),
});
const title2 = computed(() => {
  const t = m.value?.second?.title?.trim();
  return t && t.toLowerCase() !== title.value.trim().toLowerCase() ? t : "";
});
const layout = computed(() => {
  if (!m.value) return "plain";
  if (kind.value !== "event") return picture.value && opts.layout !== "plain" ? "image" : "plain"; // list / home
  const wanted = opts.layout === "auto" ? pickLayout({ ...m.value, title: title.value, description: description.value }) : opts.layout;
  return !picture.value && PICTURE_LAYOUTS[wanted] ? PICTURE_LAYOUTS[wanted] : wanted;
});
const showPic = computed(() => layout.value !== "plain" && !!picture.value);
const shapeApplies = computed(() => SHAPE_LAYOUTS.includes(layout.value) && showPic.value);
const shape = computed(() => (shapeApplies.value ? (opts.shape === "auto" ? (layout.value === "arch" ? "arch" : "rect") : opts.shape) : "rect"));
const toneApplies = computed(() => TONE_LAYOUTS.includes(layout.value));
const tone = computed(() => (toneApplies.value ? opts.tone : "light"));
const visibleItems = computed(() => (m.value?.items ?? []).filter((it) => !excluded.value.includes(it.key)).slice(0, 12));
// Rows shrink with their number and with how much each one prints (description, second language).
const listScale = computed(() => {
  const weight = visibleItems.value.length * (1 + (opts.showDescription ? 0.5 : 0) + (m.value?.second ? 0.25 : 0));
  return weight <= 3.5 ? 1 : weight <= 5.5 ? 0.86 : weight <= 7.5 ? 0.74 : weight <= 9.5 ? 0.64 : 0.55;
});
// The schedule shrinks with its lines, headings (two lines each when bilingual) and the picture.
const homeScale = computed(() => {
  const heading = m.value?.second ? 2 : 1.2;
  const n = (m.value?.groups ?? []).reduce((a, g) => a + g.lines.length + heading, 0) + (showPic.value ? 3 : 0);
  return n <= 8 ? 1 : n <= 12 ? 0.86 : n <= 17 ? 0.74 : n <= 22 ? 0.64 : 0.55;
});
// The date block: with two languages it uses the short month / weekday of both.
const dateBlock = computed(() => {
  const items = m.value?.dates?.items ?? [];
  if (items.length !== 1) return null;
  const [d] = items;
  const d2 = m.value.second?.dates.items[0];
  return m.value.second
    ? { day: d.day, month: joinBi(d.monthShort, d2?.monthShort), weekday: joinBi(d.weekdayShort, d2?.weekdayShort) }
    : { day: d.day, month: d.month, weekday: d.weekday };
});
const picture = computed(() => (opts.showImage ? (m.value?.images[opts.image] ?? m.value?.images[0] ?? "") : ""));
const hue = computed(() => (opts.hue ?? m.value?.hue ?? 250));
const contact = computed(() => (opts.showPhone ? (m.value?.contacts[opts.contact] ?? m.value?.contacts[0] ?? null) : null));
const qrTarget = computed(() => (opts.qr === "auto" ? (m.value?.registrationId ? "register" : "page") : opts.qr));
// One event to register for on the page: a bare `?register` opens its form (no id in the QR).
const bareRegister = computed(() => registrationEvents.value.length === 1);
const qr = computed(() =>
  opts.qr === "off" || !m.value
    ? null
    : fitQr(qrCandidates(m.value.pageUrl, { target: qrTarget.value, registrationId: m.value.registrationId, bare: bareRegister.value })),
);
const qrFailed = computed(() => opts.qr !== "off" && !!m.value && !qr.value);
const registering = computed(() => qrTarget.value === "register" && !!m.value?.registrationId);
const sheetStyle = computed(() => ({ "--h": hue.value, "--ts": Math.min(titleSize(title.value, layout.value), kind.value === "event" ? 99 : 7.5) + "cqw" }));
const rootStyle = computed(() => ({ "--pz-w": PAPER[opts.paper].w, "--pz-h": PAPER[opts.paper].h }));

// Does the text fit the sheet? Re-checked whenever anything that changes the layout does.
const sheetEl = ref(null);
const overflowing = ref(false);
function checkFit() {
  const el = sheetEl.value?.querySelector(".pz-body");
  overflowing.value = !!el && el.scrollHeight > el.clientHeight + 2;
}
watch([m, layout, title, description, description2, () => ({ ...opts }), () => opts.paper], () => nextTick(checkFit), { flush: "post", deep: true });

const imgWidth = ref(0);
const lowRes = computed(() => !!picture.value && imgWidth.value > 0 && imgWidth.value < PAPER[opts.paper].minPx);
watch(picture, () => (imgWidth.value = 0));

// ---- URL + @page + chrome ------------------------------------------------------------
function syncUrl() {
  const u = new URL(location.href);
  const set = (k, v, keep) => (keep ? u.searchParams.set(k, v) : u.searchParams.delete(k));
  u.searchParams.set("print", kind.value === "event" && events.value.length > 1 && selected.value ? keyOf(selected.value) : "");
  set("paper", opts.paper, opts.paper !== "A4");
  set("layout", opts.layout, opts.layout !== "auto");
  set("hue", opts.hue, opts.hue !== null);
  set("qr", opts.qr, opts.qr !== "auto");
  set("lang2", opts.second, !!opts.second);
  set("shape", opts.shape, opts.shape !== "auto");
  set("tone", opts.tone, opts.tone !== "light");
  set("cal", opts.cal, opts.cal > 0);
  set("place", opts.place, !!opts.place);
  set("addr", "on", opts.showAddress);
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
  for (const k of ["print", "paper", "layout", "shape", "tone", "mode", "cal", "place", "hue", "qr", "lang2", "addr", "img", "desc", "phone", "logo"]) u.searchParams.delete(k);
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
  nextTick(() => setTimeout(checkFit, 150)); // after fonts / images settle
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

        <label v-if="!isHome && events.length > 1" class="block font-medium">{{ panel.mode }}
          <select v-model="opts.mode" class="mt-1 w-full rounded-lg border border-gray-300 px-2 py-1.5 font-normal">
            <option value="list">{{ panel.modeList }}</option>
            <option value="event">{{ panel.modeEvent }}</option>
          </select>
        </label>

        <fieldset v-if="kind === 'list'" class="space-y-1">
          <legend class="font-medium">{{ panel.events }}</legend>
          <label v-for="it in m.items" :key="it.key" class="flex items-center gap-2">
            <input type="checkbox" :checked="!excluded.includes(it.key)" @change="toggle(it.key)" /> <span class="truncate">{{ it.title }}</span>
          </label>
        </fieldset>

        <label v-if="kind === 'home' && m.calendars.length > 1" class="block font-medium">{{ panel.cal }}
          <select v-model.number="opts.cal" class="mt-1 w-full rounded-lg border border-gray-300 px-2 py-1.5 font-normal">
            <option v-for="c in m.calendars" :key="c.index" :value="c.index">{{ c.label }}</option>
          </select>
        </label>
        <label v-if="kind === 'home' && m.places.length" class="block font-medium">{{ panel.temple }}
          <select v-model="opts.place" class="mt-1 w-full rounded-lg border border-gray-300 px-2 py-1.5 font-normal">
            <option value="">-</option>
            <option v-for="p in m.places" :key="p.name" :value="p.name">{{ p.name }}</option>
          </select>
        </label>

        <label v-if="kind === 'event' && events.length > 1" class="block font-medium">{{ panel.event }}
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
              <template v-if="kind === 'event'">
                <option value="text">{{ panel.text }}</option>
                <option value="arch">{{ panel.arch }}</option>
                <option value="cover">{{ panel.cover }}</option>
                <option value="sticker">{{ panel.sticker }}</option>
                <option value="bold">{{ panel.bold }}</option>
                <option value="polaroid">{{ panel.polaroid }}</option>
              </template>
            </select>
          </label>
        </div>

        <div v-if="shapeApplies || toneApplies" class="grid grid-cols-2 gap-2">
          <label v-if="shapeApplies" class="block font-medium">{{ panel.shape }}
            <select v-model="opts.shape" class="mt-1 w-full rounded-lg border border-gray-300 px-2 py-1.5 font-normal">
              <option value="auto">{{ panel.auto }}</option>
              <option v-for="(label, key) in panel.shapes" :key="key" :value="key">{{ label }}</option>
            </select>
          </label>
          <label v-if="toneApplies" class="block font-medium">{{ panel.tone }}
            <select v-model="opts.tone" class="mt-1 w-full rounded-lg border border-gray-300 px-2 py-1.5 font-normal">
              <option v-for="(label, key) in panel.tones" :key="key" :value="key">{{ label }}</option>
            </select>
          </label>
        </div>

        <label v-if="secondLangs.length" class="block font-medium">{{ panel.second }}
          <select v-model="opts.second" class="mt-1 w-full rounded-lg border border-gray-300 px-2 py-1.5 font-normal">
            <option value="">{{ panel.qrOff }}</option>
            <option v-for="l in secondLangs" :key="l.code" :value="l.code">{{ l.label }}</option>
          </select>
        </label>

        <label class="block font-medium">{{ panel.colour }}
          <input type="range" min="0" max="360" :value="hue" class="mt-1 w-full" @input="opts.hue = Number($event.target.value)" />
        </label>

        <label class="block font-medium">{{ panel.posterTitle }}
          <input v-model="titleOverride" :placeholder="m.title" maxlength="120" class="mt-1 w-full rounded-lg border border-gray-300 px-2 py-1.5 font-normal" />
        </label>
        <label v-if="kind === 'event'" class="block font-medium">{{ panel.description }}
          <textarea v-model="description" rows="4" maxlength="600" class="mt-1 w-full rounded-lg border border-gray-300 px-2 py-1.5 font-normal"></textarea>
        </label>

        <label v-if="kind === 'event' && m.second" class="block font-medium">{{ panel.description }} ({{ m.second.code }})
          <textarea v-model="description2" rows="3" maxlength="400" class="mt-1 w-full rounded-lg border border-gray-300 px-2 py-1.5 font-normal"></textarea>
        </label>

        <fieldset class="space-y-1">
          <legend class="font-medium">{{ panel.show }}</legend>
          <label class="flex items-center gap-2"><input v-model="opts.showImage" type="checkbox" /> {{ panel.showImage }}</label>
          <label class="flex items-center gap-2"><input v-model="opts.showDescription" type="checkbox" /> {{ panel.showDescription }}</label>
          <label v-if="kind === 'event' && m.address" class="flex items-center gap-2"><input v-model="opts.showAddress" type="checkbox" /> {{ panel.showAddress }}</label>
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
        <p v-if="overflowing" class="text-xs font-medium text-red-700" role="alert">{{ panel.noFit }}</p>
      </aside>

      <!-- Preview / printed sheet -->
      <div class="pz-stage flex-1 min-h-0 min-w-0 overflow-auto grid place-items-center p-4">
        <article ref="sheetEl" class="pz-sheet" :class="[`pz-${layout}`, `pz-shape-${shape}`, `pz-tone-${tone}`, `pz-kind-${kind}`, { 'pz-hasimg': showPic, 'pz-bilingual': !!m.second }]" :style="sheetStyle">
          <figure v-if="showPic" class="pz-img">
            <img :src="picture" alt="" @load="onImgLoad" @error="hideBroken" />
          </figure>

          <header v-if="opts.showLogo" class="pz-brand">
            <img :src="withBase('/icon-512.png')" alt="" @error="hideBroken" />
            <span>{{ m.siteName }}</span>
          </header>

          <section v-if="kind === 'event'" class="pz-body">
            <div v-if="dateBlock" class="pz-date">
              <b>{{ dateBlock.day }}</b>
              <span>{{ dateBlock.month }}</span>
              <i>{{ dateBlock.weekday }}</i>
            </div>
            <h1 class="pz-title">{{ title }}</h1>
            <p v-if="title2" class="pz-title2">{{ title2 }}</p>
            <ul class="pz-meta">
              <template v-if="m.dates.items.length > 1">
                <li v-for="(d, i) in m.dates.items" :key="d.iso">{{ d.long }}<span v-if="m.second?.dates.items[i]" class="pz-soft"> / {{ m.second.dates.items[i].long }}</span></li>
                <li v-if="m.dates.more > 0" class="pz-soft">{{ joinBi(m.labels.more, m.second?.labels.more) }}</li>
              </template>
              <li v-if="m.recurrence">{{ m.recurrence }}<span v-if="m.second?.recurrence" class="pz-soft"> / {{ m.second.recurrence }}</span></li>
              <li v-if="m.whenLine">{{ m.whenLine }}</li>
              <li v-if="opts.showAddress && m.address" class="pz-addr">{{ m.address }}</li>
            </ul>
            <template v-if="opts.showDescription">
              <p v-if="description" class="pz-desc">{{ description }}</p>
              <p v-if="m.second && description2" class="pz-desc pz-desc2">{{ description2 }}</p>
            </template>
          </section>
          <PosterList v-else-if="kind === 'list'" :title="title" :items="visibleItems" :show-description="opts.showDescription" :scale="listScale" :bilingual="!!m.second" />
          <PosterHome v-else :m="m" :title="title" :qr="qr" :show-description="opts.showDescription" :show-phone="opts.showPhone" :scale="homeScale" />

          <footer v-if="kind !== 'home' && (qr || contact || registering)" class="pz-foot">
            <div v-if="qr" class="pz-qr">
              <svg :viewBox="`-2 -2 ${qr.size + 4} ${qr.size + 4}`" shape-rendering="crispEdges" role="img" aria-label="QR">
                <rect :x="-2" :y="-2" :width="qr.size + 4" :height="qr.size + 4" fill="#fff" />
                <path :d="qr.path" fill="#000" />
              </svg>
            </div>
            <div class="pz-foot-text">
              <p v-if="registering" class="pz-reg">{{ joinBi(m.labels.register, m.second?.labels.register, " · ") }}</p>
              <p v-if="qr" class="pz-cta">{{ registering ? joinBi(m.labels.signup, m.second?.labels.signup) : joinBi(m.labels.info, m.second?.labels.info) }}</p>
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
  --pz-bg: var(--pz-soft); --pz-ink: var(--pz-deep); --pz-band: var(--pz-deep); --pz-tacc: var(--pz-accent);
  position: relative; container-type: inline-size; display: flex; flex-direction: column; overflow: hidden;
  width: min(100cqw - 2rem, (100cqh - 2rem) * 0.7071); aspect-ratio: 210 / 297;
  background: var(--pz-bg); color: var(--pz-ink); box-shadow: 0 0.5rem 2rem rgb(0 0 0 / 0.25);
  -webkit-print-color-adjust: exact; print-color-adjust: exact;
}
.pz-sheet * { box-sizing: border-box; margin: 0; }

.pz-img { position: relative; flex: 1 1 0; min-height: 22cqw; max-height: 74cqw; background: var(--pz-deep); overflow: hidden; border-radius: var(--pz-radius, 0); clip-path: var(--pz-clip, none); -webkit-mask-image: var(--pz-mask, none); mask-image: var(--pz-mask, none); }
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
.pz-title2 { font-size: calc(var(--ts) * 0.58); line-height: 1.1; font-weight: 600; opacity: 0.8; text-wrap: balance; }
.pz-addr { font-size: 2.3cqw; font-weight: 500; opacity: 0.7; }
.pz-desc2 { opacity: 0.72; }
.pz-meta { list-style: none; padding: 0; display: grid; gap: 0.8cqw; font-size: 3.5cqw; font-weight: 700; color: var(--pz-tacc); }
.pz-soft { font-weight: 500; opacity: 0.75; }
.pz-desc { font-size: 3cqw; line-height: 1.42; opacity: 0.88; overflow: hidden; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 6; line-clamp: 6; }
.pz-text .pz-desc { font-size: 3.5cqw; -webkit-line-clamp: 9; line-clamp: 9; }

/* Two languages share one sheet: smaller type, shorter descriptions, a compact footer */
.pz-bilingual .pz-title { font-size: calc(var(--ts) * 0.86); }
.pz-bilingual .pz-title2 { font-size: calc(var(--ts) * 0.5); }
.pz-bilingual .pz-meta { font-size: 3.2cqw; }
.pz-bilingual .pz-desc { font-size: 2.8cqw; -webkit-line-clamp: 2; line-clamp: 2; }
.pz-bilingual.pz-text .pz-desc { font-size: 3cqw; -webkit-line-clamp: 4; line-clamp: 4; }
.pz-bilingual .pz-foot { padding-block: 3cqw; }
.pz-bilingual .pz-reg { font-size: 2cqw; letter-spacing: 0.04em; }
.pz-bilingual .pz-cta { font-size: 3.2cqw; }

.pz-foot { flex: 0 0 auto; margin-top: auto; display: flex; align-items: center; gap: 5cqw; padding: 3.6cqw 7cqw; background: var(--pz-band); color: #fff; }
.pz-qr { flex: 0 0 15cqw; border-radius: 1.4cqw; overflow: hidden; background: #fff; }
.pz-qr svg { display: block; width: 100%; height: auto; }
.pz-foot-text { display: grid; gap: 0.8cqw; min-width: 0; }
.pz-reg { font-size: 2.6cqw; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: oklch(82% 0.12 var(--h)); }
.pz-cta { font-size: 4cqw; font-weight: 800; }
.pz-url { font-size: 2.3cqw; opacity: 0.8; overflow-wrap: anywhere; }
.pz-phone { font-size: 3.2cqw; font-weight: 800; }
.pz-phone span { font-size: 2.2cqw; font-weight: 500; opacity: 0.85; }

/* No picture: the colour carries the poster */
.pz-plain { background: var(--pz-accent); color: #fff; }
.pz-plain .pz-body { flex: 1 1 auto; justify-content: center; padding-top: 14cqw; }
.pz-plain .pz-meta { color: #fff; font-size: 4.4cqw; }
.pz-plain .pz-date { background: #fff; color: var(--pz-accent); }
.pz-plain .pz-brand { top: 5cqw; }

/* Relaxed / youth layouts ------------------------------------------------------------- */
/* Photo cover: the picture fills the sheet, the text sits on a dark fade at the bottom. */
.pz-cover { background: var(--pz-deep); color: #fff; }
.pz-cover .pz-img { position: absolute; inset: 0; max-height: none; min-height: 0; }
.pz-cover .pz-img::after { content: ""; position: absolute; inset: 0; background: linear-gradient(to top, var(--pz-deep) 0%, oklch(30% 0.09 var(--h) / 0.92) 36%, transparent 68%); }
.pz-cover .pz-body { position: relative; margin-top: auto; padding-bottom: 4cqw; }
.pz-cover .pz-title { text-shadow: 0 0.4cqw 2cqw rgb(0 0 0 / 0.35); }
.pz-cover .pz-meta { color: oklch(90% 0.11 var(--h)); }
.pz-cover .pz-foot { position: relative; margin-top: 0; background: transparent; }

/* Sticker: tilted photo with a white border, a round date sticker, chunky shadowed title. */
.pz-sticker {
  --pz-pop: oklch(89% 0.17 95);
  background-color: var(--pz-soft);
  background-image: radial-gradient(oklch(86% 0.07 var(--h)) 0.55cqw, transparent 0.65cqw);
  background-size: 4.2cqw 4.2cqw;
}
.pz-sticker .pz-img { min-height: 20cqw; max-height: 66cqw; margin: 12cqw 9cqw 0; transform: rotate(-2deg); border: 1.4cqw solid #fff; border-radius: 2.2cqw; box-shadow: 1.2cqw 1.4cqw 0 var(--pz-accent); overflow: hidden; }
.pz-sticker .pz-body { position: relative; overflow: visible; padding-top: 11cqw; }
.pz-sticker .pz-date { position: absolute; top: -13cqw; right: 8cqw; width: 24cqw; height: 24cqw; padding: 0; align-content: center; border-radius: 50%; background: var(--pz-pop); color: var(--pz-deep); transform: rotate(9deg); box-shadow: 0.8cqw 0.8cqw 0 var(--pz-deep); }
.pz-sticker .pz-date span, .pz-sticker .pz-date i { text-align: center; }
.pz-sticker .pz-title { text-transform: uppercase; font-weight: 900; text-shadow: 0.45cqw 0.45cqw 0 var(--pz-pop); }
.pz-sticker .pz-meta { color: var(--pz-deep); }
.pz-sticker .pz-foot { background: var(--pz-accent); border-radius: 5cqw 5cqw 0 0; }
.pz-sticker .pz-qr { transform: rotate(-4deg); border: 0.9cqw solid #fff; }

/* Bold: flat colour, big circles, shouting title; the picture (if any) is a round sticker. */
.pz-bold { --pz-pop: oklch(88% 0.17 calc(var(--h) + 110)); background: var(--pz-accent); color: #fff; }
.pz-bold::before { content: ""; position: absolute; top: -30cqw; right: -26cqw; width: 78cqw; height: 78cqw; border-radius: 50%; background: var(--pz-pop); }
.pz-bold::after { content: ""; position: absolute; bottom: 14cqw; left: -24cqw; width: 56cqw; height: 56cqw; border-radius: 50%; background: var(--pz-deep); opacity: 0.55; }
.pz-bold .pz-brand { z-index: 2; }
.pz-bold .pz-img { position: absolute; z-index: 1; top: 9cqw; right: 6cqw; flex: none; width: 38cqw; height: 38cqw; min-height: 0; max-height: none; border: 1.4cqw solid #fff; border-radius: 50%; overflow: hidden; transform: rotate(4deg); }
.pz-bold .pz-body { position: relative; z-index: 1; flex: 1 1 auto; justify-content: center; padding-top: 22cqw; }
.pz-bold.pz-hasimg .pz-body { justify-content: flex-start; padding-top: 46cqw; }
.pz-bold .pz-title { text-transform: uppercase; font-weight: 900; letter-spacing: -0.015em; line-height: 0.98; text-shadow: 0.6cqw 0.6cqw 0 var(--pz-deep); }
.pz-bold .pz-date { grid-auto-flow: column; align-items: baseline; gap: 2cqw; padding: 1cqw 5cqw; border-radius: 99cqw; background: var(--pz-pop); color: var(--pz-deep); transform: rotate(-3deg); }
.pz-bold .pz-meta { color: #fff; font-size: 3.8cqw; }
.pz-bold.pz-bilingual .pz-meta { font-size: 3.3cqw; }
.pz-bold .pz-foot { position: relative; z-index: 1; margin-top: 0; }

/* Photo shapes (formal layouts): cut-outs and soft edges ------------------------------------ */
.pz-shape-rounded { --pz-radius: 4cqw; }
.pz-shape-arch { --pz-clip: inset(0 round 50cqw 50cqw 0 0); }
.pz-shape-circle { --pz-clip: circle(closest-side); }
.pz-shape-blob { --pz-radius: 58% 42% 55% 45% / 50% 58% 42% 50%; }
.pz-shape-diagonal { --pz-clip: polygon(0 0, 100% 0, 100% 82%, 0 100%); }
.pz-shape-wave { --pz-clip: polygon(0 0, 100% 0, 100% 90%, 90% 95%, 80% 90%, 70% 95%, 60% 90%, 50% 95%, 40% 90%, 30% 95%, 20% 90%, 10% 95%, 0 90%); }
.pz-shape-fade { --pz-mask: linear-gradient(to bottom, #000 55%, transparent 100%); }
.pz-shape-vignette { --pz-mask: radial-gradient(ellipse 70% 72% at 50% 50%, #000 52%, transparent 100%); }
:is(.pz-shape-rounded, .pz-shape-arch, .pz-shape-circle, .pz-shape-blob, .pz-shape-vignette) .pz-img { margin: 10cqw 10cqw 0; }

/* Tones: the same layouts, dark or vivid */
.pz-tone-dark { --pz-bg: oklch(22% 0.05 var(--h)); --pz-ink: #fff; --pz-band: oklch(13% 0.04 var(--h)); --pz-tacc: oklch(82% 0.13 var(--h)); }
.pz-tone-vivid { --pz-bg: var(--pz-accent); --pz-ink: #fff; --pz-band: var(--pz-deep); --pz-tacc: #fff; }
.pz-tone-vivid .pz-date { background: #fff; color: var(--pz-accent); }

/* Arch window: centred text under an arched picture */
.pz-arch .pz-img { margin: 11cqw 15cqw 0; max-height: 84cqw; }
.pz-arch .pz-body { text-align: center; align-items: center; }
.pz-arch .pz-meta { justify-items: center; }

/* Polaroid: a taped, slightly crooked instant photo */
.pz-polaroid { background-image: repeating-linear-gradient(0deg, transparent 0 3.9cqw, oklch(90% 0.03 var(--h) / 0.5) 3.9cqw 4cqw); }
.pz-polaroid .pz-img { overflow: visible; margin: 12cqw 14cqw 0; min-height: 30cqw; max-height: 70cqw; padding: 2.4cqw 2.4cqw 9cqw; background: #fff; transform: rotate(2.5deg); box-shadow: 0.8cqw 1.4cqw 3cqw rgb(0 0 0 / 0.28); }
.pz-polaroid .pz-img img { inset: 2.4cqw 2.4cqw 9cqw; width: calc(100% - 4.8cqw); height: calc(100% - 11.4cqw); }
.pz-polaroid .pz-img::before { content: ""; position: absolute; z-index: 1; top: -3cqw; left: 38%; width: 24cqw; height: 7cqw; background: oklch(88% 0.12 95 / 0.8); transform: rotate(-4deg); }
.pz-polaroid .pz-body { padding-top: 7cqw; }
.pz-polaroid .pz-title { font-weight: 900; }
.pz-polaroid .pz-date { transform: rotate(-3deg); }

/* Event-type poster (list) and home poster (schedule) */
.pz-rows { list-style: none; padding: 0; display: grid; }
.pz-row { display: grid; grid-template-columns: 22cqw 1fr; gap: 3cqw; align-items: start; padding: calc(1.5cqw * var(--ls, 1)) 0; border-bottom: 0.25cqw solid color-mix(in oklab, currentColor 18%, transparent); }
.pz-row:last-child { border-bottom: 0; }
.pz-when { display: grid; justify-items: start; line-height: 1.05; color: var(--pz-tacc); font-weight: 800; }
.pz-when b { font-size: calc(7cqw * var(--ls, 1)); }
.pz-when span { font-size: calc(2.8cqw * var(--ls, 1)); text-transform: uppercase; letter-spacing: 0.12em; }
.pz-when i { font-size: calc(2.2cqw * var(--ls, 1)); font-style: normal; opacity: 0.8; }
.pz-when em { font-size: calc(3cqw * var(--ls, 1)); font-style: normal; line-height: 1.2; }
.pz-what { display: grid; gap: 0.5cqw; min-width: 0; }
.pz-what strong { font-size: calc(4cqw * var(--ls, 1)); line-height: 1.12; }
.pz-line { font-size: calc(2.9cqw * var(--ls, 1)); font-weight: 600; color: var(--pz-tacc); }
.pz-rowdesc { font-size: calc(2.5cqw * var(--ls, 1)); line-height: 1.35; opacity: 0.85; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; line-clamp: 2; overflow: hidden; }
.pz-bilingual .pz-rowdesc { -webkit-line-clamp: 1; line-clamp: 1; }
.pz-h2 { font-size: 3.6cqw; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; color: var(--pz-tacc); }
.pz-sched { display: grid; grid-template-columns: repeat(auto-fit, minmax(calc(38cqw * var(--ls, 1)), 1fr)); gap: 3cqw 6cqw; }
.pz-group h3 { font-size: calc(3.8cqw * var(--ls, 1)); font-weight: 800; border-bottom: 0.5cqw solid var(--pz-tacc); padding-bottom: 0.8cqw; margin-bottom: 1.2cqw; }
.pz-group ul { list-style: none; padding: 0; display: grid; gap: calc(1cqw * var(--ls, 1)); font-size: calc(3.3cqw * var(--ls, 1)); line-height: 1.25; }
.pz-group li b { font-weight: 800; color: var(--pz-tacc); }
.pz-homefoot .pz-foot-text { gap: 0.6cqw; }
.pz-mail, .pz-social { font-size: 2.5cqw; }
.pz-social b { font-weight: 800; }
.pz-plain { --pz-tacc: oklch(92% 0.08 var(--h)); }
.pz-plain .pz-when, .pz-plain .pz-line, .pz-plain .pz-h2 { color: #fff; }

@media print {
  html.pz-on, html.pz-on body { overflow: visible !important; height: auto !important; margin: 0 !important; background: none !important; }
  html.pz-on body > *:not(.pz-root) { display: none !important; }
  .pz-root { position: static !important; display: block !important; background: none !important; overflow: visible !important; }
  .pz-panel { display: none !important; }
  .pz-stage { display: block !important; padding: 0 !important; overflow: visible !important; container-type: normal; }
  .pz-sheet { width: var(--pz-w) !important; height: calc(var(--pz-h) - 0.6mm) !important; aspect-ratio: auto; box-shadow: none; break-inside: avoid; }
}
</style>
