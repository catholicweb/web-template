import ICAL from "ical.js";
import { read, write, fs, path } from "./node_utils.js";
import { formatWeekdays } from "./utils.js";
import { buildEvents, buildDefaultMap, buildTypeTitles, sortEvents, toArray, typeCalendars, normalizeCalendarUrl, findPlace, findPlaceByName } from "./calendar-core.js";
import { buildICS } from "./ics.js";

const TZ = "Europe/Madrid"; // same zone ics.js and the rest of the site use
const FETCH_TIMEOUT_MS = 20_000;
const MAX_ITERATIONS = 50_000; // safety net only; daily series since 2018 already need ~3.2k
const pad = (n) => String(n).padStart(2, "0");

function exportCalendar(events, config = {}) {
  write("./docs/public/calendar.json", events);

  // Same events as calendar.json, as an iCalendar file (importable in Google Calendar)
  try {
    const ics = buildICS(events, {
      calendarName: config.info?.title ?? config.title ?? config.site?.title ?? "",
      siteUrl: config.dev?.siteurl ?? config.site?.siteurl ?? "",
    });
    const file = "./docs/public/calendar.ics";
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, ics, "utf8");
    console.log(`→ ${file}`);
  } catch (e) {
    console.error("Unable to export calendar.ics", e); // never break the build over the ICS
  }
}

function getEventAttachments(vevent) {
  const allAttachments = [];

  vevent.getAllProperties("attach").forEach((attach) => {
    let url = attach.getFirstValue();
    const encoding = attach.getParameter("encoding");
    const fmttype = attach.getParameter("fmttype") || "";
    // Only images are useful here (a PDF attached to the event is not a picture).
    if (fmttype && !fmttype.toLowerCase().startsWith("image/")) return;
    if (!url) return;
    url = String(url);

    if (encoding && encoding.toUpperCase() === "BASE64") {
      url = `data:${fmttype || "application/octet-stream"};base64,${url}`;
    } else if (url.includes("drive.google.com")) {
      const fileId = url.match(/\/d\/([^/]+)/)?.[1];
      if (fileId) {
        url = `https://drive.google.com/thumbnail?id=${fileId}&sz=s4000`;
      } else {
        url = url.replace("open", "thumbnail") + "&sz=s4000";
      }
    }
    allAttachments.push(url);
  });

  return allAttachments.length ? allAttachments : undefined;
}

// --- time helpers: everything is expressed in the site's zone (Europe/Madrid) ---

const dateFmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
const timeFmt = new Intl.DateTimeFormat("es-ES", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

// ICAL.Time -> { date: "YYYY-MM-DD" (zero padded, like native events), time: "HH:MM" | null (all-day) }
export function partsOf(t) {
  if (t.isDate) return { date: `${t.year}-${pad(t.month)}-${pad(t.day)}`, time: null };
  // Floating time (no TZID, no Z) = wall clock of the site's zone; don't shift it by the runner's zone.
  if (t.zone?.tzid === "floating") return { date: `${t.year}-${pad(t.month)}-${pad(t.day)}`, time: `${pad(t.hour)}:${pad(t.minute)}` };
  const js = t.toJSDate();
  return { date: dateFmt.format(js), time: timeFmt.format(js) };
}

const todayISO = (now) => dateFmt.format(now);

// First occurrence on/after `today` (YYYY-MM-DD) that is not in `skip` (a Set of
// YYYY-MM-DD). Recurring events are walked until then: ical.js honors the
// series' own EXDATE/COUNT/UNTIL, `skip` covers moved/cancelled single instances.
export function nextOccurrence(event, today, skip = new Set()) {
  if (!event.isRecurring()) {
    const p = partsOf(event.startDate);
    return p.date >= today && !skip.has(p.date) ? p : null;
  }
  const iterator = new ICAL.RecurExpansion({ component: event.component, dtstart: event.startDate });
  let next;
  let count = 0;
  while ((next = iterator.next())) {
    const p = partsOf(next);
    if (p.date >= today && !skip.has(p.date)) return p;
    if (++count > MAX_ITERATIONS) break;
  }
  return null;
}

// "1SA" -> SA + WEEK1 (native format); "-1FR" (last Friday) is kept as is, which
// intersectOptions() also accepts.
function splitByDay(items) {
  const byday = [];
  const byweek = [];
  for (const item of items) {
    const m = String(item).match(/^([+-]?\d+)?([A-Z]{2})$/);
    if (!m) continue;
    const [, n, day] = m;
    if (n && Number(n) < 0) {
      byday.push(`${n}${day}`);
    } else {
      byday.push(day);
      if (n) byweek.push(`WEEK${Number(n)}`);
    }
  }
  return { byday: formatWeekdays([...new Set(byday)]), byweek: [...new Set(byweek)] };
}

const DAY_CODES = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

// Weekdays / week-of-month of a recurring event in native format.
function recurrenceOf(event, firstDate) {
  if (!event.isRecurring()) return { byday: [], byweek: [] };
  const rrule = event.component.getFirstPropertyValue("rrule");
  const parts = rrule?.parts ?? {};
  const explicit = splitByDay(toArray(parts.BYDAY));
  if (explicit.byday.length) return explicit;

  const open = !parts.COUNT && !parts.UNTIL && (!rrule?.interval || rrule.interval === 1);
  // Weekly without BYDAY (Apple/Outlook style): it repeats on DTSTART's weekday.
  if (rrule?.freq === "WEEKLY" && open && firstDate) {
    const [y, m, d] = firstDate.split("-").map(Number);
    return { byday: [DAY_CODES[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]], byweek: [] };
  }
  // Daily forever: every day of the week.
  if (rrule?.freq === "DAILY" && open) return { byday: formatWeekdays(["MO", "TU", "WE", "TH", "FR", "SA", "SU"]), byweek: [] };
  return { byday: [], byweek: [] };
}

// Dates (YYYY-MM-DD) the series must skip: EXDATE (all values, there can be several per
// property) plus the original slot of every moved/cancelled instance.
function exceptionDates(comp) {
  const out = [];
  for (const prop of comp.getAllProperties("exdate")) {
    for (const v of prop.getValues()) out.push(partsOf(v).date);
  }
  return out;
}

const cleanTitle = (summary) => String(summary ?? "").split(/\s[-–—]\s/)[0].trim();

/**
 * Pure ICS text -> events in the shape buildEvents() produces for native events.
 * opts: { type, inferType, config, now }
 *   type       fixed type key (every event of the calendar gets it; its defaults fill gaps)
 *   inferType  legacy mode: guess the type from the title/description, else "ics"
 */
export function icsToEvents(text, { type: fixedType = null, inferType = false, config = {}, now = new Date() } = {}) {
  const defaultMap = buildDefaultMap(config);
  const typeTitles = buildTypeTitles(config);
  const today = todayISO(now);
  const comp = new ICAL.Component(ICAL.parse(text));

  const all = comp.getAllSubcomponents("vevent");
  // Moved / cancelled single instances of a recurring series (same UID, RECURRENCE-ID).
  const skipByUid = new Map();
  for (const v of all) {
    if (!v.hasProperty("recurrence-id")) continue;
    const uid = v.getFirstPropertyValue("uid");
    const rid = v.getFirstPropertyValue("recurrence-id");
    if (!skipByUid.has(uid)) skipByUid.set(uid, new Set());
    skipByUid.get(uid).add(partsOf(rid).date);
  }

  const events = [];
  for (const vevent of all) {
    const status = String(vevent.getFirstPropertyValue("status") ?? "").toUpperCase();
    if (status === "CANCELLED") continue;
    if (!vevent.hasProperty("dtstart")) continue;
    const event = new ICAL.Event(vevent);

    const skip = new Set(skipByUid.get(vevent.getFirstPropertyValue("uid")) ?? []);
    // A moved instance is a one-off event of its own: never skip its own date.
    if (vevent.hasProperty("recurrence-id")) skip.clear();
    const next = nextOccurrence(event, today, skip);
    if (!next) continue;

    let type = fixedType;
    if (!type) {
      const haystack = `${event.summary ?? ""} ${event.description ?? ""}`.toLowerCase();
      type = (inferType && Object.keys(defaultMap).find((k) => k && haystack.includes(k))) || "ics";
    }
    const defaults = defaultMap[type] || {};
    const title = cleanTitle(event.summary);

    // Location: the ICS text ("Leitza, Navarre, Spain" -> "Leitza"), else the type's default place.
    const rawLocation = String(event.location ?? "").split(",")[0].trim();
    const place = findPlaceByName(rawLocation, config) || (rawLocation ? { name: rawLocation, id: rawLocation } : defaults.location ? findPlace(toArray(defaults.location)[0], config) : undefined);

    const { byday, byweek } = recurrenceOf(event, next.date);
    const exceptions = event.isRecurring() ? [...new Set([...exceptionDates(vevent), ...skip])].filter((d) => d >= today).sort() : [];

    events.push({
      type,
      typeName: defaults.name,
      eventTypeTitle: typeTitles[type] || title,
      title,
      times: next.time ? [next.time] : [],
      dates: [next.date],
      images: toArray(getEventAttachments(vevent) || defaults.images),
      byday,
      byweek,
      notes: toArray(event.description || defaults.notes || defaults.description),
      language: defaults.language || null,
      locations: place?.name ? [place.name] : [],
      place,
      exceptions,
    });
  }
  return events;
}

// Downloads one ICS feed. Never logs the URL (private Google feeds carry a secret token
// and build logs are public); callers get the host only.
async function fetchICS(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  if (!text.includes("BEGIN:VCALENDAR")) throw new Error("not an iCalendar feed (is the calendar public?)");
  return text;
}

async function importFeed(url, options) {
  const host = new URL(url).host;
  try {
    const events = icsToEvents(await fetchICS(url), options);
    console.log(`calendar: ${host} -> ${events.length} upcoming events` + (options.type ? ` (type "${options.type}")` : ""));
    return events;
  } catch (error) {
    console.error(`calendar: could not import ${host}: ${error.message}`);
    return [];
  }
}

export async function fetchCalendar() {
  // Native events come from the pure calendar-core module (shared with the browser preview).
  const config = read("./docs/public/config.json");
  const evSettings = config.calendar?.events ?? { list: [], urls: [] };
  const events = buildEvents(config);

  /* Calendars attached to an event type: every event in them is of that type. */
  const used = new Set();
  for (const { key, urls } of typeCalendars(config)) {
    for (const url of urls) {
      if (used.has(url)) continue;
      used.add(url);
      events.push(...(await importFeed(url, { type: key, config })));
    }
  }

  /* Legacy: loose .ics urls whose events get their type guessed from the text. */
  for (const raw of toArray(evSettings.urls)) {
    const url = normalizeCalendarUrl(raw);
    if (!url) {
      console.error("calendar: ignoring an invalid calendar url");
      continue;
    }
    if (used.has(url)) continue; // already imported through an event type
    used.add(url);
    events.push(...(await importFeed(url, { inferType: true, config })));
  }

  const sorted = sortEvents(events);
  exportCalendar(sorted, config);
  console.log("Events parsed ", sorted?.length);
  return sorted;
}
