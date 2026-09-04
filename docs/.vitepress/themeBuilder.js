/**
 * css.js
 * Takes a theme selection object (shape defined by aesthetic-presets.json) and
 * returns a ready-to-write Tailwind v4 `style.css` string.
 *
 * Usage:
 *   import { generateThemeCSS } from "./css.js";
 *   const css = generateThemeCSS(selection);
 *   fs.writeFileSync("style.css", css);
 *
 * Design notes:
 * - Tailwind v4 reads design tokens from an `@theme` block and turns each
 *   `--color-*`, `--font-*`, `--radius-*`, `--shadow-*`, `--text-*` var into
 *   matching utility classes automatically. We only put TRUE design tokens
 *   in `@theme`.
 * - There is deliberately no separate button "shape" field. Button radius is
 *   just `--radius-lg`, itself derived from the `radius` slider. At the high
 *   end of that slider, the radius value naturally exceeds half the button's
 *   own height, and CSS's own corner-radius clamping renders that as a
 *   perfect pill automatically — square/rounded/pill is a continuous side
 *   effect of one slider, not a fourth thing for the user to decide.
 * - Several schema fields are compound tokens using a "|"-delimited string —
 *   `headerFooterStyle` is "layoutId|dividerShape" (these two always read as
 *   one structural decision, so they're chosen together). `surfaceStyle`
 *   similarly bundles shadow depth + button fill into one choice, since they
 *   only look coherent moving together.
 * - Fields that describe component/layout behavior rather than a single CSS
 *   value (headerFooterStyle, motionIntensity, imageTreatment) are emitted as
 *   plain `:root` custom properties + a small `@layer components` block.
 *   Component markup (header/footer partials, divider SVGs) reads these vars
 *   — this file only owns the CSS side of the contract.
 * - accentHue only feeds `--accent-hue`; the actual `--color-accent-*` shades
 *   are computed with `oklch(L C var(--accent-hue))` directly in CSS. This
 *   means a power user can override just `--accent-hue` (or even a single
 *   shade) post-generation without touching this script. `duotone-accent`
 *   image filter is likewise hue-driven, so retinting accentHue retints
 *   treated images too.
 */

// ---------------------------------------------------------------------------
// Lookup tables — the only things you should need to tune/extend over time.
// ---------------------------------------------------------------------------

// Fixed lightness/chroma curve for the accent ramp. Hue is injected via
// var(--accent-hue), lightness/chroma stay constant across all sites so
// every hue produces a comparably-contrasted ramp.
const ACCENT_SHADE_CURVE = {
  50: { l: 0.97, c: 0.02 },
  100: { l: 0.94, c: 0.04 },
  200: { l: 0.88, c: 0.07 },
  300: { l: 0.8, c: 0.1 },
  400: { l: 0.72, c: 0.13 },
  500: { l: 0.64, c: 0.16 },
  600: { l: 0.56, c: 0.17 },
  700: { l: 0.48, c: 0.16 },
  800: { l: 0.38, c: 0.13 },
  900: { l: 0.28, c: 0.1 },
};

// Google Fonts family -> generic fallback stack, matched by keyword.
// Order matters: first match wins.
const FONT_FALLBACK_RULES = [
  { test: /script|vibes|dancing|caveat|pacifico/i, fallback: "cursive" },
  {
    test: /slab|garamond|playfair|cormorant|crimson|zilla|bitter|alegreya|lora|merriweather|cinzel|baskerville/i,
    fallback: "Georgia, 'Times New Roman', serif",
  },
];
const DEFAULT_FONT_FALLBACK = "system-ui, -apple-system, sans-serif";

