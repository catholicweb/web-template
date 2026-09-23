<script setup>
import { ref, computed, onMounted, onUnmounted } from "vue";
import Image from "./Image.vue";
import Hero from "./Hero.vue";

import { useData, useRoute } from "vitepress";
import EventCards from "./EventCards.vue";
import { getCode } from "./../../utils.js";
const { theme, site, page } = useData();

const config = ref(theme.value.config || {});
const route = useRoute();

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
  if (page.value.frontmatter.lang) return page.value.frontmatter.lang;
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
  const equiv = page.value.frontmatter.equiv;
  if (equiv && equiv.length > 1) return equiv;
  return siteLanguages.value.map((l, i) => ({
    lang: l,
    href: i === 0 ? "/" : "/" + getCode(l) + "/",
  }));
});

const nav = computed(() => {
  let items = theme.value.nav[currentLang.value] || [];
  return items.length === 1 ? items[0].items : items;
});

const navStyle = computed(() => theme?.value?.config?.theme?.navStyle || []);

// Resolved tokens from config.theme.navStyle (array of design tokens).
const tokens = computed(() => resolveNavTokens(navStyle.value));

const hasItems = (item) => item.items && item.items.length > 0;
const isActive = (item) => item.link && (route.path === item.link || route.path.startsWith(item.link + "/"));
const mobileMenuOpen = ref(false);

const langOpen = ref(false);
function closeLang() { langOpen.value = false; }
onMounted(() => document.addEventListener("click", closeLang));
onUnmounted(() => document.removeEventListener("click", closeLang));




const DEFAULT_TOKENS = {
  dark: false,
  transparent: false,
  position: null, // "absolute" | "sticky" | "static" | null
  showEvents: false,
  heroBg: false,
  titleAlignment: null, // "center" | "left" | null
};

/**
 * Resolves navStyle into a flat token object.
 * Handles both arrays (["dark", "transparent"]) and legacy strings
 * ("47herri" → equivalent tokens, "default" or unknown → defaults).
 * @param {Array|string} navStyle
 */
function resolveNavTokens(navStyle) {
  if (!navStyle) return { ...DEFAULT_TOKENS };

  // Legacy string preset → equivalent tokens
  if (typeof navStyle === "string") {
    if (navStyle === "47herri") return tokensFromArray(["dark", "transparent", "showEvents", "heroBg"]);
    return { ...DEFAULT_TOKENS }; // "default" or unknown
  }

  return tokensFromArray(navStyle);
}

function tokensFromArray(tokens) {
  const result = { ...DEFAULT_TOKENS };
  for (const token of tokens) {
    if (typeof token !== "string") continue;
    if (token === "dark") result.dark = true;
    else if (token === "transparent") result.transparent = true;
    else if (token === "showEvents") result.showEvents = true;
    else if (token === "heroBg") result.heroBg = true;
    else if (token.startsWith("position:")) result.position = token.slice(9);
    else if (token.startsWith("titleAlignment:")) result.titleAlignment = token.slice(15);
    else if (token === "sticky") result.position = "sticky";
    else if (token === "static") result.position = "static";
  }
  return result;
}

function navStyleShowEvents(navStyle) {
  return resolveNavTokens(navStyle).showEvents;
}


/**
 * Build class map from design tokens.
 * When tokens match the 47herri signature (dark+transparent+showEvents+heroBg),
 * returns the exact 47herri CSS class strings for pixel-perfect backward compat.
 */
