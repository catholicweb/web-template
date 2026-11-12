// Pure, browser-safe helpers behind Calendar.vue's "what is going on today / what is far
// away" logic. No fs / node / vue imports, so it is unit-testable and the live preview can use it.
//
// Input: the grouped tree built by groupEvents (utils.js). Its last level holds one small
// stub per event: `{ link?, dates?, byweek? }`. Together with the key of the row the line
// sits in (an ISO date, or weekdays like "SA" / "MO,TU,WE,TH,FR") that is all it takes to know:
//   today   the line happens today
//   muted   the line only happens on certain weeks of the month, and not in the next 7 days
//   far     the line starts after the horizon (`months` from today)
//
// Week of the month = the nth occurrence of the weekday in the month (day 1-7 -> 1, 8-14 -> 2...),
// the same meaning ics.js gives to `WEEKn`, so the page and the .ics export agree.
import { stripIndex, toArray } from "./utils.js";

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

// State of one line. `today` is an ISO day; `months` 0 turns the horizon off.
export function lineStatus(rowKey, stubs, today, months = 0) {
  const row = rowKind(rowKey);
  const list = stubs?.length ? stubs : [{}];
  const starts = list.map(startOf);
  const weeks = restrictedWeeks(list);

  // Does the line happen on this day? Recurring lines start on their first date, when they have one.
  const occursOn = (iso) => {
    if (row.type === "date") return iso === row.iso;
    if (row.type !== "days") return false;
    const day = fromISODay(iso);
    return row.days.includes(DAY_CODES[day.getDay()]) && (!weeks || weeks.has(weekOfMonth(day))) && starts.some((s) => !s || s <= iso);
  };

  const isToday = occursOn(today);
  // Only week-restricted recurring lines fade out: they are the ones that are "not this week".
  const upcoming = Array.from({ length: 7 }, (_, i) => addDays(today, i)).some(occursOn);
  const muted = row.type === "days" && !!weeks && !upcoming;

  let far = false;
  if (months > 0) {
    const limit = horizonLimit(today, months);
    far = row.type === "date" ? row.iso > limit : starts.every((s) => s && s > limit);
  }
  return { today: isToday, muted, far };
}

// Everything Calendar.vue needs about one table (the tree below one event type):
//   rows     [{ key, lines: { subKey: { lineKey: status } }, far, today, stripe, index }]
//            far = every line of the row is beyond the horizon; stripe / index number the rows for
//            zebra striping with the far rows left out / kept
//   hidden   lines beyond the horizon (what the "show more" button would reveal)
//   visible  rows that stay when the table is collapsed
export function tableView(table, today, months = 0) {
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
        const status = lineStatus(key, stubsOf(line), today, months);
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
