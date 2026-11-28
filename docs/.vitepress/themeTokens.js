/**
 * themeTokens.js
 * The "character" tokens of the site theme (everything beyond hue / font / radius),
 * the vibe presets that set many of them at once, and the CSS builders that
 * turn them into custom properties and override rules.
 *
 * Pure functions, no node imports: themeBuilder.js is also bundled in the browser
 * (live preview in Layout.vue).
 *
 * Contract with the editor (catholicweb/editor, docs/public/_pages.yml, `theme` tab):
 * the option values below must match the `values` of the same-named components there.
 *
 * Layering: a vibe only supplies DEFAULTS. Any token the site has set explicitly
 * (non-empty value in config.theme) wins over the vibe. No vibe = the legacy look.
 */

// ---------------------------------------------------------------------------
// Token definitions: defaults + validation
// ---------------------------------------------------------------------------

export const TOKEN_DEFAULTS = {
  bodySize: 1, // multiplier on every text size from xs to xl + prose + body
  accentChroma: 1, // multiplier on the accent ramp's chroma (muted <-> vivid)
  neutralTint: "default", // default | pure | warm | cool | accent
  pageBackground: "white", // white | paper | tint | mist
  sectionRhythm: "none", // none | alternate | accent
  buttonStyle: "solid", // solid | outline | soft | pill | caps
  headingStyle: "normal", // normal | uppercase | wide | smallcaps
  divider: "none", // none | line | accent | ornament
};

const NUMBER_RANGES = {
  bodySize: [0.85, 1.6],
  accentChroma: [0.2, 1.5],
  radius: [0, 4],
  spacingDensity: [0.2, 2],
  motionIntensity: [0, 10],
  typeScale: [0, 4],
};

/** Select fields in the editor store their value as text ("1.25"): turn numeric text back into numbers. */
export function coerceNumbers(theme) {
  const out = { ...theme };
  for (const key of Object.keys(NUMBER_RANGES)) {
    if (typeof out[key] === "string" && out[key].trim() !== "" && Number.isFinite(Number(out[key]))) out[key] = Number(out[key]);
  }
  return out;
}

const ENUMS = {
  neutralTint: ["default", "pure", "warm", "cool", "accent"],
  pageBackground: ["white", "paper", "tint", "mist"],
  sectionRhythm: ["none", "alternate", "accent"],
  buttonStyle: ["solid", "outline", "soft", "pill", "caps"],
  headingStyle: ["normal", "uppercase", "wide", "smallcaps"],
  divider: ["none", "line", "accent", "ornament"],
  surfaceStyle: ["flat", "soft", "bold", "outlined", "hard"],
};

/** Clamp numeric tokens and fall back to `defaults` for enum tokens with an unknown value. */
export function normalizeTokens(theme, defaults) {
  const out = { ...theme };
  for (const [key, [min, max]] of Object.entries(NUMBER_RANGES)) {
    if (typeof out[key] === "number") out[key] = Math.min(max, Math.max(min, out[key]));
  }
  for (const [key, allowed] of Object.entries(ENUMS)) {
    if (!allowed.includes(out[key])) out[key] = defaults[key];
  }
  return out;
}

// ---------------------------------------------------------------------------
// Vibes: named starting points. Explicit site values override them.
// Deliberately no accentHue (the site's own colour) and no navStyle (read by
// Navbar.vue straight from config.theme, not through this builder).
// ---------------------------------------------------------------------------

