// Pure calendar logic (no fs / ical.js) so the browser preview can recompute
// native events from an unsaved config. ICS import + file output live in calendar.js.

// Normalizes an ICS recurrence option against the subset this factory
// understands (FREQ/BYDAY/BYMONTH/BYMONTHDAY/BYWEEK). When FREQ is ambiguous it
// heuristically infers WEEKLY (has a BYDAY) or MONTHLY (mentions a "WEEKn") —
// see SANITY.md for the caveats.
export function intersectOptions(options, field) {
  options = options.join(",").toUpperCase().split(",");
  const validValues = {
    FREQ: ["YEARLY", "MONTHLY", "WEEKLY", "DAILY"],
    BYDAY: ["MO", "TU", "WE", "TH", "FR", "SA", "SU", "1MO", "-1FR" /* etc */],
    BYMONTH: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    BYMONTHDAY: Array.from({ length: 31 }, (_, i) => i + 1),
    BYWEEK: ["WEEK1", "WEEK2", "WEEK3", "WEEK4", "WEEK5"],
    // Añade más campos según necesites
  };
  const validSet = new Set(validValues[field]);
  let valid = options.filter((opt) => validSet.has(opt));

  /*if (field == "BYDAY") {
    const weekMatch = options.join(",").match(/WEEK(\d+)/);
    if (!weekMatch) return valid;
    return valid.map((opt) => weekMatch[1] + opt);
  }*/
  if (field == "FREQ" && !valid.length) {
    const weekMatch = options.join(",").match(/WEEK(\d+)/);
    if (weekMatch) return ["MONTHLY"];

    const validBYDAYS = new Set(validValues["BYDAY"]);
    let byday = options.filter((opt) => validBYDAYS.has(opt));
    if (byday.length) return ["WEEKLY"];
  }
  return valid;
}

export function findPlaceName(id, config) {
  if (!id || !config?.info?.places) return id;
  for (const place of config.info.places) {
    if (place && place.id === id && place.name) return place.name;
  }
  return id;
}

export function findPlace(id, config) {
  if (!id || !config?.info?.places) return { name: id, id: id};
  for (const place of config.info.places) {
    if (place && place.id === id && place.name) return place;
  }
  return { name: id, id: id};
}


export function toArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") return [value];
  return [];
}

export function parseDateToISO(dateStr) {
  return dateStr.split("/").toReversed().join("-");
}

function isEmptyOverride(v) {
  return ( v === '' || (Array.isArray(v) && (v.length === 0 || (v.length === 1 && v[0] === ''))) );
}


// Map of lowercased type id -> defaults {title,image,description,...}.
export function buildDefaultMap(config) {
  const evTypes = config?.["event-types"]?.list ?? [];
  const defaultMap = {};
  for (const t of evTypes) {
    const key = (t.id || "").toLowerCase().trim();
    if (key) defaultMap[key] = t.defaults || {};
  }
  return defaultMap;
}

// Map of lowercased type id -> display title of the type (label, else the
// defaults' title/name). Mirrors eventPages.typeTitle minus its final fallback to
// the raw id: types without any title are left out so callers can fall back to
// the event's own title instead of showing an id like "mass".
export function buildTypeTitles(config) {
  const evTypes = config?.["event-types"]?.list ?? [];
  const titles = {};
  for (const t of evTypes) {
    const key = (t?.id || "").toLowerCase().trim();
    const title = t?.label || t?.defaults?.title || t?.defaults?.name || "";
    if (key && title) titles[key] = title;
  }
  return titles;
}

// ---------------------------------------------------------------------------
// External calendars (ICS / Google Calendar) attached to an event type.
// Pure string logic, so it is shared by the build (calendar.js) and any preview.
// ---------------------------------------------------------------------------

const GOOGLE_ICAL = (id) => `https://calendar.google.com/calendar/ical/${encodeURIComponent(id)}/public/basic.ics`;
const looksLikeCalendarId = (s) => /^[^\s/@]+@(group\.calendar\.google\.com|gmail\.com|googlemail\.com|import\.calendar\.google\.com|[a-z0-9.-]+\.[a-z]{2,})$/i.test(s);

