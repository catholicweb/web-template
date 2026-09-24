<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from "vue";
import Image from "./Image.vue";
import Hero from "./Hero.vue";

import { useData, useRoute } from "vitepress";
import EventCards from "./EventCards.vue";
import { getCode } from "./../../utils.js";
const { theme, site, page } = useData();
const route = useRoute();

// Frontmatter of the current page (single source instead of mixing $frontmatter / page.frontmatter)
const fm = computed(() => page.value.frontmatter || {});

// Kept reactive (the old `ref(theme.value.config)` snapshot never updated)
const title = computed(() => theme.value?.config?.info?.title || "");
const accentHue = computed(() => theme.value?.config?.theme?.accentHue);

// Languages from site config (e.g. ["Español:es", "Euskara:eu"]), falling back
// to nav keys (which are also language strings). Always available on every
// page because they're part of themeConfig.config — not page frontmatter.
const siteLanguages = computed(() => {
  const langs = theme.value?.config?.languages;
  if (langs?.length) return langs;
  return Object.keys(theme.value.nav || {});
});

// Current language key (e.g. "Español:es") for nav lookup + display.
// On 404 routes VitePress provides notFoundPageData with frontmatter
// { sidebar:false, layout:'page' } — no `lang` — so we derive it from
// the locale (site.value.lang, resolved from URL path even on 404s).
const currentLang = computed(() => {
  if (fm.value.lang) return fm.value.lang;
  const localeLang = site.value?.lang;
  if (localeLang) {
    const found = siteLanguages.value.find((l) => l.split(":")[1] === localeLang);
    if (found) return found;
  }
  return Object.keys(theme.value.nav || {})[0] || "";
});

// Language switcher entries — use frontmatter.equiv when available
// (built pages), otherwise build from the site's languages list (404 pages).
// On a 404 there's no equivalent page in other languages, so we link to each
// language's home page — the same destination the switcher offers on homepages.
const langEntries = computed(() => {
  const equiv = fm.value.equiv;
  if (equiv && equiv.length > 1) return equiv;
  return siteLanguages.value.map((l, i) => ({
    lang: l,
    href: i === 0 ? "/" : "/" + getCode(l) + "/",
  }));
});

const nav = computed(() => {
  let items = theme.value.nav?.[currentLang.value] || [];
  return items.length === 1 ? items[0].items : items;
});

const hasItems = (item) => item.items && item.items.length > 0;
const isActive = (item) => item.link && (route.path === item.link || route.path.startsWith(item.link + "/"));

const mobileMenuOpen = ref(false);
watch(() => route.path, () => (mobileMenuOpen.value = false));

const langOpen = ref(false);
function closeLang() { langOpen.value = false; }
onMounted(() => document.addEventListener("click", closeLang));
onUnmounted(() => document.removeEventListener("click", closeLang));

/* ------------------------------------------------------------------ *
 * Design tokens
 *
 * config.theme.navStyle is an array of tokens (a bare string is also
 * accepted). Later tokens win, so presets can be tweaked:
 *
 *   ["47herri"]                       → exactly today's 47herri look
 *   ["47herri", "sticky"]             → preset + extra token
 *   ["47herri", "!showEvents"]        → "!" switches a token off
 *   ["dark", "transparent", "sticky", "align:center", "accent"]
 *
 * Flags:
 *   showEvents   EventCards under the nav (instead of <Hero>)
 *   hideHero     no hero / event cards (frontmatter hideHero|hidehero wins)
 *   heroBg       page hero image ($frontmatter.image) behind the whole header
 *   transparent  glass nav; over a heroBg image → gradient scrim instead
 *   dark         dark scheme for the header (sets data-theme="dark")
 *   sticky       stick to top (default: static)
 *   display      big / bold / font-heading typography
 *   compact      shorter bar (h-12)
 *   accent       solid bg tinted with config.theme.accentHue
 * Valued:
 *   align:left | align:center   title position (center = menu | title | controls)
 * ------------------------------------------------------------------ */
const DEFAULTS = {
  showEvents: false,
  hideHero: false,
  heroBg: false,
  transparent: true,
  dark: false,
  sticky: false,
  display: false,
  compact: false,
  accent: true,
  align: "center",
};

const PRESETS = {
  "47herri": ["heroBg", "showEvents", "dark", "transparent", "display"],
};

const tokens = computed(() => resolveNavTokens(theme.value?.config?.theme?.navStyle));

function resolveNavTokens(input) {
  const list = typeof input === "string" ? [input] : Array.isArray(input) ? input : [];
  const out = { ...DEFAULTS };

  const apply = (raw) => {
    if (typeof raw !== "string") return;
    if (PRESETS[raw]) return PRESETS[raw].forEach(apply);

    const off = raw.startsWith("!");
    const [key, val] = (off ? raw.slice(1) : raw).split(":");

    if (key === "static") out.sticky = off; // convenience opposite of "sticky"
    else if (key === "align" && ["left", "center"].includes(val)) out.align = off ? "left" : val;
    else if (typeof DEFAULTS[key] === "boolean" && val === undefined) out[key] = !off;
    else if (import.meta.env?.DEV) console.warn(`[Navbar] unknown navStyle token: "${raw}"`);
  };

  list.forEach(apply);
  return out;
}

