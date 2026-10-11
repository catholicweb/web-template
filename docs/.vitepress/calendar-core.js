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

function findPlaceName(id, config) {
  if (!id || !config?.info?.places) return id;
  for (const place of config.info.places) {
    if (place && place.id === id && place.name) return place.name;
  }
  return id;
}

function findPlace(id, config) {
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

// Native events from config.calendar.events.list (unsorted). `now` is injectable for tests.
export function buildEvents(config, now = new Date()) {
  const evSettings = config?.calendar?.events ?? { list: [], urls: [] };
  const defaultMap = buildDefaultMap(config);
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

    events.push({
      type: type,
      typeName: defaultMap[type]?.name,
      title: e.title || e.summary || "",
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
