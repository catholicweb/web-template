<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from "vue";
import { useData, useRoute } from "vitepress";
import Image from "./Image.vue";
import Hero from "./Hero.vue";
import EventCards from "./EventCards.vue";
import { getCode } from "./../../utils.js";

const { theme, site, page } = useData();
const route = useRoute();

/* ------------------------------------------------------------------ *
 * Data
 * ------------------------------------------------------------------ */
const fm = computed(() => page.value.frontmatter || {});
const cfg = computed(() => theme.value?.config || {});
const title = computed(() => cfg.value.info?.title || "");
const accentHue = computed(() => cfg.value.theme?.accentHue);

const siteLanguages = computed(() => {
  const langs = cfg.value.languages;
  return langs?.length ? langs : Object.keys(theme.value.nav || {});
});

// 404 pages have no frontmatter.lang → derive it from the locale.
const currentLang = computed(() => {
  if (fm.value.lang) return fm.value.lang;
  const found = siteLanguages.value.find((l) => l.split(":")[1] === site.value?.lang);
  return found || Object.keys(theme.value.nav || {})[0] || "";
});

const langHome = (l) => (l === siteLanguages.value[0] ? "/" : `/${getCode(l)}/`);
const homeHref = computed(() => langHome(currentLang.value)); // logo stays in the current language

const langEntries = computed(() => {
  const equiv = fm.value.equiv;
  if (equiv?.length > 1) return equiv;
  return siteLanguages.value.map((l) => ({ lang: l, href: langHome(l) }));
});

const nav = computed(() => {
  const items = theme.value.nav?.[currentLang.value] || [];
  return items.length === 1 ? (items[0].items ?? items) : items;
});

const hasItems = (item) => item.items?.length > 0;
const isActive = (item) => item.link && (route.path === item.link || route.path.startsWith(item.link + "/"));

/* ------------------------------------------------------------------ *
 * UI state
 * ------------------------------------------------------------------ */
const mobileMenuOpen = ref(false);
const langOpen = ref(false);
const stuck = ref(false); // scrolled away from the top (only used with "sticky")

watch(() => route.path, () => (mobileMenuOpen.value = false));

const closeLang = () => (langOpen.value = false);
const onScroll = () => (stuck.value = window.scrollY > 8);
onMounted(() => {
  document.addEventListener("click", closeLang);
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
});
onUnmounted(() => {
  document.removeEventListener("click", closeLang);
  window.removeEventListener("scroll", onScroll);
});

/* ------------------------------------------------------------------ *
 * Tokens   (config.theme.navStyle: string | string[], later wins)
 *
 *   ["47herri"]                          exactly the 47herri look
 *   ["47herri", "sticky"]                preset + extra token
 *   ["47herri", "!showEvents"]           "!" switches a token off
 *   ["overlay", "sticky", "display"]     transparent bar over <Hero>
 *
 * Flags
 *   showEvents   EventCards under the bar (instead of <Hero>)
 *   hideHero     no hero / event cards (frontmatter hideHero wins)
 *   heroBg       page image behind the header (implies overlay)
 *   overlay      bar floats over the hero/events instead of sitting above it
 *   transparent  glass, or a gradient scrim when floating over an image
 *   sticky       stick to the top (with overlay: turns glass once scrolled)
 *   display      big / bold / font-heading typography
 *   compact      shorter bar
 *   accent       with "!transparent": solid bar tinted with theme.accentHue
 * Valued
 *   align:left | align:center            title position
 *   scheme:auto | light | dark           force a colour scheme (default: auto)
 *   dark                                 alias for scheme:dark
 * ------------------------------------------------------------------ */
const DEFAULTS = {
  showEvents: false, hideHero: false, heroBg: false, overlay: false,
  transparent: true, sticky: false, display: false, compact: false, accent: true,
  align: "", scheme: "auto",
};
const VALUES = { align: ["left", "center"], scheme: ["auto", "light", "dark"] };
const PRESETS = {
  "47herri": ["heroBg", "showEvents", "scheme:dark", "transparent", "display"],
  "bidasoa": ["heroBg", "showEvents", "scheme:dark", "transparent"],
};

function resolveNavTokens(input) {
  const out = { ...DEFAULTS };
  const apply = (raw) => {
    if (typeof raw !== "string") return;
    if (PRESETS[raw]) return PRESETS[raw].forEach(apply);

    const off = raw.startsWith("!");
    const [key, val] = raw.slice(off ? 1 : 0).split(":");

    if (key === "dark" && val === undefined) out.scheme = off ? "auto" : "dark";
    else if (val === undefined && typeof DEFAULTS[key] === "boolean") out[key] = !off;
    else if (VALUES[key]?.includes(val)) out[key] = off ? DEFAULTS[key] : val;
    else if (import.meta.env?.DEV) console.warn(`[Navbar] unknown navStyle token: "${raw}"`);
  };
  [].concat(input ?? []).forEach(apply);
  return out;
}

