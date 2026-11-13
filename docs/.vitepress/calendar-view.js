// Pure, browser-safe helpers behind Calendar.vue's "what is going on today / what is far
// away" logic. No fs / node / vue imports, so it is unit-testable and the live preview can use it.
//
// Input: the grouped tree built by groupEvents (utils.js). Its last level holds one small
// stub per event: `{ link?, dates?, byweek? }`. Together with where the line sits (the keys of
// its path: an ISO date, or weekdays like "SA" / "MO,TU,WE,TH,FR", at whatever level the
// ordering puts them) that is all it takes to know:
//   today   the line happens today (by default only dated lines, see HIGHLIGHT_RECURRING_TODAY)
//   muted   the line only happens on certain weeks of the month, and not in the next 7 days
//   far     the line starts after the horizon (`months` from today)
//
// Week of the month = the nth occurrence of the weekday in the month (day 1-7 -> 1, 8-14 -> 2...),
// the same meaning ics.js gives to `WEEKn`, so the page and the .ics export agree.
import { stripIndex, toArray } from "./utils.js";

// Lines of recurring events (every Saturday, 1st Sunday...) are not marked as "today" for now,
// only dated ones are. Set to true to try the weekday highlight too (the logic is all here).
export const HIGHLIGHT_RECURRING_TODAY = false;

const DAY_CODES = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"]; // Date#getDay order
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const pad = (n) => String(n).padStart(2, "0");

// Time zone the build runs "today" in (same one ics.js uses). Only used for the build day;
// in the browser the visitor's own date takes over.
export const SITE_TZ = "Europe/Madrid";
export const buildDay = (now = new Date()) => now.toLocaleDateString("en-CA", { timeZone: SITE_TZ });

export const toISODay = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const fromISODay = (iso) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const addDays = (iso, n) => {
  const d = fromISODay(iso);
  d.setDate(d.getDate() + n);
  return toISODay(d);
};
const weekOfMonth = (date) => Math.ceil(date.getDate() / 7);

// Last day (ISO) that is still inside the horizon: today + `months`, as withinHorizon() does.
export function horizonLimit(today, months) {
  const d = fromISODay(today);
  d.setMonth(d.getMonth() + months);
  return toISODay(d);
}

// What a row key means: an ISO date, a group of weekdays, or anything else (custom orderings).
export function rowKind(key) {
  const k = stripIndex(key).trim();
  if (ISO_DAY.test(k)) return { type: "date", iso: k };
  const days = k.toUpperCase().split(",").map((s) => s.trim());
  if (days.length && days.every((d) => DAY_CODES.includes(d))) return { type: "days", days };
  return { type: "other" };
}

const weeksOf = (stub) =>
  toArray(stub?.byweek)
    .map((w) => /^WEEK([1-5])$/i.exec(String(w).trim())?.[1])
    .filter(Boolean)
    .map(Number);

const startOf = (stub) => toArray(stub?.dates).filter((d) => ISO_DAY.test(d)).sort()[0] || "";

// The weeks of the month a line is limited to, or null when it happens every week
// (that is, when any of its events has no week).
function restrictedWeeks(stubs) {
  if (!stubs.every((s) => weeksOf(s).length)) return null;
  return new Set(stubs.flatMap(weeksOf));
}

// Every stub under one line: { "<extra info>": [stub, ...] }.
export const stubsOf = (line) =>
  Object.values(line || {})
    .flatMap((stubs) => (Array.isArray(stubs) ? stubs : []))
    .filter((s) => s && typeof s === "object");

// Where a line sits, whatever the ordering: the first key of its path (table, row, column,
// line) that is a date or a group of weekdays. Orderings put them at different levels
// (rows by default, the table for masses...).
export function contextOf(path) {
  for (const key of path || []) {
    const kind = rowKind(key);
    if (kind.type !== "other") return kind;
  }
  return { type: "other" };
}

// State of one line. `path` = its keys [table, row, column, line]; `today` is an ISO day;
// `months` 0 turns the horizon off; `recurring` also marks lines of recurring events as today.
export function lineStatus(path, stubs, today, months = 0, { recurring = HIGHLIGHT_RECURRING_TODAY } = {}) {
  const where = contextOf(path);
  const list = stubs?.length ? stubs : [{}];
  const starts = list.map(startOf);
  const weeks = restrictedWeeks(list);

  // Does a recurring line happen on this day? It starts on its first date, when it has one.
  const recursOn = (iso) => {
    if (where.type !== "days") return false;
    const day = fromISODay(iso);
    return where.days.includes(DAY_CODES[day.getDay()]) && (!weeks || weeks.has(weekOfMonth(day))) && starts.some((s) => !s || s <= iso);
  };

  // A dated line: its row is the date, or (when no key says so) its events list the date.
  const datedToday = where.type === "date" ? where.iso === today : where.type === "other" && list.some((s) => toArray(s.dates).includes(today));
  const isToday = datedToday || (recurring && recursOn(today));

  // Only week-restricted recurring lines fade out: they are the ones that are "not this week".
  const upcoming = Array.from({ length: 7 }, (_, i) => addDays(today, i)).some(recursOn);
  const muted = where.type === "days" && !!weeks && !upcoming;

  let far = false;
  if (months > 0) {
    const limit = horizonLimit(today, months);
    far = where.type === "date" ? where.iso > limit : starts.every((s) => s && s > limit);
  }
  return { today: isToday, muted, far };
}

// Everything Calendar.vue needs about one table (the tree below one table key):
//   rows     [{ key, lines: { subKey: { lineKey: status } }, far, today, stripe, index }]
//            far = every line of the row is beyond the horizon; stripe / index number the rows for
//            zebra striping with the far rows left out / kept
//   hidden   lines beyond the horizon (what the "show more" button would reveal)
//   visible  rows that stay when the table is collapsed
// `tableKey` is the key of the table itself: with some orderings it is the one that holds the weekdays.
export function tableView(table, today, months = 0, { tableKey = "", recurring } = {}) {
  const rows = [];
  let hidden = 0;
  let visible = 0;
  Object.entries(table || {}).forEach(([key, row], index) => {
    const lines = {};
    let count = 0;
    let farCount = 0;
    let isToday = false;
    for (const [subKey, group] of Object.entries(row || {})) {
      lines[subKey] = {};
      for (const [lineKey, line] of Object.entries(group || {})) {
        const status = lineStatus([tableKey, key, subKey, lineKey], stubsOf(line), today, months, { recurring });
        lines[subKey][lineKey] = status;
        count++;
        if (status.far) farCount++;
        if (status.today) isToday = true;
      }
    }
    const far = count > 0 && farCount === count;
    hidden += farCount;
    rows.push({ key, lines, far, today: isToday, index, stripe: far ? -1 : visible });
    if (!far) visible++;
  });
  return { rows, hidden, visible };
}
