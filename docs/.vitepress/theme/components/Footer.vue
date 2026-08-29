<template>
  <footer class="border-t border-gray-700 pt-8 mt-16 pb-4" :class="footerClass">
    <div class="container mx-auto px-4">

      <!-- ===== MAIN FOOTER INFOR === -->
        <div class="gap-8 text-center mb-8 flex flex-col md:flex-row *:mb-4">

        <!-- Contact information -->
        <div v-if="showContact" class="flex-1">
          <h3 class="text-xl font-semibold mb-3">Contacto</h3>
          <div class="flex flex-col space-y-2 items-center">
            <template v-for="(collab, index) in config.info.collaborators">
              <a v-if="collab.phonenumber" :href="`tel:+34${collab.phonenumber.replace(/\s/g, '')}`" class="flex items-center transition-colors">
                <svg class="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
                </svg>
                <span>{{ collab.name }}</span>
              </a>
              <a v-if="getEmail(collab.social)" :href="`mailto:${getEmail(collab.social)}`" class="flex items-center transition-colors">
                <svg class="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
                  <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
                </svg>
                <span>{{ getEmail(collab.social) }}</span>
              </a>
            </template>
          </div>
        </div>

        <!-- Description + Social Column (auto: only if has data) -->
        <div v-if="showDescription" class="flex-1">
          <h3 class="text-xl font-semibold mb-3">{{ config.info.title }}</h3>
          <p class="mb-2" v-if="config.info.description">{{ config.info.description }}</p>
          <div v-if="showSocial" class="flex gap-4 items-center mx-auto justify-center">
            <template v-for="(href, index) in config.info.social">

              <a v-if="href.includes('youtube')" target="_blank" rel="noopener noreferrer" aria-label="Check our Youtube channel" :href="href" class="inline-block hover:text-red-500 transition-colors">
                <svg class="w-10 h-10" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
                </svg>
              </a>

              <a v-else-if="getEmail([href])" aria-label="Send us an email" :href="'mailto:'+getEmail([href])" class="inline-block hover:text-accent transition-colors">
                <svg class="w-10 h-10" fill="currentColor" viewBox="52 42 88 66">
                  <path d="M58 108h14V74L52 59v43c0 3.32 2.69 6 6 6"/>
                  <path d="M120 108h14c3.32 0 6-2.69 6-6V59l-20 15"/>
                  <path d="M120 48v26l20-15v-8c0-7.42-8.47-11.65-14.4-7.2"/>
                  <path d="M72 74V48l24 18 24-18v26L96 92"/>
                  <path d="M52 51v8l20 15V48l-5.6-4.2c-5.94-4.45-14.4-.22-14.4 7.2"/>
                </svg>
              </a>

              <a v-else-if="href.includes('instagram')" target="_blank" rel="noopener noreferrer" aria-label="Check our Instagram channel" :href="href" class="inline-block hover:text-pink-500 transition-colors">
                <svg class="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
                </svg>
              </a>

              <a v-else-if="href.includes('twitter')" target="_blank" rel="noopener noreferrer" aria-label="Check our Twitter/X" :href="href" class="inline-block hover:text-gray-700 transition-colors">
                <svg class="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126h3.117z" />
                </svg>
              </a>

              <a v-else-if="href.includes('tiktok')" target="_blank" rel="noopener noreferrer" aria-label="Check our Tiktok" :href="href" class="inline-block hover:text-[#ff0050] transition-colors">
                <svg class="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z" />
                </svg>
              </a>

              <a v-else-if="href.includes('twitch')" target="_blank" rel="noopener noreferrer" aria-label="Check our twitch" :href="href" class="inline-block hover:text-purple-500 transition-colors">
                <svg class="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h3.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714Z" />
                </svg>
              </a>

              <a v-else-if="href.includes('facebook')" target="_blank" rel="noopener noreferrer" aria-label="Check our Facebook" :href="href" class="inline-block hover:text-blue-600 transition-colors">
                <svg class="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                </svg>
              </a>

              <a v-else target="_blank" rel="noopener noreferrer" aria-label="Check our social media" :href="href" class="inline-block hover:text-accent transition-colors">
                <svg class="w-8 h-8" fill="currentColor" viewBox="0 0 24 24"><path fill="currentColor" fill-rule="evenodd" d="M12 1a11 11 0 1 1 0 22a11 11 0 1 1 0-22 M12 5.5 a3.5 3.5 0 1 0 0 7 a3.5 3.5 0 1 0 0-7 M6 19 c0-3.5 3-6 6-6 s6 2.5 6 6 z" /></svg>
              </a>
            </template>
          </div>
        </div>

        <!-- Bank Column (auto: only if has data) -->
        <div v-if="showBank" class="flex-1">
          <h3 class="text-xl font-semibold mb-3">Ayuda económica</h3>
          <div class="space-y-1">
            <template v-for="(bank, index) in config.info.bank">
              <p v-if="bank.account.includes('https://')">
                <strong>{{ bank.title }}: </strong><a :href="bank.account">Donar</a>
              </p>
              <p v-else>
                <strong>{{ bank.title }}: </strong>{{ bank.account }}
              </p>
            </template>
          </div>
        </div>

        <!-- Expanded only: sitemap / nav links column -->
        <div v-if="footerStyle === 'expanded' && sitemapLinks.length" class="flex-1">
          <h3 class="text-xl font-semibold mb-3">Enlaces</h3>
          <div class="flex flex-col space-y-1 items-center">
            <a v-for="link in sitemapLinks" :key="link.text" :href="link.link" class="hover:text-accent transition-colors">
              {{ link.text }}
            </a>
          </div>
        </div>

        <!-- Minimal footer -->
        <div v-if="footerStyle === 'minimal'" class="flex-1 text-center mb-6">
          <div class="flex flex-col items-center space-y-1">
            <template v-if="firstContact">
              <a v-if="firstContact.phonenumber" :href="`tel:+34${firstContact.phonenumber.replace(/\s/g, '')}`" class="hover:text-accent transition-colors">{{ firstContact.name || firstContact.phonenumber }}</a>
              <a v-else-if="firstContact.email" :href="`mailto:${firstContact.email}`" class="hover:text-accent transition-colors">{{ firstContact.name || firstContact.email }}</a>
            </template>
          </div>
        </div>
      </div>

      <!-- ===== FAQ Section (standard/expanded) ===== -->
      <div v-if="$frontmatter.faq && footerStyle !== 'minimal'" class="mx-auto pt-6 text-xs" :class="grid({ tags: ['small'] })">
        <h3 class="text-xl font-semibold mb-3 sr-only">FAQ</h3>
        <details v-for="(item, index) in $frontmatter.faq" :key="index" class="group cursor-pointer items-center">
          <summary class="list-none font-medium text-gray-500 hover:text-accent transition-colors">
            {{ item.title }}
          </summary>

          <p class="mt-2 italic text-gray-400">
            {{ item.text }}
          </p>
        </details>
      </div>

      <!-- Footer Info (copyright) — shown in all modes -->
      <div class="text-center text-gray-800">
        <p class="text-xs">
          <em> &copy; {{ new Date().getFullYear() }} <a href="https://parroquia.app" class="hover:text-accent transition-colors">parroquia.app </a> — <a href="/aviso-legal-y-politica-de-privacidad" class="hover:text-accent transition-colors"> Aviso Legal y Privacidad</a></em>
        </p>
      </div>
    </div>
  </footer>
