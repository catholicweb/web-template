<script setup>
import { ref, computed, onMounted, onUnmounted } from "vue";
import Image from "./Image.vue";
import Hero from "./Hero.vue";

import { useData, useRoute } from "vitepress";
import EventCards from "./EventCards.vue";
import { getCode } from "./../../naming.js";
const { theme, site, page } = useData();
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

const navStyle = computed(() => site?.value?.themeConfig?.config?.theme?.navStyle || "default");

const hasItems = (item) => item.items && item.items.length > 0;
const isActive = (item) => item.link && (route.path === item.link || route.path.startsWith(item.link + "/"));
const mobileMenuOpen = ref(false);

const langOpen = ref(false);
function closeLang() { langOpen.value = false; }
onMounted(() => document.addEventListener("click", closeLang));
onUnmounted(() => document.removeEventListener("click", closeLang));

const NAV_STYLES = {
  default: {
    wrapper: "top-0 sticky bg-white shadow-sm",
    nav: "bg-white max-w-7xl",
    controlsBg: "bg-white",
    logo: "text-xl",
    menu: "bg-white text-md",
    dropdown: "bg-white",
    dropdownText: "",
    mobile: "border-t text-md",
    mobileItem: "hover:bg-white",
    hero: true,
    showDesktopMenu: true,
    centered: false,
    twoRow: false,
    absolute: false,
    fullBleed: false,
    heroBg: false,
  },
  "47herri": {
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
    showDesktopMenu: true,
    centered: false,
    twoRow: false,
    absolute: true,
    fullBleed: true,
    heroBg: true,
  },
  centered: {
    wrapper: "top-0 sticky bg-white shadow-sm",
    nav: "bg-white max-w-7xl",
    controlsBg: "bg-white",
    logo: "text-xl",
    menu: "bg-white text-md",
    dropdown: "bg-white",
    dropdownText: "",
    mobile: "border-t text-md",
    mobileItem: "hover:bg-white",
    hero: true,
    showDesktopMenu: true,
    centered: true,
    twoRow: false,
    absolute: false,
    fullBleed: false,
    heroBg: false,
  },
  minimal: {
    wrapper: "top-0 sticky bg-white shadow-sm",
    nav: "bg-white max-w-7xl",
    controlsBg: "bg-white",
    logo: "text-xl",
    menu: "bg-white text-md",
    dropdown: "bg-white",
    dropdownText: "",
    mobile: "border-t text-md",
    mobileItem: "hover:bg-white",
    hero: true,
    showDesktopMenu: false,
    centered: false,
    twoRow: false,
    absolute: false,
    fullBleed: false,
    heroBg: false,
  },
  "two-row": {
    wrapper: "top-0 sticky bg-white shadow-sm",
    nav: "bg-white max-w-7xl",
    controlsBg: "bg-white",
    logo: "text-2xl",
    menu: "bg-white text-md",
    dropdown: "bg-white",
    dropdownText: "",
    mobile: "border-t text-md",
    mobileItem: "hover:bg-white",
    hero: true,
    showDesktopMenu: true,
    centered: false,
    twoRow: true,
    absolute: false,
    fullBleed: false,
    heroBg: false,
  },
  "solid-dark": {
    wrapper: "top-0 sticky bg-gray-900 text-white shadow-md",
    nav: "bg-gray-900 max-w-7xl",
    controlsBg: "bg-gray-900",
    logo: "text-xl text-white",
    menu: "text-white text-md",
    dropdown: "bg-gray-800 text-white",
    dropdownText: "",
    mobile: "border-t border-gray-700 text-md text-white",
    mobileItem: "hover:bg-gray-800",
    hero: true,
    showDesktopMenu: true,
    centered: false,
    twoRow: false,
    absolute: false,
    fullBleed: false,
    heroBg: false,
  },
};

const s = computed(() => NAV_STYLES[navStyle.value] || NAV_STYLES.default);
</script>