export const VIBES = {
  classic: {
    label: "Clásico",
    tokens: {
      fontPair: "Playfair Display|Source Sans 3",
      bodySize: 1.05,
      accentChroma: 0.85,
      neutralTint: "warm",
      pageBackground: "paper",
      sectionRhythm: "alternate",
      radius: 0.75,
      surfaceStyle: "soft",
      buttonStyle: "solid",
      headingStyle: "normal",
      divider: "ornament",
      motionIntensity: 0,
    },
  },
  solemn: {
    label: "Solemne",
    tokens: {
      fontPair: "Cormorant SC|Lato",
      bodySize: 1.05,
      accentChroma: 0.7,
      neutralTint: "warm",
      pageBackground: "paper",
      sectionRhythm: "none",
      radius: 0.25,
      surfaceStyle: "outlined",
      buttonStyle: "outline",
      headingStyle: "wide",
      divider: "ornament",
      motionIntensity: 1,
    },
  },
  warm: {
    label: "Cercano",
    tokens: {
      fontPair: "Fraunces|Nunito",
      bodySize: 1.1,
      accentChroma: 0.9,
      neutralTint: "warm",
      pageBackground: "paper",
      sectionRhythm: "alternate",
      radius: 2,
      surfaceStyle: "soft",
      buttonStyle: "pill",
      headingStyle: "normal",
      divider: "none",
      motionIntensity: 3,
    },
  },
  modern: {
    label: "Moderno",
    tokens: {
      fontPair: "Outfit|Manrope",
      bodySize: 1,
      accentChroma: 1.1,
      neutralTint: "cool",
      pageBackground: "white",
      sectionRhythm: "alternate",
      radius: 1.5,
      surfaceStyle: "soft",
      buttonStyle: "solid",
      headingStyle: "normal",
      divider: "none",
      motionIntensity: 3,
    },
  },
  youth: {
    label: "Juvenil",
    tokens: {
      fontPair: "Poppins|Poppins",
      bodySize: 1,
      accentChroma: 1.3,
      neutralTint: "accent",
      pageBackground: "tint",
      sectionRhythm: "accent",
      radius: 2.5,
      surfaceStyle: "bold",
      buttonStyle: "pill",
      headingStyle: "uppercase",
      divider: "accent",
      motionIntensity: 6,
    },
  },
  minimal: {
    label: "Sobrio",
    tokens: {
      fontPair: "Space Grotesk|Inter",
      bodySize: 1,
      accentChroma: 0.4,
      neutralTint: "pure",
      pageBackground: "white",
      sectionRhythm: "none",
      radius: 0,
      surfaceStyle: "outlined",
      buttonStyle: "outline",
      headingStyle: "normal",
      divider: "line",
      motionIntensity: 0,
    },
  },
  readable: {
    label: "Lectura cómoda",
    tokens: {
      fontPair: "Lora|Karla",
      bodySize: 1.25,
      accentChroma: 0.9,
      neutralTint: "pure",
      pageBackground: "white",
      sectionRhythm: "none",
      radius: 1,
      surfaceStyle: "outlined",
      buttonStyle: "solid",
      headingStyle: "normal",
      divider: "line",
      motionIntensity: 0,
    },
  },
};

/** Tokens a vibe supplies as defaults ({} for no / unknown vibe). */
export function vibeTokens(id) {
  return (typeof id === "string" && Object.hasOwn(VIBES, id) && VIBES[id].tokens) || {};
}

// ---------------------------------------------------------------------------
// Colour helpers (all literal oklch so nothing depends on Tailwind keeping
// unreferenced theme variables)
// ---------------------------------------------------------------------------

const n = (x, digits = 4) => +x.toFixed(digits);

/** oklch colour on the accent hue at lightness `l` (0-1) and base chroma `c`, scaled by the chroma token. */
export function accentColor(l, c, chroma = 1) {
  return `oklch(${n(l * 100, 2)}% ${n(c * chroma)} var(--accent-hue))`;
}

// Same lightness steps as Tailwind's gray scale; chroma kept low so it reads as a tinted neutral.
const NEUTRAL_CURVE = {
  50: { l: 0.985, c: 0.006 },
  100: { l: 0.967, c: 0.01 },
  200: { l: 0.928, c: 0.014 },
  300: { l: 0.872, c: 0.018 },
  400: { l: 0.707, c: 0.025 },
  500: { l: 0.551, c: 0.03 },
  600: { l: 0.446, c: 0.032 },
  700: { l: 0.373, c: 0.034 },
  800: { l: 0.278, c: 0.032 },
  900: { l: 0.21, c: 0.03 },
  950: { l: 0.13, c: 0.026 },
};

const NEUTRAL_TINTS = {
  default: null, // keep Tailwind's own gray
  pure: { hue: "0", scale: 0 },
  warm: { hue: "75", scale: 1 },
  cool: { hue: "250", scale: 1 },
  accent: { hue: "var(--accent-hue)", scale: 1 },
};

function neutral(shade, tint) {
  const { l, c } = NEUTRAL_CURVE[shade];
  return `oklch(${n(l * 100, 2)}% ${n(c * tint.scale)} ${tint.hue})`;
}

/** `--color-gray-*` / `--color-slate-*` overrides for the @theme block ("" for the default tint). */
export function buildNeutralRamp(tintName) {
  const tint = NEUTRAL_TINTS[tintName];
  if (!tint) return "";
  return Object.keys(NEUTRAL_CURVE)
    .flatMap((shade) => [`  --color-gray-${shade}: ${neutral(shade, tint)};`, `  --color-slate-${shade}: ${neutral(shade, tint)};`])
    .join("\n");
}

/** Page and section surface colours, for :root. */
export function buildSurfaceVars(theme) {
  const tint = NEUTRAL_TINTS[theme.neutralTint] ?? NEUTRAL_TINTS.default;
  const gray = (shade) => (tint ? neutral(shade, tint) : `var(--color-gray-${shade})`);
  const page = {
    white: "#ffffff",
    paper: "oklch(98.6% 0.012 85)",
    tint: accentColor(0.982, 0.012, theme.accentChroma),
    mist: gray(50),
  }[theme.pageBackground];
  const alt = theme.sectionRhythm === "accent" ? accentColor(0.965, 0.03, theme.accentChroma) : gray(100);
  return `  --page-bg: ${page};
  --section-alt-bg: ${alt};
  --line-color: ${gray(200)};`;
}

