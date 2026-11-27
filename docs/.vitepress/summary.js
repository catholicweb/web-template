// Meta description ("summary") of every generated page, built from the page's own data. No AI call:
//   event page   "<when> · <place>. <first sentences of the event's notes>"
//   type page    "<event>: <when> · <place>; <event>: ..." (the first groups) + the type's text
//   place page   "<address>. <first text of the page>"
//   other pages  the start of the first visible text block (home keeps the site description)
// It runs per language on the already translated page, so every language gets its own text from
// the translations the dictionary already holds (nothing extra to translate or cache): dates and
// weekdays come from Intl in the page's language, the words around them from the poster labels.
// Pure and browser-safe (no fs / node imports).
import { formatDates, describeRecurrence, plainText, langCode, isoToday } from "./theme/poster/posterModel.js";
import { POSTER_LABELS } from "./theme/poster/posterLabels.js";

export const SUMMARY_MAX = 160;
const MAX_GROUPS = 2; // distinct "when · where" lines of a type page
const MIN_ROOM = 40; // chars left for the text, below this the text is left out

const arr = (v) => (Array.isArray(v) ? v : []);
const SENTENCE_END = /(?<=[.!?…؟])\s+/;

/** `text` cut at a word boundary to at most `max` chars, "…" when something was dropped. */
export function cut(text, max = SUMMARY_MAX) {
  const t = String(text ?? "").replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const head = t.slice(0, max - 1);
  const sp = head.lastIndexOf(" ");
  return (sp > max * 0.6 ? head.slice(0, sp) : head).replace(/[\s,;:.\-–—]+$/, "") + "…";
}

/** Whole sentences from the start of `text` while they fit in `max`; the first one is cut if it alone does not. */
export function sentences(text, max) {
  const parts = String(text ?? "").replace(/\s+/g, " ").trim().split(SENTENCE_END).filter(Boolean);
  if (!parts.length) return "";
  if (parts[0].length > max) return cut(parts[0], max);
  let out = parts[0];
  for (const p of parts.slice(1)) {
    if ((out + " " + p).length > max) break;
    out += " " + p;
  }
  return out;
}

const list = (code, items) => {
  try {
    return new Intl.ListFormat(code, { style: "long", type: "conjunction" }).format(items);
  } catch {
    return items.join(", ");
  }
};

const placeOf = (ev) => ev?.place?.name || arr(ev?.locations)[0] || "";

/** "Every Thursday · 19:30", "Saturday, July 20 · 10:00": recurrence or the next dates, then the times. */
export function whenOf(ev, code, today) {
  // The recurrence words ("Every", "week 1 of the month") exist for the poster languages only;
  // elsewhere they would come out in English inside a text of another language, so they are left out.
  const recurrence = code in POSTER_LABELS ? describeRecurrence(ev, code) : "";
  const { items, more } = formatDates(ev?.dates, code, { today, max: 2 });
  const dates = items.map((i) => i.long).filter(Boolean);
  const days = recurrence || (dates.length ? list(code, dates) + (more > 0 ? "…" : "") : "");
  const times = arr(ev?.times).filter(Boolean).join(", ");
  return [days, times].filter(Boolean).join(" · ");
}

const eventLine = (ev, code, today) => [whenOf(ev, code, today), placeOf(ev)].filter(Boolean).join(" · ");

// Head (facts) + text (the words of the page), the text taking the room the head leaves.
function join(head, text, max) {
  const h = String(head ?? "").trim();
  const t = String(text ?? "").trim();
  if (!h) return sentences(t, max);
  const room = max - h.length - 2;
  if (!t || room < MIN_ROOM) return cut(h, max);
  return h + (/[.!?…]$/.test(h) ? " " : ". ") + sentences(t, room);
}

/** One line per distinct (title, when, where) group, the first MAX_GROUPS of them. */
function typeHead(events, code, today) {
  const seen = new Set();
  const lines = [];
  for (const ev of events) {
    if (!ev?.title) continue;
    const line = eventLine(ev, code, today);
    const key = ev.title + "|" + line;
    if (seen.has(key)) continue;
    seen.add(key);
    lines.push(line ? `${ev.title}: ${line}` : ev.title);
  }
  return lines.slice(0, MAX_GROUPS).join("; ") + (lines.length > MAX_GROUPS ? "…" : "");
}

/**
 * Meta description of a finalized (translated) page, or "" when the page should keep what it has
 * (its authored description, or the site's for the home page).
 * @param {object} fm            finalized frontmatter: lang, description, home, seo {event|events|place}
 * @param {object} [o]
 * @param {string} [o.text]      the start of the page's first visible text block
 * @param {string} [o.siteTitle] last resort for a place page with nothing else to say
 * @param {string} [o.today]     ISO date, injectable for tests
 * @param {number} [o.max]
 */
export function buildSummary(fm, { text = "", siteTitle = "", today = isoToday(), max = SUMMARY_MAX } = {}) {
  if (!fm) return "";
  const code = langCode(fm.lang);
  const own = plainText(fm.description, 600);
  const seo = fm.seo ?? {};

  if (seo.event) {
    const note = Array.isArray(seo.event.notes) ? seo.event.notes[0] : seo.event.notes;
    return join(eventLine(seo.event, code, today), plainText(note, 600) || own || text, max);
  }
  if (arr(seo.events).length) {
    return join(typeHead(seo.events, code, today), own || text, max);
  }
  if (seo.place?.name) {
    const address = typeof seo.place.address === "string" ? seo.place.address : "";
    const body = text || own;
    return join(address, body || (address ? "" : siteTitle), max);
  }
  // Authored description wins; the home page keeps the site's.
  if (own || fm.home) return "";
  return sentences(text, max);
}
