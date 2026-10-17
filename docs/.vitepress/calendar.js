import ICAL from "ical.js";
import { read, write, fs, path } from "./node_utils.js";
import { formatWeekdays } from "./utils.js";
import { buildEvents, buildDefaultMap, sortEvents, toArray, parseDateToISO } from "./calendar-core.js";
import { buildICS } from "./ics.js";

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

export async function fetchCalendar() {
  // Native events come from the pure calendar-core module (shared with the browser preview).
  const config = read("./docs/public/config.json");
  const evSettings = config.calendar?.events ?? { list: [], urls: [] };
  const defaultMap = buildDefaultMap(config);
  const events = buildEvents(config);

  /*
  Import external .ics calendars
  */

  for (var i = 0; i < evSettings.urls?.length; i++) {
    const url = evSettings.urls[i];
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
        const validTypes = Object.keys(defaultMap);
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
          images: toArray(getEventAttachments(eventComp) || defaultMap[type]?.image),
          notes: toArray(event.description || defaultMap[type]?.description),
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
  const sorted = sortEvents(events);
  exportCalendar(sorted, config);
  console.log("Events parsed ", sorted?.length);
  return sorted;
}
