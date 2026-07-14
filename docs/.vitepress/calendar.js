import ICAL from "ical.js";
import { read, write } from "./node_utils.js";
import { formatWeekdays } from "./utils.js";

function exportCalendar(events) {
  // TODO: export also as ICS
  write("./docs/public/calendar.json", events);
}

function getEventAttachments(vevent) {
  const allAttachments = [];

  vevent.getAllProperties("attach").forEach((attach) => {
    // 2. Extract the value (usually a URL)
    let url = attach.getFirstValue();

    // 3. Handle Binary Attachments
    // Some providers embed the file. If it's binary, we create a Data URI.
    const encoding = attach.getParameter("encoding");
    const fmttype = attach.getParameter("fmttype") || "application/octet-stream";

    if (encoding && encoding.toUpperCase() === "BASE64") {
      url = `data:${fmttype};base64,${url}`;
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

  if (!allAttachments.length) return;

  return allAttachments;
}

function getNextOccurrence(event, relativeTo = ICAL.Time.now()) {
  // 1. If it's not recurring, just check if the start date is in the future
  if (!event.isRecurring()) {
    return event.startDate.compare(relativeTo) >= 0 ? parseDateToISO(event.startDate.toJSDate().toLocaleDateString("es-ES")) : null;
  }

  // 2. Setup the expansion engine
  const iterator = new ICAL.RecurExpansion({
    component: event.component,
    dtstart: event.startDate,
  });

  // 3. Skip all occurrences that happened before "relativeTo"
  let next;
  let iterCount = 0;
  while ((next = iterator.next())) {
    if (next.compare(relativeTo) >= 0) {
      return parseDateToISO(next.toJSDate().toLocaleDateString("es-ES")); // This is the first occurrence in the future
    }

    // Safety break: Prevent slow/infinite loops on poorly formed rules
    if (++iterCount > 1000 || (iterator.last && iterator.last.year > relativeTo.year + 10)) break;
  }

  return null; // No future occurrences found
}

function splitRRuleByDay(byDayArray) {
  const simpleByDay = [];
  const simpleByWeek = [];

  byDayArray.forEach((item) => {
    // Regex logic:
    // ^(-?\d+)? matches an optional positive or negative number at the start
    // ([A-Z]{2})$ matches exactly two uppercase letters at the end
    const match = item.match(/^(-?\d+)?([A-Z]{2})$/);

    if (match) {
      const weekNum = match[1]; // e.g., "3", "-1", or undefined
      const dayAbbr = match[2]; // e.g., "SA", "SU"

      simpleByDay.push(dayAbbr);

      // If no number is present (like "SU"), we'll store an empty string or null
      simpleByWeek.push(weekNum ? `WEEK${weekNum}` : "");
    }
  });

  return { simpleByDay: formatWeekdays(simpleByDay), simpleByWeek };
}

function getTime(t) {
  t.isUTC = true;
  return t.toJSDate().toLocaleTimeString("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Madrid",
  });
  /*const hora = String(t.hour).padStart(2, "0");
  const minuto = String(t.minute).padStart(2, "0");
  return `${hora}:${minuto}`;*/
}

function intersectOptions(options, field) {
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

function toArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") return [value];
  return [];
}

function parseDateToISO(dateStr) {
  return dateStr.split("/").toReversed().join("-");
}

export async function fetchCalendar() {
  let input = read("./docs/public/pages/events.json");
  const events = [];

  Object.keys(input).forEach((key) => {
    if (!key.startsWith("events")) return;
    console.log("Parsing ", key, input[key]?.length);
    for (var i = 0; i < input[key].length; i++) {
      const def = input[key][i];
      const custom = def.custom || [{}];
      // Iterate over each custom sub-item
      for (var j = 0; j < custom.length; j++) {
        const e = { ...def, ...custom[j] };
        const type = key.split("-")[1];
        // Filter out past events
        let dates = toArray(e.date).map((d) => parseDateToISO(d));
        if (dates.length) {
          const now = new Date();
          now.setHours(0, 0, 0, 0); // Our "date" value includes no time (so it is 00.00 by default) while "now" has the current time by default
          dates = dates.filter((date) => new Date(date) >= now);
        }
        if (!dates?.length && !e.rrule?.length) {
          continue;
        }
        events.push({
          type: type,
          title: e.title || e.summary || "",
          times: toArray(e.times).join("||").replaceAll(".", ":").split("||"),
          dates: dates,
          //rrule: toArray(e.rrule).map((r) => r.toUpperCase()),
          images: toArray(e.image || input.default?.[type]?.image),
          byday: intersectOptions(toArray(e.rrule), "BYDAY"),
          byweek: intersectOptions(toArray(e.rrule), "BYWEEK"),
          //freq: intersectOptions(toArray(e.rrule), "FREQ"),
          notes: toArray(e.notes || input.default?.[type]?.description),
          language: e.language || null,
          //end: [],
          locations: toArray(e.location),
          exceptions: toArray(e.except),
        });
      }
    }
  });

  /*
  Import external .ics calendars
  */

  for (var i = 0; i < input.urls?.length; i++) {
    const url = input.urls[i];
    try {
      const res = await fetch(url);
      const text = await res.text();
      const jcalData = ICAL.parse(text);
      const comp = new ICAL.Component(jcalData);
      const vevents = comp.getAllSubcomponents("vevent");

      console.log("Parsing ics events", vevents?.length);
      vevents.forEach((eventComp, index) => {
        const event = new ICAL.Event(eventComp);
        let rrule = [];
        let exceptions = [];
        // Infer type
        const validTypes = Object.keys(input.default || {}).map((key) => key.replace(/^event-/, ""));
        const type = validTypes.find((typeKey) => `${event.summary} ${event.description}`?.toLowerCase()?.includes(typeKey?.toLowerCase())) || "ics";

        const dates = toArray(getNextOccurrence(event));
        if (!dates.length) return;

        if (event.isRecurring()) {
          // Get the recurrence rule
          const rruleProp = event.component.getFirstProperty("rrule");
          rrule = rruleProp ? rruleProp.getFirstValue() : null;

          // Get exception dates
          exceptions = event.component.getAllProperties("exdate").map((p) => {
            return p.getFirstValue().toJSDate();
          });
        }
        events.push({
          type: type,
          title: event.summary?.split("-")[0].trim() || "",
          times: toArray(getTime(event.startDate)),
          dates: dates,
          //end: event.endDate.toJSDate(),
          images: toArray(getEventAttachments(eventComp) || input.default?.[type]?.image),
          notes: toArray(event.description || input.default?.[type]?.description),
          locations: toArray(event.location?.split(",")[0]), // Usually "Leitza, Navarre, Spain" -> "Leitza"
          byday: toArray(rrule?.parts?.BYDAY),
          //...JSON.parse(JSON.stringify(rrule || {})),
          exceptions: toArray(exceptions),
          //freq: toArray(rrule?.freq),
        });
        console.log(events[events.length - 1]);
      });
    } catch (error) {
      console.error("Error loading calendar data:", error);
    }
  }
  function comp(a, b, key, def = "000") {
    return (a[key]?.[0]?.padStart(3, "0") || def).localeCompare(b[key]?.[0]?.padStart(3, "0") || def);
  }
  const sorted = events.toSorted((a, b) => comp(a, b, "dates") || comp(a, b, "times") || comp(a, b, "byweek") || comp(a, b, "byday") || comp(a, b, "title"));
  exportCalendar(sorted);
  console.log("Events parsed ", sorted?.length);
  return sorted;
}