const tokens = computed(() => resolveNavTokens(cfg.value.theme?.navStyle));

/* ------------------------------------------------------------------ *
 * What is on screen under the bar
 * ------------------------------------------------------------------ */
const hideHero = computed(() => {
  const f = fm.value.hideHero ?? fm.value.hidehero; // frontmatter wins both ways
  return f !== undefined ? !!f : tokens.value.hideHero;
});
const contentVisible = computed(() => !hideHero.value && !page.value.isNotFound);

const showEvents = computed(() => tokens.value.showEvents && contentVisible.value);
const showHero = computed(() => !tokens.value.showEvents && contentVisible.value && !!(fm.value.image || fm.value.title));
const hasStage = computed(() => showEvents.value || showHero.value);

// heroBg backdrop: the page image behind the header. Like before, it does NOT depend on
// events/hero being visible, so pages with hideHero still get their image behind the bar.
const heroBgImage = computed(() => tokens.value.heroBg && !!fm.value.image);
const backdropInStage = computed(() => heroBgImage.value && showEvents.value); // spans bar + events
const backdropInBar = computed(() => heroBgImage.value && !hasStage.value);    // bar only
const eventsBlock = computed(() => ({ events: fm.value.events, tags: ["carousel"], query: false }));

// Floating only makes sense if there is something to float over.
const overlay = computed(() => (tokens.value.overlay || tokens.value.heroBg) && hasStage.value);
// Is there actually an image behind the bar? (otherwise a scrim would be unreadable)
const hasBackdrop = computed(
  () => backdropInStage.value || backdropInBar.value || (overlay.value && showHero.value && !!fm.value.image),
);

// The single place where "what does the bar look like right now" is decided.
const surface = computed(() => {
  if (!tokens.value.transparent) return "solid";
  const floating = hasBackdrop.value && !mobileMenuOpen.value && !(tokens.value.sticky && stuck.value);
  return floating ? "scrim" : "glass";
});

/* ------------------------------------------------------------------ *
 * Tokens → data-attributes (+ one CSS var). All styling lives in CSS.
 * ------------------------------------------------------------------ */
const rootAttrs = computed(() => {
  const t = tokens.value;
  const hue = accentHue.value;
  const accent = t.accent && hue != null && surface.value === "solid";
  return {
    // only set when forced; "auto" inherits <html data-theme>
    "data-theme": t.scheme === "auto" ? undefined : t.scheme,
    "data-surface": surface.value,
    "data-align": t.align,
    "data-overlay": overlay.value || undefined,
    "data-sticky": t.sticky || undefined,
    "data-display": t.display || undefined,
    "data-compact": t.compact || undefined,
    "data-open": mobileMenuOpen.value || undefined,
    style: accent
      ? { "--nav-solid": `oklch(var(--nav-accent-l) 0.2 ${hue})`, "--nav-fg": "var(--nav-accent-fg)" }
      : undefined,
  };
});
</script>