// Turns whatever the editor user pasted into a fetchable https ICS URL, or null.
// Accepts: an .ics URL (https/http/webcal), Google's "public address in iCal
// format", the "embed" / "?cid=" share links, or a bare Google calendar id
// (xxx@group.calendar.google.com). Never returns a non-https URL: the build
// only fetches https (http is upgraded, anything else is rejected).
export function normalizeCalendarUrl(value) {
  let raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return null;

  if (looksLikeCalendarId(raw)) return GOOGLE_ICAL(raw);

  raw = raw.replace(/^webcals?:\/\//i, "https://").replace(/^http:\/\//i, "https://");
  if (!/^https:\/\//i.test(raw)) raw = "https://" + raw; // "calendar.google.com/..." pasted without scheme
  let url;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || !url.hostname.includes(".")) return null;

  if (url.hostname === "calendar.google.com") {
    // Already the iCal feed.
    if (url.pathname.startsWith("/calendar/ical/")) return url.toString();
    // .../calendar/embed?src=<id>  (the "public URL" / embed code)
    const src = url.searchParams.get("src");
    if (src) return GOOGLE_ICAL(src);
    // .../calendar/u/0?cid=<base64(id)>  (the "share" link)
    const cid = url.searchParams.get("cid");
    if (cid) {
      if (looksLikeCalendarId(cid)) return GOOGLE_ICAL(cid);
      try {
        const id = atob(cid.replace(/-/g, "+").replace(/_/g, "/"));
        if (looksLikeCalendarId(id)) return GOOGLE_ICAL(id);
      } catch {}
      return null;
    }
  }
  return url.toString();
}

// [{ key, type, urls }] for every event type that has a `calendar` set. `calendar`
// may be a string or a list of strings; invalid entries are dropped.
export function typeCalendars(config) {
  const out = [];
  for (const t of config?.["event-types"]?.list ?? []) {
    const key = (t?.id || "").toLowerCase().trim();
    if (!key) continue;
    const urls = [...new Set(toArray(t.calendar).map(normalizeCalendarUrl).filter(Boolean))];
    if (urls.length) out.push({ key, type: t, urls });
  }
  return out;
}

// Name of a place compared loosely (case/accents/spacing), to link a free-text ICS
// location such as "Leitza" to a place of config.info.places.
const looseName = (s) => String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
export function findPlaceByName(name, config) {
  const n = looseName(name);
  if (!n) return null;
  for (const place of config?.info?.places ?? []) {
    if (place && (looseName(place.name) === n || looseName(place.id) === n)) return place;
  }
  return null;
}

// Native events from config.calendar.events.list (unsorted). `now` is injectable for tests.
export function buildEvents(config, now = new Date()) {
  const evSettings = config?.calendar?.events ?? { list: [], urls: [] };
  const defaultMap = buildDefaultMap(config);
  const typeTitles = buildTypeTitles(config);
  const events = [];

  for (const evt of evSettings.list || []) {
    if (!evt || typeof evt !== "object") continue;
    const type = (evt.type || "").toLowerCase();

    // Merge defaults with the explicit event fields (event wins).
    const defaults_ = defaultMap[type] || {};
    // prefer default value than event fields set to empty
    const filtered = Object.fromEntries(Object.entries(evt).filter(([, v]) => !isEmptyOverride(v)));
    const e = { ...defaults_, ...filtered };

    // Filter out past events (events with no date, and periodic events are unfiltered by design)
    let dates = toArray(e.date).map((d) => parseDateToISO(d)).filter(Boolean);
    if (dates.length) {
      const today = new Date(now);
      today.setHours(0, 0, 0, 0); // Our "date" value includes no time (so it is 00.00 by default) while "now" has the current time by default
      dates = dates.filter((date) => new Date(date) >= today);
      // if we had dates, but we no longer have any => all dates were in the past :)
      if (!dates?.length) {
        // If it is not recurring skip event
        if (!e.rrule?.length) continue;
        if (e.rrule?.length == 1 && ["never", ""].includes(e.rrule[0])) continue;
      }
    }

    const title = e.title || e.summary || "";
    events.push({
      type: type,
      typeName: defaultMap[type]?.name,
      // Heading to group by: the type's title, or the event's own title when its
      // type has none (so untyped events still get a table, and the default
      // ordering's `title-eventTypeTitle` doesn't repeat it).
      eventTypeTitle: typeTitles[type] || title,
      title,
      times: toArray(e.times).join("||").replaceAll(".", ":").split("||").filter(Boolean),
      dates: dates,
      images: toArray(e.images),
      byday: intersectOptions(toArray(e.rrule), "BYDAY"),
      byweek: intersectOptions(toArray(e.rrule), "BYWEEK"),
      notes: toArray(e.notes || e.description),
      language: e.language || null,
      locations: toArray(e.location).map((id) => findPlaceName(id, config)),
      place: toArray(e.location).map((id) => findPlace(id, config))[0],
      exceptions: toArray(e.except),
      // Page for this event: the event's own switch, else the type's default; left
      // undefined when neither is set (eventPages.js then falls back to the type's mode).
      createPage: typeof e.createPage === "boolean" ? e.createPage : undefined,
    });
  }
  return events;
}

export function sortEvents(events) {
  function comp(a, b, key, def = "000") {
    return (a[key]?.[0]?.padStart(3, "0") || def).localeCompare(b[key]?.[0]?.padStart(3, "0") || def);
  }
  return events.toSorted((a, b) => comp(a, b, "dates") || comp(a, b, "times") || comp(a, b, "byweek") || comp(a, b, "byday") || comp(a, b, "title"));
}
