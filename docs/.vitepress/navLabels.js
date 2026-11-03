// Pure helpers for the auto-generated nav. Browser-safe (no fs / node imports)
// so they can be unit-tested without the build environment.
import { getCode } from "./utils.js";

// Hardcoded translations of the main menus, keyed by the lowercase Spanish
// source label, then by language code. They win over the LLM dictionary so the
// menu names are always the ones we picked. Languages missing here fall back to
// the dictionary (see tr() in navBar.js).
//
// "Actividades" is deliberately a broad word (activities, events and the groups
// that run them). If you would rather stress groups, swap that row for
// Comunidad / Community / Komunitatea / Communauté ...
export const NAV_LABELS = {
  portada: { es: "Portada", en: "Home", eu: "Hasiera", fr: "Accueil", ca: "Inici", de: "Startseite", it: "Home", pt: "Início" },
  parroquias: { es: "Parroquias", en: "Parishes", eu: "Parrokiak", fr: "Paroisses", ca: "Parròquies", de: "Pfarreien", it: "Parrocchie", pt: "Paróquias" },
  actividades: { es: "Actividades", en: "Activities", eu: "Jarduerak", fr: "Activités", ca: "Activitats", de: "Aktivitäten", it: "Attività", pt: "Atividades" },
};

// Hardcoded translation of a nav label, or undefined when there is none.
// `lang` is either "Label:code" (as authored in config.languages) or a bare code.
export function translateNavLabel(label, lang) {
  if (typeof label !== "string" || typeof lang !== "string") return undefined;
  return NAV_LABELS[label.trim().toLowerCase()]?.[getCode(lang)];
}

const collators = new Map();

// Comparator for nav items ({ text, link }) that sorts alphabetically with the
// rules of the item's language: accents and case are ignored ("Álamo" ~ "alamo"),
// numbers sort by value ("2" before "10") and each language uses its own alphabet
// (Spanish ñ after n, Cyrillic, Arabic...). Ties fall back to the link so the
// order is deterministic.
export function navComparator(lang) {
  const code = getCode(lang);
  if (!collators.has(code)) {
    const opts = { sensitivity: "base", numeric: true };
    let collator;
    try {
      collator = new Intl.Collator(code, opts);
    } catch {
      collator = new Intl.Collator(undefined, opts); // malformed language tag
    }
    collators.set(code, collator);
  }
  const collator = collators.get(code);
  return (a, b) => collator.compare(a?.text ?? "", b?.text ?? "") || String(a?.link ?? "").localeCompare(String(b?.link ?? ""));
}