<template>
  <div class="nav-root" v-bind="rootAttrs">
    <nav class="nav-bar" :class="tokens.display && 'font-bold font-heading'">
      <!-- Backdrop for pages without events/hero (e.g. hideHero) -->
      <Image v-if="backdropInBar" :src="fm.image" alt="" class="nav-backdrop absolute inset-0 -z-10 size-full object-cover" style="padding-bottom: var(--nav-fade);"/>
      <div class="nav-inner mx-auto px-4 sm:px-6 lg:px-8">
        <div class="nav-row flex items-center justify-between">
          <!-- Logo / title -->
          <div class="nav-logo-box flex items-center">
            <a v-if="title" :href="homeHref" class="nav-logo font-bold hover:text-accent">{{ title }}</a>
          </div>

          <!-- Desktop menu -->
          <div class="nav-menu hidden lg:flex items-center space-x-1 font-medium">
            <template v-for="item in nav" :key="item.text">
              <a v-if="!hasItems(item)" :href="item.link" :aria-current="isActive(item) ? 'page' : undefined"
                 class="px-4 py-2 rounded-sm" :class="isActive(item) ? 'text-accent' : 'hover:text-accent'">
                {{ item.text }}
              </a>

              <div v-else class="relative group">
                <button type="button" aria-haspopup="true" class="px-4 py-2 hover:text-accent transition-colors flex items-center gap-1">
                  {{ item.text }}
                  <svg class="w-4 h-4 transition-transform group-hover:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                <div class="nav-panel absolute left-0 w-96 rounded-sm shadow-lg z-50 opacity-0 invisible transition-all
                            group-hover:opacity-100 group-hover:visible group-focus-within:opacity-100 group-focus-within:visible">
                  <a v-for="section in item.items" :key="section.text" :href="section.link"
                     class="block px-3 py-2 rounded-sm hover:text-accent transition-colors" :class="isActive(section) && 'text-accent'">
                    {{ section.text }}
                  </a>
                </div>
              </div>
            </template>
          </div>

          <!-- Controls -->
          <div class="nav-controls flex items-center space-x-2">
            <div v-if="langEntries.length > 1" class="relative" @click.stop @keydown.esc="langOpen = false">
              <button type="button" @click="langOpen = !langOpen" aria-label="Toggle Language" :aria-expanded="langOpen"
                      class="nav-hoverable px-2 py-1 rounded-sm hover:text-accent transition-colors flex items-center space-x-1">
                <span>{{ currentLang.split(":")[0] }}</span>
                <svg class="w-4 h-4 transition-transform" :class="langOpen && 'rotate-180'" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M5.23 7.21a.75.75 0 011.06 0L10 10.91l3.71-3.7a.75.75 0 111.06 1.06l-4.24 4.24a.75.75 0 01-1.06 0L5.23 8.27a.75.75 0 010-1.06z" />
                </svg>
              </button>
              <div v-show="langOpen" class="nav-panel absolute right-0 w-36 shadow-lg rounded-sm z-50">
                <a v-for="equiv in langEntries" :key="equiv.lang" :href="equiv.href"
                   class="block px-3 py-2 rounded-sm transition-colors" :class="equiv.lang === currentLang && 'text-accent'">
                  {{ equiv.lang.split(":")[0] }}
                </a>
              </div>
            </div>

            <button type="button" @click="mobileMenuOpen = !mobileMenuOpen" aria-label="Toggle Mobile Menu" :aria-expanded="mobileMenuOpen"
                    class="nav-hoverable lg:hidden px-2 py-1 rounded-sm transition-colors hover:text-accent">
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                      :d="mobileMenuOpen ? 'M6 18L18 6M6 6l12 12' : 'M4 6h16M4 12h16M4 18h16'" />
              </svg>
            </button>
          </div>
        </div>

        <!-- Mobile menu -->
        <div v-show="mobileMenuOpen" class="nav-mobile lg:hidden">
          <div class="px-2 pt-2 pb-3 space-y-1">
            <template v-for="item in nav" :key="item.text">
              <a v-if="!hasItems(item)" :href="item.link" @click="mobileMenuOpen = false"
                 class="nav-hoverable block px-3 py-1 rounded-sm transition-colors hover:text-accent">
                {{ item.text }}
              </a>
              <details v-else class="group">
                <summary class="nav-hoverable font-bold px-3 py-2 rounded-sm flex justify-between items-center cursor-pointer hover:text-accent">
                  <span>{{ item.text }}</span>
                  <svg class="w-4 h-4 transition-transform group-open:rotate-180" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M5.23 7.21a.75.75 0 011.06 0L10 10.91l3.71-3.7a.75.75 0 111.06 1.06l-4.24 4.24a.75.75 0 01-1.06 0L5.23 8.27a.75.75 0 010-1.06z" />
                  </svg>
                </summary>
                <div class="pl-4 space-y-1 mt-1">
                  <a v-for="section in item.items" :key="section.text" :href="section.link" @click="mobileMenuOpen = false"
                     class="nav-hoverable block px-3 py-2 rounded-sm transition-colors hover:text-accent">
                    {{ section.text }}
                  </a>
                </div>
              </details>
            </template>
          </div>
        </div>
      </div>
    </nav>

    <!-- What the bar sits above / floats over -->
    <div v-if="hasStage" class="nav-stage relative isolate" :data-stage="showEvents ? 'events' : 'hero'">
      <template v-if="showEvents">
        <Image v-if="backdropInStage" :src="fm.image" alt="" class="nav-backdrop absolute inset-0 -z-10 size-full object-cover" />
        <EventCards :block="eventsBlock" class="w-full" />
      </template>
      <!-- Hero.vue: add `padding-top: var(--nav-offset)` to its root so content clears a floating bar -->
      <Hero v-else :block="fm" :tokens="tokens" />
    </div>
  </div>