/* ------------------------------------------------------------------ *
 * Data-dependent visibility
 * ------------------------------------------------------------------ */
// Frontmatter wins in both directions (hideHero: false re-enables it).
const hideHero = computed(() => {
  const f = fm.value.hideHero ?? fm.value.hidehero;
  return f !== undefined ? !!f : tokens.value.hideHero;
});
const headerContentVisible = computed(() => !hideHero.value && !page.value.isNotFound);

const showBgImage = computed(() => tokens.value.heroBg && !!fm.value.image);
const showEvents = computed(() => tokens.value.showEvents && headerContentVisible.value);
// Nothing to draw without an image or a title
const showHero = computed(() => !tokens.value.showEvents && headerContentVisible.value && !!(fm.value.image || fm.value.title));
const eventsBlock = computed(() => ({ events: fm.value.events, tags: ["carousel"], query: false }));

/* ------------------------------------------------------------------ *
 * Tokens → classes (composed per token, no "signature" matching).
 * The 47herri preset yields the same class set as the old NAV_STYLES entry.
 * ------------------------------------------------------------------ */
const classes = computed(() => {
  const t = tokens.value;
  const overlay = t.transparent && t.heroBg; // nav text sits directly on the hero image

  // wrapper
  let wrapper = "w-full " + (t.sticky ? "sticky top-0" : "relative");
  wrapper += t.dark ? " text-white" : " dark:text-white";
  if (t.display) wrapper += " font-bold";
  if (!overlay) {
    if (t.transparent) wrapper += t.dark ? " backdrop-blur-md bg-black/30" : " backdrop-blur-md bg-white/30 dark:bg-black/30";
    else wrapper += t.dark ? " bg-gray-900 shadow-sm" : " bg-white shadow-sm dark:bg-gray-900";
  }

  // nav bar
  let navBar = overlay
    ? "w-full bg-gradient-to-b " + (t.dark ? "from-black/70 to-black/0" : "from-white/70 to-white/0") + " pb-[20px] mb-[-20px]"
    : "max-w-7xl";
  if (t.display) navBar += " font-heading";

  return {
    wrapper,
    nav: navBar,
    height: t.compact ? "h-12" : "h-16",
    row: t.align === "center" ? "lg:grid lg:grid-cols-3" : "",
    logoBox: t.align === "center" ? "lg:order-2 lg:justify-self-center" : "",
    menuBox: t.align === "center" ? "lg:order-1" : "",
    controlsBox: t.align === "center" ? "lg:order-3 lg:justify-self-end" : "",
    logo: t.display ? "text-3xl" : "text-xl",
    menu: t.display ? "text-xl" : "text-base",
    dropdown: (t.display ? "text-2xl " : "") + (overlay ? "dark:text-white text-black" : "bg-white text-gray-900 dark:bg-gray-800 dark:text-white"),
    mobile: (t.display ? "text-center text-xl" : "text-base") + (overlay ? "" : " border-t dark:border-gray-700"),
    mobileItem: overlay ? "" : "hover:bg-black/5 dark:hover:bg-white/10",
  };
});

// accent token: solid background tinted with theme.accentHue (ignored if no hue / not solid)
const wrapperStyle = computed(() => {
  const t = tokens.value;
  const hue = accentHue.value;
  if (!t.accent || hue == null || t.transparent) return undefined;
  return { backgroundColor: t.dark ? `oklch(74% 0.2 ${hue})` : `oklch(54% 0.2 ${hue})` };
});

console.log(wrapperStyle.value, tokens.value, accentHue.value)
</script>

