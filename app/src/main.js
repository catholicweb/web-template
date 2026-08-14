import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";
import { InAppBrowser } from "@capacitor/inappbrowser";

// ---------------------------------------------------------------------------
// Parroquia "home" launcher
//
// On first launch it lists every published parish (fetched live from the
// parroquia API and cached). Once the user picks one, that site opens inside an
// embedded full-screen WebView and the choice is remembered, so every later
// launch opens the saved site directly. The system back button navigates the
// site's history, then closes the WebView back to this picker (see the
// `hardwareBack` option below).
// ---------------------------------------------------------------------------

const IS_NATIVE = Capacitor.isNativePlatform();

// Preferred site URL, and a cached copy of the site list so the picker still
// works offline / before the first network round-trip completes.
const SITE_KEY = "selectedSite";
const CACHE_KEY = "siteListCache";

const API_BASE = "https://api.parroquia.app";
const DATA_BASE = "https://data.parroquia.app";

const listEl = document.getElementById("site-list");
const statusEl = document.getElementById("status");

// --- Persistence ------------------------------------------------------------

async function getSavedSite() {
  const { value } = await Preferences.get({ key: SITE_KEY });
  return value || null;
}

async function saveSite(url) {
  await Preferences.set({ key: SITE_KEY, value: url });
}

// --- Open the chosen place --------------------------------------------------

function openSite(url) {
  if (IS_NATIVE) {
    // Embedded full-screen WebView. The toolbar is hidden for a clean,
    // "real app" feel; on Android `hardwareBack` makes the system back button
    // step through the site's history and, once it is exhausted, close the
    // WebView back to the launcher (the `browserClosed` listener re-renders).
    InAppBrowser.openInWebView({
      url,
      options: {
        showURL: false,
        showToolbar: false,
        clearCache: true,
        clearSessionCache: true,
        mediaPlaybackRequiresUserAction: false,
        closeButtonText: "Cerrar",
        toolbarPosition: 1, // ToolbarPosition.BOTTOM (toolbar is hidden anyway)
        showNavigationButtons: false,
        leftToRight: true,
        android: {
          allowZoom: false,
          hardwareBack: true,
          pauseMedia: true,
        },
        iOS: {
          viewStyle: 2, // iOSViewStyle.FULL_SCREEN
          animationEffect: 0, // iOSAnimation.FLIP_HORIZONTAL
          allowOverScroll: true,
          enableViewportScale: false,
          allowInLineMediaPlayback: true,
          surpressIncrementalRendering: false,
          allowsBackForwardNavigationGestures: true,
        },
      },
    }).catch((err) => setStatus("No se pudo abrir la web."));
  } else {
    // Development path (plain browser tab): fall back to a normal link.
    window.open(url, "_blank", "noopener");
  }
}

// --- Fetch the live list of parishes ---------------------------------------

// Mirror of the site factory's resolveMedia() (createFiles.js): absolute URLs
// pass through, legacy `/media/…` tokens are flattened to the site's media base
// (https://data.parroquia.app/<slug>/<token>). Anything else renders as an
// initial-letter chip in the picker.
function resolveIcon(slug, icon) {
  if (!icon) return null;
  if (/^(https?:)?\/\//.test(icon)) return icon;
  if (icon.startsWith("/media/")) {
    const token = icon.replace(/^\/media\//, "").replace(/\//g, "-");
    return `${DATA_BASE}/${slug}/${token}`;
  }
  return null;
}

async function fetchSites() {
  const res = await fetch(`${API_BASE}/sites/list`);
  const { slugs = [] } = await res.json();

  // Resolve each slug's display metadata + canonical URL in parallel. Only
  // sites with a live `dev.siteurl` are publishable — templates ("base",
  // "plantilla", the sample "parroquia") have none and are skipped.
  const sites = await Promise.all(
    slugs.map(async (slug) => {
      try {
        const cfg = await (
          await fetch(`${DATA_BASE}/${slug}/config.json`)
        ).json();
        const url = cfg?.dev?.siteurl;
        if (!url) return null;
        return {
          slug,
          title: cfg?.site?.title || cfg?.title || slug,
          icon: resolveIcon(slug, cfg?.site?.icon || cfg?.theme?.icon || null),
          url,
        };
      } catch {
        return null;
      }
    }),
  );

  return sites.filter(Boolean).sort((a, b) => a.title.localeCompare(b.title));
}

async function getSites() {
  try {
    const sites = await fetchSites();
    await Preferences.set({ key: CACHE_KEY, value: JSON.stringify(sites) });
    return sites;
  } catch (err) {
    // Network failed on first run — fall back to a previously cached list.
    const { value } = await Preferences.get({ key: CACHE_KEY });
    if (value) return JSON.parse(value);
    throw err;
  }
}

// --- Rendering --------------------------------------------------------------

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function setStatus(message) {
  statusEl.textContent = message || "";
}

function render(sites) {
  listEl.innerHTML = "";
  for (const site of sites) {
    const card = document.createElement("a");
    card.className = "site-card";
    card.href = site.url;

    const icon = site.icon
      ? `<img class="site-icon" src="${escapeHtml(site.icon)}" alt="" loading="lazy" referrerpolicy="no-referrer">`
      : `<span class="site-icon site-icon--fallback">${escapeHtml((site.title[0] || "?").toUpperCase())}</span>`;

    card.innerHTML = `${icon}<span class="site-name">${escapeHtml(site.title)}</span>`;
    card.addEventListener("click", async (event) => {
      event.preventDefault();
      await saveSite(site.url);
      openSite(site.url);
    });

    listEl.appendChild(card);
  }
}

async function renderPicker() {
  setStatus("Cargando parroquias…");
  try {
    const sites = await getSites();
    if (!sites.length) {
      setStatus("No hay parroquias disponibles por ahora.");
      return;
    }
    setStatus("");
    render(sites);
  } catch (err) {
    console.error(err);
    setStatus("No se pudo cargar la lista. Comprueba tu conexión.");
  }
}

// --- Boot -------------------------------------------------------------------

async function boot() {
  // When the embedded WebView is closed (system back once history is spent),
  // come back to the picker so the user can switch parish / re-open the saved one.
  try {
    InAppBrowser.addListener("browserClosed", () => renderPicker());
  } catch {
    /* never runs in a browser */
  }

  const saved = await getSavedSite();

  // Cold start in the shell: if a parish is already chosen, go straight to it.
  // In a plain browser tab we don't auto-pop new tabs, so always show the picker.
  if (saved && IS_NATIVE) {
    openSite(saved);
    return;
  }

  await renderPicker();
}

boot();
