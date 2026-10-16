// Auto mode of the `calendar` block. Pure and browser-safe (no fs / node imports):
// the build adapter (createFiles.js) and the live preview (Layout.vue) share it
// through pageBuilder.js.
//
// A calendar section opts in per concern, so existing sites render exactly as before:
//   filter:   "auto" | "auto&<complex filter>"  scope the events to the page they are on
//   ordering: "auto"                            one table per event type, each laid out
//                                               from its own data (see groupEventsAuto)
//   horizon:  <days>                            hide one-off events further away than this
//                                               (default 60 when ordering is "auto", else off)
import { applyComplexFilter, groupEvents, accessMultikey } from "./utils.js";
import { eventPageSlug, eventTypesOf, typeKey } from "./eventPages.js";
import { labelEvents } from "./calendar-core.js";

export const DEFAULT_HORIZON_DAYS = 60;

const norm = (v) => String(v ?? "").toLowerCase().trim();
const isEmpty = (v) => v === undefined || v === null || v === "";
export const isRecurring = (e) => e?.byday?.length > 0 || e?.byweek?.length > 0;

// ---- filter ---------------------------------------------------------------

// "auto" | "auto&!mass" -> { auto: true, rest: "" | "!mass" }.
// Anything else (including "automatic" or "auto|x") is a plain complex filter.
export function parseAutoFilter(filter) {
  const f = typeof filter === "string" ? filter.trim() : "";
  const m = /^auto(?:\s*&\s*(.*))?$/i.exec(f);
  return m ? { auto: true, rest: (m[1] ?? "").trim() } : { auto: false, rest: f };
}

// ---- page context -----------------------------------------------------------

// Where is this page? Derived from what createFiles.js already stamps on generated
// pages (`group`, `slug`, `title`) plus the event page plan, so it works for the
// build and needs no extra plumbing. An explicit `page.context` ({kind, ...}) wins,
// which lets the editor preview say where a template page would end up.
//   { kind: "place", name }   town page        (group "templos", title = place name)
//   { kind: "type",  type }   event-type page  (a plan.typePages entry)
//   { kind: "event", slug }   single-event page (a plan.eventPages entry)
// Hand-authored pages have no context (null).
export function pageContext(page, plan) {
  if (page?.context?.kind) return page.context;
  if (page?.group === "templos" && page.title) return { kind: "place", name: page.title };
  if (page?.group === "eventos" && page.slug) {
    const type = plan?.typePages?.find((p) => p.slug === page.slug);
    if (type) return { kind: "type", type: type.key };
    const ev = plan?.eventPages?.find((p) => p.slug === page.slug);
    if (ev) return { kind: "event", slug: ev.slug };
  }
  return null;
}

// Predicate for "events that belong to this page", or null when there is no scope.
export function scopeMatcher(context) {
  switch (context?.kind) {
    case "place": {
      const name = norm(context.name);
      return (e) => (Array.isArray(e.locations) ? e.locations : []).some((l) => norm(l) === name);
    }
    case "type":
      return (e) => norm(e.type) === norm(context.type);
    case "event":
      return (e) => eventPageSlug(e) === context.slug;
    default:
      return null;
  }
}

// ---- selection --------------------------------------------------------------

export function horizonDays(section, auto) {
  const h = section?.horizon;
  if (!isEmpty(h)) {
    const n = Number(h);
    if (Number.isFinite(n)) return Math.max(0, n);
  }
  return auto ? DEFAULT_HORIZON_DAYS : 0;
}

// Drops one-off events further than `days` away. Only the dates inside the horizon
// are kept (a multi-date event stays with its near dates). Recurring and undated
// events are always kept. Never mutates: trimmed events are copies.
export function withinHorizon(events, days, now = new Date()) {
  if (!days || days <= 0) return events;
  const limit = new Date(now);
  limit.setHours(0, 0, 0, 0);
  limit.setDate(limit.getDate() + days);
  return events.flatMap((e) => {
    if (isRecurring(e) || !e.dates?.length) return [e];
    const dates = e.dates.filter((d) => new Date(d) <= limit);
    if (!dates.length) return [];
    return dates.length === e.dates.length ? [e] : [{ ...e, dates }];
  });
}