<template>
  <div :data-theme="tokens.dark ? 'dark' : 'light'" :class="classes.wrapper" :style="wrapperStyle" class="z-50 transition-all">
    <!-- Hero image behind the whole header (nav + event cards) -->
    <Image v-if="showBgImage" :src="fm.image" alt="" class="z-[-10] absolute inset-0 size-full object-cover" />

    <nav :class="classes.nav" class="mx-auto px-4 sm:px-6 lg:px-8">
      <div class="flex items-center justify-between" :class="[classes.height, classes.row]">
        <!-- Logo / title (only when there is one) -->
        <div class="flex items-center" :class="classes.logoBox">
          <a v-if="title" href="/" class="font-bold hover:text-accent" :class="classes.logo">
            {{ title }}
          </a>
        </div>

        <!-- Desktop Menu -->
        <div class="hidden lg:flex items-center space-x-1 font-medium" :class="[classes.menu, classes.menuBox]">
          <template v-for="item in nav" :key="item.text">
            <!-- Simple link -->
            <div v-if="!hasItems(item)">
              <a :href="item.link" :class="['px-4 py-2 rounded-sm', isActive(item) ? 'text-accent' : 'hover:text-accent']">
                {{ item.text }}
              </a>
            </div>

            <!-- Dropdown -->
            <div v-else class="relative group">
              <button class="px-4 py-2 hover:text-accent transition-colors flex items-center gap-1">
                {{ item.text }}
                <svg class="w-4 h-4 transition-transform group-hover:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              <div class="absolute left-0 mt-0 w-96 rounded-sm shadow-lg opacity-0 group-hover:opacity-100 invisible group-hover:visible transition-all z-50" :class="classes.dropdown">
                <template v-for="section in item.items" :key="section.text">
                  <a :href="section.link" class="block px-3 py-2 rounded-sm hover:bg-white dark:hover:bg-gray-700 hover:text-accent transition-colors" :class="isActive(section) ? 'text-accent' : ''">
                    {{ section.text }}
                  </a>
                </template>
              </div>
            </div>
          </template>
        </div>

        <!-- Right controls -->
        <div class="flex items-center space-x-2" :class="classes.controlsBox">
          <!-- Language Switcher (only with 2+ entries) -->
          <div v-if="langEntries.length > 1" class="relative" @click.stop>
            <button @click="langOpen = !langOpen" class="px-2 py-1 rounded-sm dark:hover:bg-gray-700 hover:text-accent transition-colors flex items-center space-x-1 hover:bg-white dark:hover:bg-transparent" aria-label="Toggle Language">
              <span>{{ currentLang.split(":")[0] }}</span>
              <svg class="w-4 h-4 transition-transform" :class="langOpen ? 'rotate-180' : ''" fill="currentColor" viewBox="0 0 20 20">
                <path d="M5.23 7.21a.75.75 0 011.06 0L10 10.91l3.71-3.7a.75.75 0 111.06 1.06l-4.24 4.24a.75.75 0 01-1.06 0L5.23 8.27a.75.75 0 010-1.06z" />
              </svg>
            </button>
            <div v-show="langOpen" class="absolute right-0 w-36 shadow-lg rounded-sm z-50 bg-white dark:text-black">
              <a v-for="equiv in langEntries" :key="equiv.lang" :href="equiv.href" class="block px-3 py-2 rounded-sm dark:hover:bg-gray-700 cursor-pointer transition-colors" :class="equiv.lang === currentLang ? 'text-accent' : ''">
                {{ equiv.lang.split(":")[0] }}
              </a>
            </div>
          </div>

          <!-- Mobile Menu Button -->
          <button @click="mobileMenuOpen = !mobileMenuOpen" class="lg:hidden px-2 py-1 rounded-sm hover:bg-white dark:hover:bg-gray-700 transition-colors hover:text-accent" aria-label="Toggle Mobile Menu" :aria-expanded="mobileMenuOpen">
            <svg v-if="!mobileMenuOpen" class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
            <svg v-else class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      <!-- Mobile Menu -->
      <div v-show="mobileMenuOpen" class="lg:hidden" :class="classes.mobile">
        <div class="px-2 pt-2 pb-3 space-y-1">
          <template v-for="item in nav" :key="item.text">
            <div v-if="!hasItems(item)">
              <a :href="item.link" @click="mobileMenuOpen = false" class="block px-3 py-1 rounded-sm transition-colors hover:text-accent" :class="classes.mobileItem">
                {{ item.text }}
              </a>
            </div>
            <div v-else>
              <details class="group">
                <summary class="font-bold px-3 py-2 rounded-sm flex justify-between items-center cursor-pointer hover:text-accent" :class="classes.mobileItem">
                  <span>{{ item.text }}</span>
                  <svg class="w-4 h-4 transition-transform group-open:rotate-180" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M5.23 7.21a.75.75 0 011.06 0L10 10.91l3.71-3.7a.75.75 0 111.06 1.06l-4.24 4.24a.75.75 0 01-1.06 0L5.23 8.27a.75.75 0 010-1.06z" />
                  </svg>
                </summary>
                <div class="pl-4 space-y-1 mt-1">
                  <template v-for="section in item.items" :key="section.text">
                    <a @click="mobileMenuOpen = false" :href="section.link" class="block px-3 py-2 rounded-sm transition-colors hover:text-accent" :class="classes.mobileItem">
                      {{ section.text }}
                    </a>
                  </template>
                </div>
              </details>
            </div>
          </template>
        </div>
      </div>
    </nav>

    <!-- Event cards below nav -->
    <EventCards v-if="showEvents" :block="eventsBlock" class="w-full" />
  </div>

  <!-- Hero (when event cards are off, not hidden, and there is something to show) -->
  <Hero v-if="showHero" :block="fm" :tokens="tokens" />
</template>