// Event page planning: decides which event-types / events get their own page and
// which cards the `eventCards` block shows. Pure and browser-safe (no fs / node
// imports), so the build adapter (createFiles.js) and the live preview share it.
//
// Per-type page mode, authored on `event-types.list[].pageMode`:
//   "none"  - no dedicated page (the default)
//   "type"  - ONE page for the type, listing its events
//   "event" - one page for EACH event of the type (the legacy behaviour)
//
// Backward compatibility: when `pageMode` is unset, a type listed in the legacy
// `pages.pageperevent` array resolves to "event"; anything else resolves to "none".
// `pages.pageperevent` will be dropped in the future, `pageMode` is the way forward.
import { slugify, applyComplexFilter } from "./utils.js";

export const PAGE_MODES = ["none", "type", "event"];

const asArray = (v) => (Array.isArray(v) ? v : typeof v === "string" && v ? [v] : []);
const first = (v) => asArray(v).find((x) => typeof x === "string" && x.trim()) ?? "";
const norm = (v) => String(v ?? "").toLowerCase().trim();

// Lowercased type id, the same key calendar-core uses for `event.type`.
export const typeKey = (type) => norm(type?.id);

export function eventTypesOf(config) {
  const list = config?.["event-types"]?.list;
  return (Array.isArray(list) ? list : []).filter((t) => t && typeof t === "object" && typeKey(t));
}

export function typeTitle(type) {
  return type?.label || type?.defaults?.title || type?.defaults?.name || type?.id || "";
}

// True when the type carries an explicit (valid) pageMode, i.e. it was authored
// with the new option instead of inferred from the legacy pageperevent list.
export const hasExplicitPageMode = (type) => PAGE_MODES.includes(type?.pageMode);

export function resolvePageMode(type, pageperevent = []) {
  if (hasExplicitPageMode(type)) return type.pageMode;
  const legacy = new Set(asArray(pageperevent).map(norm));
  return legacy.has(typeKey(type)) ? "event" : "none";
}

// Slug of a per-event page. Kept identical to the pre-pageMode behaviour so
// existing event URLs do not change.
export function eventPageSlug(ev) {
  return slugify([ev.title, ev.dates?.[0], ev.rrule?.join("-")].filter(Boolean).join(" "));
}

function findPlace(config, id) {
  if (!id) return undefined;
  return (config?.info?.places ?? []).find((p) => p && p.id === id);
}

// Placeholder data for a type page's template, mirroring what per-event pages get.
function typePageData(config, type) {
  const d = type.defaults ?? {};
  const text = first(d.notes) || first(d.description);
  const place = findPlace(config, first(d.location));
  return { ...(place ?? {}), ...d, html: text, description: text, title: typeTitle(type), type: typeKey(type) };
}

// Plan every generated event page. No side effects: the caller writes pages and
// sets `ev.link`.
//   modes       Map typeKey -> "none" | "type" | "event"
//   typePages   [{ type, key, title, slug, data }]  (data feeds substitute())
//   typeLinks   Map typeKey -> "/slug/" for the types that got a page
//   eventPages  [{ ev, slug }]                       (legacy per-event pages)
//   eventLinks  Map event -> "/slug/"
// `takenSlugs` are the slugs of already-authored pages: those always win over a
// generated type page.
export function planEventPages({ config, calendar = [], takenSlugs = new Set() } = {}) {
  const legacy = asArray(config?.pages?.pageperevent).map(norm).filter(Boolean);
  const types = eventTypesOf(config);

  const modes = new Map(types.map((t) => [typeKey(t), resolvePageMode(t, legacy)]));
  // Legacy ids that match no defined type keep working (events can carry any type).
  for (const id of legacy) if (!modes.has(id)) modes.set(id, "event");

  const taken = new Set(takenSlugs);
  const typePages = [];
  const typeLinks = new Map();
  for (const type of types) {
    const key = typeKey(type);
    if (modes.get(key) !== "type") continue;
    const title = typeTitle(type);
    const slug = slugify(title);
    if (!slug || taken.has(slug)) {
      console.warn(`event pages: no page for event type "${title}" (slug "${slug}" is already taken)`);
      continue;
    }
    taken.add(slug);
    typePages.push({ type, key, title, slug, data: typePageData(config, type) });
    typeLinks.set(key, "/" + slug + "/");
  }

  const eventPages = [];
  const eventLinks = new Map();
  for (const ev of calendar) {
    if (!ev || modes.get(norm(ev.type)) !== "event") continue;
    const slug = eventPageSlug(ev);
    eventPages.push({ ev, slug });
    eventLinks.set(ev, "/" + slug + "/");
  }

  return { modes, typePages, typeLinks, eventPages, eventLinks };
}

// A card-shaped stand-in for a whole type, so EventCards.vue can render it.
function typeCard(type, link) {
  const d = type.defaults ?? {};
  return {
    type: typeKey(type),
    title: typeTitle(type),
    images: asArray(d.images),
    locations: [],
    byday: [],
    byweek: [],
    dates: [],
    times: [],
    notes: [],
    link,
    typeCard: true,
  };
}

// Cards for an `eventCards` block.
//  1. Exactly as before: one card per event matching `eventsToShow` (every event
//     when nothing is selected).
//  2. When types are selected, the rest follow their page mode: a type with
//     pageMode "type" adds ONE card for the type, one with pageMode "event" adds
//     a card per event, both only when they actually have a page. Types whose mode
//     is merely inferred from the legacy pageperevent list are not added, so
//     existing sites render exactly as they did.
export function eventCardsFor({ eventsToShow, calendar = [], config, plan } = {}) {
  const selected = asArray(eventsToShow);
  const legacy = calendar.filter((obj) => applyComplexFilter(obj, selected.join("|") || ""));
  if (!selected.length) return legacy;

  const chosen = new Set(selected.map(norm));
  const seen = new Set(legacy);
  const cards = [...legacy];
  const p = plan ?? planEventPages({ config, calendar });
  for (const type of eventTypesOf(config)) {
    const key = typeKey(type);
    if (chosen.has(key) || !hasExplicitPageMode(type)) continue;
    if (type.pageMode === "type" && p.typeLinks.has(key)) {
      cards.push(typeCard(type, p.typeLinks.get(key)));
    } else if (type.pageMode === "event") {
      for (const ev of calendar) {
        if (seen.has(ev) || norm(ev?.type) !== key || !p.eventLinks.has(ev)) continue;
        seen.add(ev);
        cards.push({ ...ev, link: p.eventLinks.get(ev) });
      }
    }
  }
  return cards;
}