// Shadow depth + button fill, chosen together as one "flat vs. dimensional"
// decision (see chat: bold shadows + outline buttons rarely reads as
// intentional, so these two properties no longer vary independently).
const SURFACE_PRESETS = {
  flat: {
    shadow: { sm: "none", md: "none", lg: "none" },
    fill: "outline",
  },
  soft: {
    shadow: {
      sm: "0 1px 2px oklch(0% 0 0 / 0.04)",
      md: "0 2px 6px oklch(0% 0 0 / 0.06), 0 1px 2px oklch(0% 0 0 / 0.04)",
      lg: "0 8px 24px oklch(0% 0 0 / 0.08), 0 2px 6px oklch(0% 0 0 / 0.05)",
    },
    fill: "solid",
  },
  bold: {
    shadow: {
      sm: "0 2px 4px oklch(0% 0 0 / 0.1)",
      md: "0 6px 16px oklch(0% 0 0 / 0.16), 0 2px 4px oklch(0% 0 0 / 0.1)",
      lg: "0 16px 40px oklch(0% 0 0 / 0.22), 0 4px 10px oklch(0% 0 0 / 0.12)",
    },
    fill: "solid",
  },
};

// ---------------------------------------------------------------------------
// Motion intensity: ONE 0-10 dial drives everything motion-related —
// duration/distance/scale magnitude (continuous), which elements animate on
// scroll and with what effect (stepped), and the hover effect (stepped).
// Low levels touch fewer elements with subtler effects; high levels touch
// more elements with more dramatic effects. This intentionally collapses
// what used to be three separate fields (motionIntensity, scrollEffectStyle,
// hoverEffect) into one, so the UI can be a single slider.
// ---------------------------------------------------------------------------

// Magnitude scales continuously with level so the slider feels smooth even
// though the *kind* of effect below snaps at thresholds.
function getMotionMagnitude(level) {
  if (level <= 0) return { duration: "0ms", distance: "0px", scale: "1" };
  return {
    duration: `${450 + level * 35}ms`,
    distance: `${6 + level * 6}px`,
    scale: `${(1 - level * 0.017).toFixed(3)}`,
  };
}

// Semantic target groups scroll effects apply to. Scoped to `main` so
// nav/header chrome never animates; every selector excludes
// [data-no-animate] as a per-element opt-out for component templates.
const SCROLL_EFFECT_TARGETS = {
  heading: "main :is(h1, h2, h3):not([data-no-animate])",
  text: "main :is(p, li):not([data-no-animate])",
  media: "main :is(img, video):not([data-no-animate])",
  quote: "main blockquote:not([data-no-animate])",
};

// Stepped: which target groups get a scroll effect, and which @keyframes
// kind, at each intensity level. Levels not listed inherit the previous
// (lower) tier — see resolveTier(). Ordered low -> high.
const SCROLL_EFFECT_TIERS = [
  { level: 0, targets: {} }, // nothing animates
  { level: 1, targets: { heading: "fade" } },
  { level: 3, targets: { heading: "fade-up", quote: "fade" } },
  { level: 5, targets: { heading: "fade-up", text: "fade-up", quote: "fade" } },
  {
    level: 7,
    targets: { heading: "blur-in", text: "fade-up", media: "scale-in", quote: "fade" },
  },
  {
    level: 9,
    targets: { heading: "blur-in", text: "fade-up", media: "scale-in", quote: "slide-in" },
  },
];

// Stepped: hover effect by intensity level. Top tier combines two effects
// for a more dramatic result.
const HOVER_EFFECT_TIERS = [
  { level: 0, css: null },
  { level: 1, css: "transform: translateY(-4px); box-shadow: var(--shadow-lg);" }, // lift
  { level: 4, css: "box-shadow: 0 0 0 3px var(--color-accent-200);" }, // glow
  { level: 7, css: "transform: scale(1.03);" }, // zoom
  {
    level: 9,
    css: "transform: scale(1.03); box-shadow: 0 0 0 3px var(--color-accent-200);", // zoom + glow
  },
];

// Given a level and an ordered [{level, ...}] tier table, return the entry
// for the highest tier <= level (tiers must be sorted ascending by level).
function resolveTier(level, tiers) {
  return tiers.reduce((acc, tier) => (tier.level <= level ? tier : acc), tiers[0]);
}