</template>

<!-- Colour tokens. Nearest data-theme wins, so a forced scheme on the header
     works inside a page of the opposite scheme. Override any of these anywhere. -->
<style>
:root,
[data-theme="light"] {
  --nav-fg: #111827;
  --nav-solid: #fff;
  --nav-glass: rgb(255 255 255 / 0.3);
  --nav-scrim: rgb(255 255 255 / 0.7);
  --nav-hover: rgb(0 0 0 / 0.05);
  --nav-border: #e5e7eb;
  --nav-menu-bg: #fff;
  --nav-menu-fg: #111827;
  --nav-menu-hover: #f3f4f6;
  --nav-accent-l: 54%;
  --nav-accent-fg: #fff;
}
[data-theme="dark"] {
  --nav-fg: #fff;
  --nav-solid: #111827;
  --nav-glass: rgb(0 0 0 / 0.3);
  --nav-scrim: rgb(0 0 0 / 0.7);
  --nav-hover: rgb(255 255 255 / 0.1);
  --nav-border: #374151;
  --nav-menu-bg: #1f2937;
  --nav-menu-fg: #fff;
  --nav-menu-hover: #374151;
  --nav-accent-l: 74%;
  --nav-accent-fg: #111827;
}
</style>

<!-- Layout tokens + structure, driven by the data-attributes on .nav-root -->
<style scoped>
.nav-root {
  display: contents;
  --nav-h: 4rem;
  --nav-fade: 0px;
  --nav-max: 80rem;
  --nav-offset: 0px;
  --nav-logo-size: 1.25rem;
  --nav-menu-size: 1rem;
}
.nav-root[data-compact] { --nav-h: 3rem; }
.nav-root[data-display] { --nav-logo-size: 1.875rem; --nav-menu-size: 1.25rem; }
.nav-root[data-overlay] { --nav-max: none; --nav-border: transparent; --nav-offset: var(--nav-h); }
.nav-root[data-surface="scrim"] { --nav-fade: 20px; --nav-hover: transparent; --nav-max: none; }

/* bar */
.nav-bar {
  position: relative;
  z-index: 50;
  color: var(--nav-fg);
  padding-bottom: var(--nav-fade);
  margin-bottom: calc(var(--nav-fade) * -1);
  transition: background-color 0.2s;
}
.nav-root[data-sticky] .nav-bar { position: sticky; top: 0; }
/* floating: the stage slides up underneath the bar */
.nav-root[data-overlay] .nav-bar { margin-bottom: calc((var(--nav-h) + var(--nav-fade)) * -1); }

/* The surface is its own layer: above the backdrop image (-z-10), below the content */
.nav-bar::before { content: ""; position: absolute; inset: 0; z-index: -1; pointer-events: none; }
.nav-root[data-surface="solid"] .nav-bar::before { background: var(--nav-solid); box-shadow: 0 1px 2px rgb(0 0 0 / 0.05); }
.nav-root[data-surface="glass"] .nav-bar::before { background: var(--nav-glass); backdrop-filter: blur(12px); }
.nav-root[data-surface="scrim"] .nav-bar::before { background: linear-gradient(to bottom, var(--nav-scrim), transparent); }

.nav-inner { max-width: var(--nav-max); }
.nav-row { height: var(--nav-h); }
.nav-logo { font-size: var(--nav-logo-size); }
.nav-menu { font-size: var(--nav-menu-size); }

/* align:center → menu | title | controls */
@media (min-width: 1024px) {
  .nav-root[data-align="center"] .nav-row { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .nav-root[data-align="center"] .nav-menu { order: 1; }
  .nav-root[data-align="center"] .nav-logo-box { order: 2; justify-self: center; }
  .nav-root[data-align="center"] .nav-controls { order: 3; justify-self: end; }
}

/* menus */
.nav-panel { background: var(--nav-menu-bg); color: var(--nav-menu-fg); }
.nav-panel a:hover { background: var(--nav-menu-hover); }
.nav-hoverable:hover { background: var(--nav-hover); }
.nav-mobile { border-top: 1px solid var(--nav-border); }
.nav-root[data-display] .nav-panel { font-size: 1.5rem; }
.nav-root[data-display] .nav-mobile { text-align: center; font-size: 1.25rem; }

/* stage */
.nav-stage { color: var(--nav-fg); }
.nav-stage[data-stage="hero"] { color: inherit; }
.nav-stage[data-stage="events"] { padding-top: var(--nav-offset); }
</style>