<template>
  <div :class="[s.wrapper]" class="z-50 transition-all">
    <!-- 47herri: hero image behind the nav -->
    <Image v-if="s.heroBg" :src="$frontmatter.image" alt="" class="z-[-10] absolute inset-0 size-full object-cover" />

    <!-- Two-row layout: logo + controls on top row, nav links centered below -->
    <template v-if="s.twoRow">
      <div class="mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl">
        <div class="flex items-center justify-between h-16">
          <a href="/" class="font-bold hover:text-accent" :class="s.logo">
            {{ site.title }}
          </a>

          <div class="flex items-center space-x-2" :class="s.controlsBg">
            <!-- Language Switcher -->
            <div v-if="langEntries.length > 1" class="relative" @click.stop>
              <button @click="langOpen = !langOpen" class="px-2 py-1 rounded-sm dark:hover:bg-gray-700 hover:text-accent transition-colors flex items-center space-x-1">
                <span>{{ currentLang.split(":")[0] }}</span>
                <svg class="w-4 h-4 transition-transform" :class="langOpen ? 'rotate-180' : ''" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M5.23 7.21a.75.75 0 011.06 0L10 10.91l3.71-3.7a.75.75 0 111.06 1.06l-4.24 4.24a.75.75 0 01-1.06 0L5.23 8.27a.75.75 0 010-1.06z" />
                </svg>
              </button>
              <div v-show="langOpen" class="absolute right-0 w-36 shadow-lg rounded-sm z-50 bg-white">
                <a v-for="equiv in langEntries" :key="equiv.lang" :href="equiv.href" class="block px-3 py-2 rounded-sm dark:hover:bg-gray-700 cursor-pointer transition-colors" :class="equiv.lang === currentLang ? 'text-accent' : ''">
                  {{ equiv.lang.split(":")[0] }}
                </a>
              </div>
            </div>

            <!-- Mobile Menu Button -->
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
      </div>
      <nav :class="s.nav" class="mx-auto px-4 sm:px-6 lg:px-8">
        <div class="hidden lg:flex items-center justify-center space-x-1 font-medium py-2 border-t border-gray-200" :class="s.menu">
          <template v-for="item in nav" :key="item.text">
            <div v-if="!hasItems(item)">
              <a :href="item.link" :class="['px-4 py-2 rounded-sm', isActive(item) ? 'text-accent' : 'hover:text-accent']">
                {{ item.text }}
              </a>
            </div>
            <div v-else class="relative group">
              <button class="px-4 py-2 hover:text-accent transition-colors flex items-center gap-1">
                {{ item.text }}
                <svg class="w-4 h-4 transition-transform group-hover:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              <div class="absolute left-0 mt-0 w-96 rounded-sm shadow-lg opacity-0 group-hover:opacity-100 invisible group-hover:visible transition-all z-50" :class="[s.dropdown]">
                <template v-for="section in item.items" :key="section.text">
                  <a :href="section.link" class="block px-3 py-2 rounded-sm hover:bg-white dark:hover:bg-gray-700 hover:text-accent transition-colors" :class="isActive(section) ? 'text-accent' : ''">
                    {{ section.text }}
                  </a>
                </template>
              </div>
            </div>
          </template>
        </div>

        <!-- Mobile Menu -->
        <div v-show="mobileMenuOpen" class="lg:hidden" :class="s.mobile">
          <div class="px-2 pt-2 pb-3 space-y-1">
            <template v-for="item in nav" :key="item.text">
              <div v-if="!hasItems(item)">
                <a :href="item.link" @click="mobileMenuOpen = false" class="block px-3 py-1 rounded-sm transition-colors hover:text-accent" :class="s.mobileItem">
                  {{ item.text }}
                </a>
              </div>
              <div v-else>
                <details class="group">
                  <summary class="font-bold px-3 py-2 rounded-sm flex justify-between items-center cursor-pointer hover:text-accent" :class="s.mobileItem">
                    <span>{{ item.text }}</span>
                    <svg class="w-4 h-4 transition-transform group-open:rotate-180" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M5.23 7.21a.75.75 0 011.06 0L10 10.91l3.71-3.7a.75.75 0 111.06 1.06l-4.24 4.24a.75.75 0 01-1.06 0L5.23 8.27a.75.75 0 010-1.06z" />
                    </svg>
                  </summary>
                  <div class="pl-4 space-y-1 mt-1">
                    <template v-for="section in item.items" :key="section.text">
                      <a @click="mobileMenuOpen = false" :href="section.link" class="block px-3 py-2 rounded-sm transition-colors hover:text-accent" :class="s.mobileItem">
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
    </template>

    <!-- Standard single-row layout (default, centered, minimal, solid-dark, 47herri) -->
    <template v-else>
      <nav :class="s.nav" class="mx-auto px-4 sm:px-6 lg:px-8">
        <div class="flex items-center justify-between h-16">
          <!-- Logo -->
          <div class="flex items-center">
            <a href="/" class="font-bold hover:text-accent" :class="s.logo">
              {{ site.title }}
            </a>
          </div>

          <!-- Desktop Menu — hidden for minimal style, flex-1 center for centered style -->
          <div v-if="s.showDesktopMenu" class="hidden lg:flex items-center space-x-1 font-medium" :class="[s.menu, s.centered ? 'flex-1 justify-center' : '']">
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
                <div class="absolute left-0 mt-0 w-96 rounded-sm shadow-lg opacity-0 group-hover:opacity-100 invisible group-hover:visible transition-all z-50" :class="[s.dropdown, s.dropdownText]">
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
          <div class="flex items-center space-x-2" :class="s.controlsBg">
            <!-- Language Switcher -->
            <div v-if="langEntries.length > 1" class="relative" :class="navStyle == '47herri' ? '' : ''" @click.stop>
              <button @click="langOpen = !langOpen" class="px-2 py-1 rounded-sm dark:hover:bg-gray-700 hover:text-accent transition-colors flex items-center space-x-1" :class="[navStyle == '47herri' ? '' : 'hover:bg-white']">
                <span>{{ currentLang.split(":")[0] }}</span>
                <svg class="w-4 h-4 transition-transform" :class="langOpen ? 'rotate-180' : ''" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M5.23 7.21a.75.75 0 011.06 0L10 10.91l3.71-3.7a.75.75 0 111.06 1.06l-4.24 4.24a.75.75 0 01-1.06 0L5.23 8.27a.75.75 0 010-1.06z" />
                </svg>
              </button>
              <div v-show="langOpen" class="absolute right-0 w-36 shadow-lg rounded-sm z-50 bg-white" :class="navStyle == '47herri' ? 'text-black' : ''">
                <a v-for="equiv in langEntries" :key="equiv.lang" :href="equiv.href" class="block px-3 py-2 rounded-sm dark:hover:bg-gray-700 cursor-pointer transition-colors" :class="equiv.lang === currentLang ? 'text-accent' : ''">
                  {{ equiv.lang.split(":")[0] }}
                </a>
              </div>
            </div>

            <!-- Mobile Menu Button — always visible for minimal, hidden lg for others -->
            <button @click="mobileMenuOpen = !mobileMenuOpen" :class="s.showDesktopMenu ? 'lg:hidden' : ''" class="px-2 py-1 rounded-sm hover:bg-white dark:hover:bg-gray-700 transition-colors hover:text-accent" aria-label="Toggle Mobile Menu">
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
        <div v-show="mobileMenuOpen" class="lg:hidden" :class="s.mobile">
          <div class="px-2 pt-2 pb-3 space-y-1">
            <template v-for="item in nav" :key="item.text">
              <div v-if="!hasItems(item)">
                <a :href="item.link" @click="mobileMenuOpen = false" class="block px-3 py-1 rounded-sm transition-colors hover:text-accent" :class="s.mobileItem">
                  {{ item.text }}
                </a>
              </div>
              <div v-else>
                <details class="group">
                  <summary class="font-bold px-3 py-2 rounded-sm flex justify-between items-center cursor-pointer hover:text-accent" :class="s.mobileItem">
                    <span>{{ item.text }}</span>
                    <svg class="w-4 h-4 transition-transform group-open:rotate-180" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M5.23 7.21a.75.75 0 011.06 0L10 10.91l3.71-3.7a.75.75 0 111.06 1.06l-4.24 4.24a.75.75 0 01-1.06 0L5.23 8.27a.75.75 0 010-1.06z" />
                    </svg>
                  </summary>
                  <div class="pl-4 space-y-1 mt-1">
                    <template v-for="section in item.items" :key="section.text">
                      <a @click="mobileMenuOpen = false" :href="section.link" class="block px-3 py-2 rounded-sm transition-colors hover:text-accent" :class="s.mobileItem">
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
    </template>

    <!-- 47herri: event cards below the nav (takes hero slot) -->
    <EventCards v-if="navStyle == '47herri' && !$frontmatter.hideHero && !page.isNotFound" :block="{ events: $frontmatter.events }" class="w-full" />
  </div>

  <!-- Hero Component (shown for all styles except 47herri, which uses EventCards instead) -->
  <Hero v-if="s.hero && !$frontmatter.hideHero && !page.isNotFound" :block="$frontmatter" />
</template>