// Stable sort by the position of the event's type in `event-types.list`
// (untyped / unknown types last), so tables follow the order the editor set.
export function orderByType(events, config) {
  const rank = new Map(eventTypesOf(config).map((t, i) => [typeKey(t), i]));
  const at = (e) => (rank.has(norm(e.type)) ? rank.get(norm(e.type)) : rank.size);
  return [...events].sort((a, b) => at(a) - at(b));
}

// Which events a calendar section shows. Manual sections (no "auto" anywhere) get
// exactly what they always got: the calendar run through their complex filter.
export function selectEvents(calendar, section, { context = null, config = {}, now = new Date() } = {}) {
  const auto = section?.ordering === "auto";
  const { auto: scoped, rest } = parseAutoFilter(section?.filter);
  const scope = scoped ? scopeMatcher(context) : null;

  // The derived label fields must not change what a user-written filter matches.
  const matches = (e) => {
    const { typeLabel, subtitle, ...bare } = e;
    return applyComplexFilter(bare, rest);
  };

  const base = auto ? labelEvents(calendar ?? [], config) : (calendar ?? []);
  let events = base.filter((e) => (!scope || scope(e)) && matches(e));

  // Pages dedicated to a type or an event show everything that is still to come.
  const pinned = context?.kind === "type" || context?.kind === "event";
  if (!pinned) events = withinHorizon(events, horizonDays(section, auto), now);
  if (auto) events = orderByType(events, config);
  return events;
}

// ---- layout -----------------------------------------------------------------

// Calendar.vue renders table[row][column][line][extra]. Per table (= per event type):
//   row     weekday / week-of-month for recurring events, the date for one-off ones
//   column  the place when 2-4 places share the table, else none
//   line    the time
//   extra   the event's own title (only when it adds info and the page is not that
//           event), the place when it is not already a column / the page itself, then
//           specific days and notes
const WHEN = "weekday/byweek/dates";
const DETAIL = "byday-weekday+byweek+notes";

export function groupEventsAuto(events, { scope = null } = {}) {
  const buckets = new Map();
  for (const raw of events ?? []) {
    const e = Array.isArray(raw.byday) ? raw : { ...raw, byday: [] };
    const key = e.typeLabel || e.title || "";
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(e);
  }

  // On a page about one type/event the heading would just repeat the page title.
  const pinned = scope === "type" || scope === "event";
  const hideHeading = pinned && buckets.size === 1;

  const out = {};
  for (const [label, group] of buckets) {
    const places = new Set(group.flatMap((e) => accessMultikey(e, "locations")).filter(Boolean)).size;
    const byPlace = scope !== "place" && places >= 2 && places <= 4;
    // On a single-event page the event's own title is the page title: don't repeat it.
    const extra = [scope !== "event" && "subtitle", !byPlace && scope !== "place" && "locations", DETAIL].filter(Boolean).join("+");
    const table = groupEvents(group, [WHEN, byPlace ? "locations" : "skip", "times", extra]);
    out[hideHeading ? "" : label] = sortRows(table);
  }
  return out;
}

// Row order: Monday-Friday, Saturday, Sunday, week-of-month, dates ascending, the rest.
const WEEKDAY_RANK = { "MO,TU,WE,TH,FR": 0, SA: 1, SU: 2 };
const ISO_DATE = /^\d{4}-\d{1,2}-\d{1,2}$/;

function rank(key) {
  if (Object.hasOwn(WEEKDAY_RANK, key)) return WEEKDAY_RANK[key];
  const week = /^WEEK(\d)$/i.exec(key);
  if (week) return 3 + Number(week[1]);
  if (ISO_DATE.test(key)) return 20;
  return key === "" ? 40 : 30;
}

export function sortRows(table) {
  const byRank = ([a], [b]) => rank(a) - rank(b) || (ISO_DATE.test(a) ? Date.parse(a) - Date.parse(b) : a.localeCompare(b));
  return Object.fromEntries(Object.entries(table).sort(byRank));
}