// ---------------------------------------------------------------------------
// Text size (bodySize)
// ---------------------------------------------------------------------------

const TEXT_SIZES = { xs: 0.75, sm: 0.875, base: 1, lg: 1.125, xl: 1.25 };

/** Tailwind `text-xs … text-xl` scaled by --body-scale (headings use their own scale, see themeBuilder). */
export function buildTextTokens() {
  return Object.entries(TEXT_SIZES)
    .map(([k, rem]) => `  --text-${k}: calc(${rem}rem * var(--body-scale));`)
    .join("\n");
}

/** Headings follow the body size at 80%, so they never fall below it. */
export const headingScale = (bodySize) => n(1 + (bodySize - 1) * 0.8);

// ---------------------------------------------------------------------------
// Heading style
// ---------------------------------------------------------------------------

const HEADING_STYLES = {
  normal: "",
  uppercase: "text-transform: uppercase; letter-spacing: 0.04em;",
  wide: "text-transform: uppercase; letter-spacing: 0.14em;",
  smallcaps: "font-variant-caps: small-caps; letter-spacing: 0.03em;",
};

export const headingStyleCSS = (name) => HEADING_STYLES[name] ?? "";

// ---------------------------------------------------------------------------
// Override rules (unlayered on purpose: Tailwind utilities live in a cascade
// layer, so these win against `bg-accent`, `rounded-lg`, … without !important)
// ---------------------------------------------------------------------------

// Call-to-action links/buttons: <a|button class="bg-accent text-white …">. The dots in
// Grid.vue have no text-white, the date badge in calendar-cards is a div, so neither matches.
const CTA = ":is(a, button).bg-accent.text-white";
// Places where the text is white (hero image, dark sections, dark footer): outline buttons turn white there.
const ON_DARK = `:is(.hero, [class*="[&_*]:text-white"])`;

function buildButtonCSS(style, chroma) {
  if (style === "solid") return "";
  const ink = accentColor(0.48, 0.16, chroma);
  const edge = accentColor(0.56, 0.17, chroma);
  const shared = `:root { --cta-ink: ${ink}; --cta-edge: ${edge}; }
${ON_DARK} { --cta-ink: #fff; --cta-edge: #fff; }`;
  const rules = {
    outline: `${shared}
${CTA} { background: transparent; color: var(--cta-ink); border: 2px solid var(--cta-edge); }
${CTA}:hover { background: var(--cta-edge); color: #fff; }
${ON_DARK} ${CTA}:hover { color: oklch(28% 0.1 var(--accent-hue)); }`,
    soft: `${CTA} { background: ${accentColor(0.94, 0.04, chroma)}; color: ${accentColor(0.38, 0.13, chroma)}; }
${CTA}:hover { background: ${accentColor(0.88, 0.07, chroma)}; opacity: 1; }`,
    pill: `${CTA} { border-radius: 9999px; padding-inline: 1.5em; }`,
    caps: `${CTA} { text-transform: uppercase; letter-spacing: 0.08em; font-size: 0.9em; font-weight: 700; }`,
  };
  return rules[style] ?? "";
}

const CROSS = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M10 2h4v6h6v4h-6v10h-4V12H4V8h6z'/%3E%3C/svg%3E\")";
// Dividers go between sections; the two halves of `twocols` sections are skipped.
const SECTION_AFTER_FIRST = `main > section:not(:first-child):not([class*="md:w-1/2"])`;

function buildDividerCSS(style) {
  const rules = {
    line: `${SECTION_AFTER_FIRST} { border-top: 1px solid var(--line-color); }`,
    accent: `${SECTION_AFTER_FIRST}::before { content: ""; display: block; width: 3.5rem; height: 3px; margin: 2rem auto 0; border-radius: 9999px; background: var(--color-accent); }`,
    ornament: `${SECTION_AFTER_FIRST}::before { content: ""; display: block; width: 1.25rem; height: 1.25rem; margin: 2rem auto 0; background: var(--color-accent); -webkit-mask: ${CROSS} center / contain no-repeat; mask: ${CROSS} center / contain no-repeat; }`,
  };
  return rules[style] ?? "";
}

function buildRhythmCSS(style) {
  if (style === "none") return "";
  // Even sections get a tinted band. Dark sections keep their own background (their utility class is
  // in a layer, so it would lose to this unlayered rule: skip them explicitly).
  return `main > section:nth-of-type(even):not([class*="md:w-1/2"]):not([class*="[&_*]:text-white"]) {
  background-color: var(--section-alt-bg);
  padding-block: calc(var(--spacing) * 8);
}`;
}

/** All unlayered override CSS for the character tokens. */
export function buildOverrideCSS(theme) {
  return [buildButtonCSS(theme.buttonStyle, theme.accentChroma), buildRhythmCSS(theme.sectionRhythm), buildDividerCSS(theme.divider)]
    .filter(Boolean)
    .join("\n\n");
}