function buildTokenClasses(t) {
  // 47herri signature — exact CSS strings from the previous NAV_STYLES["47herri"]
  if (t.dark && t.transparent && t.showEvents && t.heroBg) {
    return {
      wrapper: "relative w-full text-white font-bold",
      nav: "font-heading bg-gradient-to-b from-black/70 to-black/0 w-full pb-[20px] mb-[-20px]",
      controlsBg: "",
      logo: "text-3xl",
      menu: "text-white text-xl",
      dropdown: "text-white text-2xl",
      dropdownText: "text-black",
      mobile: "text-center text-xl",
      mobileItem: "",
      hero: false,
    };
  }

  let wrapper = "w-full";
  if (t.position === "absolute") wrapper += " absolute";
  else if (t.position === "static") wrapper += " static";
  else wrapper += " top-0 sticky"; // default sticky

  return {
    wrapper: wrapper + (t.transparent ? " backdrop-blur-md bg-white/30 dark:bg-black/30" : " bg-white shadow-sm") + " dark:text-white",
    nav: "bg-white max-w-7xl dark:bg-gray-900",
    controlsBg: "bg-white dark:bg-gray-900",
    logo: "text-xl dark:text-white",
    menu: "bg-white text-md dark:text-white",
    dropdown: "bg-white dark:bg-gray-800 dark:text-white",
    dropdownText: "dark:text-black",
    mobile: "border-t text-md dark:text-white dark:border-gray-700",
    mobileItem: "hover:bg-white dark:hover:bg-gray-800",
    hero: !t.showEvents,
  };
}

// Drives all class bindings in the template.
const classes = computed(() => buildTokenClasses(tokens.value));
</script>

<template>
  <div :data-theme="tokens.dark ? 'dark' : 'light'" :class="[classes.wrapper]" class="z-50 transition-all">
    <!-- 47herri: hero image behind the nav -->
    <Image v-if="tokens.heroBg && $frontmatter.image" :src="$frontmatter.image" alt="" class="z-[-10] absolute inset-0 size-full object-cover" />

    <!-- Standard single-row layout (default, centered, minimal, solid-dark, 47herri) -->
    <nav :class="classes.nav" class="mx-auto px-4 sm:px-6 lg:px-8">
        <div class="flex items-center justify-between h-16">
          <!-- Logo -->
          <div class="flex items-center">
            <a href="/" class="font-bold hover:text-accent" :class="classes.logo">
              {{ config.info.title }}
            </a>
          </div>

                  <!-- Desktop Menu — always shown -->
          <div class="hidden lg:flex items-center space-x-1 font-medium" :class="classes.menu">
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

                <!-- Dropdown Menu -->
                <div class="absolute left-0 mt-0 w-96 rounded-sm shadow-lg opacity-0 group-hover:opacity-100 invisible group-hover:visible transition-all z-50" :class="[classes.dropdown, classes.dropdownText]">
                  <template v-for="section in item.items" :key="section.text">
                    <a :href="section.link" class="block px-3 py-2 rounded-sm hover:bg-white dark:hover:bg-gray-700 hover:text-accent transition-colors" :class="isActive(section) ? 'text-accent' : ''">
                      {{ section.text }}
                    </a>
                  </template>
                </div>
              </div>
            </template>
          </div>

          <!-- Right controls (language switcher, mobile menu button, etc.) -->
          <div class="flex items-center space-x-2" :class="classes.controlsBg">
            <!-- Language Switcher -->
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

            <!-- Mobile Menu Button — hidden on lg, visible on mobile -->
            <button @click="mobileMenuOpen = !mobileMenuOpen" class="lg:hidden px-2 py-1 rounded-sm hover:bg-white dark:hover:bg-gray-700 transition-colors hover:text-accent" aria-label="Toggle Mobile Menu">
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

    <!-- Event cards below nav (when showEvents token is set) -->
    <EventCards v-if="tokens.showEvents && !$frontmatter.hideHero && !page.isNotFound" :block="{ events: $frontmatter.events, tags: ['carousel'], query: false }" class="w-full" />
  </div>

  <!-- Hero Component (shown when showEvents is off, and when not hidden) -->
  <Hero v-if="!tokens.showEvents && !$frontmatter.hideHero && !page.isNotFound" :block="$frontmatter" :nav-style="navStyle" />
</template>