</template>

<script setup>
import { ref, computed } from "vue";
import { useData } from "vitepress";
const { theme } = useData();
import { grid } from "./../../utils.js";
const config = ref(theme.value.config || {});
const navStyle = ref(theme.value?.config?.theme?.navStyle);
const footerStyle = ref(theme.value?.config?.theme?.footerStyle || "auto");

const footerClass = ref(navStyle.value == '47herri' ? '[&_*]:text-white bg-[#222831] pt-4' : 'bg-gray-100')

// Data presence checks
const showContact = computed(() => config.value.info.collaborators?.some((c) => c.phonenumber || c.email));
const showSocial = computed(() => config.value.info.social?.length > 0);
const showBank = computed(() => config.value.info.bank?.length > 0);
const showDescription = computed(() => config.value.info.title || config.value.description);

const firstContact = computed(() => {
  if (!config.value.info.collaborators?.length) return null;
  return config.value.info.collaborators.find((c) => c.phonenumber || c.email) || config.value.info.collaborators[0];
});

const sitemapLinks = computed(() => {
  const navData = theme.value?.nav || {};
  const firstLangNav = Object.values(navData)[0];
  if (!Array.isArray(firstLangNav)) return [];
  // Flatten nav items to get top-level links
  const links = [];
  for (const item of firstLangNav) {
    if (item.link) links.push({ text: item.text, link: item.link });
    /*if (item.items) {
      for (const sub of item.items) {
        if (sub.link) links.push({ text: sub.text, link: sub.link });
      }
    }*/
  }
  return links;
});

const getPhone = (social) => social?.find((s) => /^\+?[\d\s().-]{6,}$/.test(s)) || "";
const getEmail = (social) => social?.find((s) => /\S+@\S+\.\S+/.test(s)) || "";
</script>
<style>
summary::-webkit-details-marker {
  display: none;
}
</style>