const HOVER_EFFECT_TARGET = ".card, img[data-treated], a.hover-effect";

// (no button-shape lookup: --button-radius derives directly from the radius
// scale below — see generateThemeCSS)

const IMAGE_TREATMENT_FILTERS = {
  natural: "none",
  grayscale: "grayscale(1)",
  "warm-filter": "sepia(0.25) saturate(1.15) contrast(1.02)",
  // Real duotone normally needs an SVG feColorMatrix filter, which this CSS-only
  // file can't ship (no <svg> to reference). Instead: grayscale strips color,
  // sepia+saturate manufacture a strong single hue, then hue-rotate spins that
  // hue to match the site's actual accent color. Fully dynamic — retinting the
  // accent hue retints every treated image too, no regeneration needed. This
  // replaces an earlier version of this file where "duotone-accent" silently
  // fell back to plain grayscale — that was a bug, not a design choice.
  "duotone-accent":
    "grayscale(1) sepia(1) saturate(4) hue-rotate(calc((var(--accent-hue) - 30) * 1deg)) contrast(1.05)",
};

const TYPE_SCALE_MULTIPLIERS = {
  compact: 0.9,
  default: 1,
  large: 1.15,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getFontFallback(fontName) {
  const rule = FONT_FALLBACK_RULES.find((r) => r.test.test(fontName));
  return rule ? rule.fallback : DEFAULT_FONT_FALLBACK;
}

function quoteFont(fontName) {
  return `'${fontName.trim()}'`;
}

function camelCase(str) {
  if (!str) return "";
  return str.split(" ").map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join("");
}

function buildGoogleFontsImport(titleFont, bodyFont) {
  const families = [...new Set([titleFont, bodyFont])].map(
    (f) => `family=${encodeURIComponent(f.trim()).replace(/%20/g, "+")}:wght@400;500;600;700`
  );
  return `@import url("https://fonts.googleapis.com/css2?${families.join("&")}&subset=latin,latin-ext&display=swap");`;
}

function buildLocalFontFace(titleFont, bodyFont) {
  const fonts = [...new Set([titleFont, bodyFont])].filter(Boolean);
  return fonts.map((name) => {
    const file = camelCase(name) + ".woff2";
    return `@font-face { font-family: '${name}'; font-style: normal; font-weight: 400; font-display: swap; src: url(/${file}) format('woff2'); }`;
  }).join("\n");
}

function buildAccentRamp() {
  const shades = Object.entries(ACCENT_SHADE_CURVE)
    .map(
      ([shade, { l, c }]) =>
        `  --color-accent-${shade}: oklch(${+(l * 100).toFixed(2)}% ${c} var(--accent-hue));`
    )
    .join("\n");
  // Bare --color-accent (used by Tailwind v4 for text-accent / border-accent / bg-accent)
  return shades + "\n  --color-accent: oklch(64% 0.16 var(--accent-hue));";
}

function clamp01(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

/**
 * Pure-CSS scroll-driven reveal animations (animation-timeline: view()).
 * No JS, no IntersectionObserver. The ENTIRE feature — both the "hidden"
 * starting state and the animation itself — lives inside
 * `@supports (animation-timeline: view())`. That's what makes this fail
 * silently: browsers without support never see the opacity:0 starting
 * state in the first place, they just render the elements normally. There
 * is deliberately no unguarded "from" state anywhere outside @supports.
 *
 * @param {number} level 0-10 motion intensity
 */
function buildScrollEffectCSS(level) {
  const targets = resolveTier(level, SCROLL_EFFECT_TIERS).targets;
  const entries = Object.entries(targets);
  if (entries.length === 0) return "";

  const kinds = [...new Set(entries.map(([, kind]) => kind))];

  const KEYFRAMES = {
    fade: `@keyframes fx-fade { from { opacity: 0; } to { opacity: 1; } }`,
    "fade-up": `@keyframes fx-fade-up { from { opacity: 0; transform: translateY(var(--motion-distance)); } to { opacity: 1; transform: translateY(0); } }`,
    "scale-in": `@keyframes fx-scale-in { from { opacity: 0; transform: scale(var(--motion-scale)); } to { opacity: 1; transform: scale(1); } }`,
    "blur-in": `@keyframes fx-blur-in { from { opacity: 0; filter: blur(10px); } to { opacity: 1; filter: blur(0); } }`,
    "slide-in": `@keyframes fx-slide-in { from { opacity: 0; transform: translateX(calc(var(--motion-distance) * -2)); } to { opacity: 1; transform: translateX(0); } }`,
  };

  const keyframeBlock = kinds.map((k) => KEYFRAMES[k]).join("\n  ");

  const rules = entries
    .map(([target, kind]) => {
      const selector = SCROLL_EFFECT_TARGETS[target];
      return `  ${selector} {
    animation: fx-${kind} linear both;
    animation-timeline: view();
    animation-range: entry 10% cover 35%;
    will-change: opacity, transform;
  }`;
    })
    .join("\n\n");

  const animatedSelectors = entries.map(([target]) => SCROLL_EFFECT_TARGETS[target]);

  return `
/* Scroll-driven reveal effects — pure CSS, feature-detected, no JS.
   Unsupported browsers execute nothing in this block and render normal,
   fully-visible, static content: that's the fallback, by design.
   Intensity level: ${level}/10 */
@supports (animation-timeline: view()) {
  ${keyframeBlock}

${rules}

  /* Respect reduced-motion even where animation-timeline IS supported */
  @media (prefers-reduced-motion: reduce) {
    ${animatedSelectors.join(",\n    ")} {
      animation: none;
    }
  }
}
`;
}

/**
 * @param {number} level 0-10 motion intensity
 */
function buildHoverEffectCSS(level) {
  const declarations = resolveTier(level, HOVER_EFFECT_TIERS).css;
  if (!declarations) return "";

  return `
/* Hover effect — plain CSS, universally supported. Intensity level: ${level}/10 */
${HOVER_EFFECT_TARGET} {
  transition: transform 200ms ease, box-shadow 200ms ease;
}
${HOVER_EFFECT_TARGET
    .split(",")
    .map((s) => s.trim())
    .map((s) => `${s}:hover { ${declarations} }`)
    .join("\n")}
`;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * @param {object} theme - selection object matching aesthetic-presets.json field values
 * @param {number} theme.accentHue         0-360
 * @param {string} theme.fontPair          "Title Font|Body Font"
 * @param {string} theme.typeScale         "compact" | "default" | "large" — usually vibe-set, not user-facing
 * @param {string} theme.headerFooterStyle "layoutId|dividerShape", e.g. "hero-split|wave"
 * @param {number} theme.radius            rem, e.g. 0-1.5
 * @param {number} theme.spacingDensity    multiplier, e.g. 0.8-1.4
 * @param {string} theme.surfaceStyle      "flat" | "soft" | "bold" — drives shadow depth AND button fill together
 * @param {number} theme.motionIntensity   0-10. Single dial driving animation magnitude, which
 *                                          elements get a scroll-reveal effect, and the hover effect.
 * @param {string} theme.imageTreatment    see IMAGE_TREATMENT_FILTERS keys
 * @param {string} [theme.siteImage]       URL
 * @param {string} [theme.siteIcon]        URL
 * @returns {string} full style.css contents
 */
const DEFAULT_THEME = {
  "accentHue": 350,
  "fontPair": "Playfair Display|Source Sans 3",
  "typeScale": "large",
  "radius": 0.25,
  "spacingDensity": 1,
  "motionIntensity": 2,
  "imageTreatment": "natural",
  "headerFooterStyle": "solid-bar-light|straight",
  "surfaceStyle": "soft",
  "typeScale": 1,
  "siteImage": '',
  "siteIcon": '',
  "vibe": {}
};

function sanitize(obj) {
  const out = {};
  for (const k of Object.keys(DEFAULT_THEME)) {
    if (k in obj){
      if (typeof DEFAULT_THEME[k] === 'number') {
        const num = Number(obj[k]);
        out[k] = Number.isNaN(num) ? DEFAULT_THEME[k] : num;
      } else if (typeof obj[k] === 'string') {
        out[k] = /[^a-zA-Z0-9 \-\|]/.test(obj[k])? DEFAULT_THEME[k] : obj[k]
      } else {
        out[k] = DEFAULT_THEME[k]
      }
    } 
  }
  return out;
}

export function generateThemeCSS(rawTheme = {}) {
  // Ensure we never break on null/undefined input
  if (!rawTheme || typeof rawTheme !== 'object') rawTheme = {};

  const defaults = JSON.parse(rawTheme.vibe ?? '{}');

  // Filter out explicit null or undefined entries from user settings
  const userOverrides = Object.fromEntries(
    Object.entries(rawTheme).filter(([_, val]) => val ?? false)
  );

  // Merge with hard defaults first so missing fields never crash
  const merged = { ...DEFAULT_THEME, ...defaults, ...userOverrides };
  const theme = sanitize(merged);

  
  console.log('Building userOverrides with: ', userOverrides)
  console.log('Building defaults with: ', defaults)
  console.log('Building theme with: ', theme)

  const [titleFontRaw, bodyFontRaw] = theme.fontPair.split("|");
  const titleFont = titleFontRaw.trim();
  const bodyFont = bodyFontRaw.trim();
  const typeScale = TYPE_SCALE_MULTIPLIERS[theme.typeScale] ?? 1;

  const [layoutId, dividerShape] = theme.headerFooterStyle.split("|");

  const radius = clamp01(theme.radius ?? 0.5, 0, 1.5);
  const spacingDensity = clamp01(theme.spacingDensity ?? 1, 0.8, 1.4);
  const surface = SURFACE_PRESETS[theme.surfaceStyle] ?? SURFACE_PRESETS.soft;
  const motionLevel = Math.round(clamp01(theme.motionIntensity ?? 5, 0, 10));
  const motion = getMotionMagnitude(motionLevel);
  const imageFilter =
    IMAGE_TREATMENT_FILTERS[theme.imageTreatment] ?? IMAGE_TREATMENT_FILTERS.natural;
  const scrollEffectCSS = buildScrollEffectCSS(motionLevel);
  const hoverEffectCSS = buildHoverEffectCSS(motionLevel);

  return `/* AUTOGENERATED, DO NOT EDIT MANUALLY, SEE css.js */
${buildGoogleFontsImport(titleFont, bodyFont)}
${buildLocalFontFace(titleFont, bodyFont)}
@import "tailwindcss";
@plugin "@tailwindcss/typography";

@theme {
  /* === Fonts === */
  --font-title: ${quoteFont(titleFont)}, ${getFontFallback(titleFont)};
  --font-body: ${quoteFont(bodyFont)}, ${getFontFallback(bodyFont)};

  /* === Accent ramp (hue-driven, see :root for the actual hue) === */
${buildAccentRamp()}

  /* === Radius scale (base = ${radius}rem) === */
  --radius-sm: ${(radius * 0.5).toFixed(3)}rem;
  --radius-md: ${radius.toFixed(3)}rem;
  --radius-lg: ${(radius * 1.5).toFixed(3)}rem;
  --radius-xl: ${(radius * 2.5).toFixed(3)}rem;
  --radius-full: 9999px;

  /* === Spacing scale — Tailwind v4 derives all p-* /m-* /gap-* utilities from this === */
  --spacing: ${(0.25 * spacingDensity).toFixed(4)}rem;

  /* === Shadows (part of surfaceStyle: "${theme.surfaceStyle}") === */
  --shadow-sm: ${surface.shadow.sm};
  --shadow-md: ${surface.shadow.md};
  --shadow-lg: ${surface.shadow.lg};
}

/* ===========================================================================
   Non-token custom properties: consumed by component markup / page JS, not
   turned into Tailwind utilities. Power users can override any of these
   directly without regenerating this file.
   =========================================================================== */
:root {
  /* Accent hue — change this alone to retint the whole ramp above */
  --accent-hue: ${theme.accentHue};

  /* Type scale multiplier, used by heading utilities below */
  --type-scale: ${typeScale};

  /* Motion (read by the scroll-effect / hover-effect rules below). Level ${motionLevel}/10. */
  --motion-duration: ${motion.duration};
  --motion-distance: ${motion.distance};
  --motion-scale: ${motion.scale};
  --motion-enabled: ${motionLevel > 0 ? 1 : 0};

  /* Button radius: derives from --radius-lg (see @theme above), NOT a separate
     shape choice. At low radius values this renders square-ish; at high values
     border-radius naturally exceeds half the button's height and CSS clips it
     to a perfect pill on its own — no shape enum needed. Power users can still
     override just this one var (e.g. force square buttons on an otherwise
     round site) without touching the global radius scale. */
  --button-radius: var(--radius-lg);
  --button-fill: ${surface.fill};

  /* Layout + divider, split from the single "${theme.headerFooterStyle}" token —
     component partials branch on these */
  --header-footer-style: "${layoutId}";
  --section-divider: "${dividerShape}";

  /* Media */
  --site-image: url("${theme.siteImage ?? ""}");
  --site-icon: url("${theme.siteIcon ?? ""}");

  /* Image treatment */
  --image-filter: ${imageFilter};
}

/* Respect user motion preference regardless of the configured intensity */
@media (prefers-reduced-motion: reduce) {
  :root {
    --motion-duration: 0ms;
    --motion-distance: 0px;
    --motion-scale: 1;
    --motion-enabled: 0;
  }
}

@layer components {
  /* --- Headings, scaled by --type-scale via clamp() --- */
  h1, .h1 { font-family: var(--font-title); font-size: clamp(2rem, calc(1.6rem + 2vw * var(--type-scale)), calc(3.5rem * var(--type-scale))); line-height: 1.1; }
  h2, .h2 { font-family: var(--font-title); font-size: clamp(1.5rem, calc(1.2rem + 1.4vw * var(--type-scale)), calc(2.5rem * var(--type-scale))); line-height: 1.15; }
  h3, .h3 { font-family: var(--font-title); font-size: clamp(1.25rem, calc(1.1rem + 0.8vw * var(--type-scale)), calc(1.75rem * var(--type-scale))); line-height: 1.2; }

  /* --- Buttons --- */
  button {
    border-radius: var(--button-radius);
    padding: calc(var(--spacing) * 3) calc(var(--spacing) * 6);
    font-family: var(--font-body);
    font-weight: 600;
    transition: transform 150ms ease, box-shadow 150ms ease;
  }
  button[data-fill="solid"], .btn { background-color: var(--color-accent-600); color: var(--color-accent-50); }
  button[data-fill="outline"] { background-color: transparent; color: var(--color-accent-700); box-shadow: inset 0 0 0 1.5px var(--color-accent-600); }
  button:hover { transform: translateY(-1px); }

  /* --- Section dividers. "wave" ships as an SVG mask asset per divider component,
     this only covers the two pure-CSS shapes. --- */
  .section-divider[data-shape="angle"] { clip-path: polygon(0 0, 100% 0, 100% 100%, 0 calc(100% - 3vw)); }
  .section-divider[data-shape="straight"] { clip-path: none; }

  /* --- Images --- */
  img {
    filter: var(--image-filter);
    border-radius: var(--radius-md);
  }
}
${scrollEffectCSS}${hoverEffectCSS}`;
}

export default generateThemeCSS;