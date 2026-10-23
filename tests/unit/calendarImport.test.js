import { describe, it, expect } from "vitest";
import { icsToEvents, nextOccurrence } from "../../docs/.vitepress/calendar.js";
import { normalizeCalendarUrl, typeCalendars, sortEvents } from "../../docs/.vitepress/calendar-core.js";

const now = new Date("2026-10-24T09:00:00Z"); // Saturday
const wrap = (body) => `BEGIN:VCALENDAR\nVERSION:2.0\n${body}\nEND:VCALENDAR`;

const config = {
  "event-types": {
    list: [
      { id: "T-CATE", label: "Catequesis", defaults: { images: ["https://img/default.jpg"], location: "p1", language: "Euskara:eu", description: "Nota por defecto" } },
      { id: "mass", label: "Misa" },
    ],
  },
  info: { places: [{ id: "p1", name: "Leitza", address: "Calle 1" }, { id: "p2", name: "Ezkurra" }] },
};

describe("normalizeCalendarUrl", () => {
  const ICAL = (id) => `https://calendar.google.com/calendar/ical/${encodeURIComponent(id)}/public/basic.ics`;
  it("accepts ics urls, upgrading webcal/http to https", () => {
    expect(normalizeCalendarUrl("webcal://example.org/cal.ics")).toBe("https://example.org/cal.ics");
    expect(normalizeCalendarUrl("http://example.org/cal.ics")).toBe("https://example.org/cal.ics");
    expect(normalizeCalendarUrl("  https://example.org/cal.ics ")).toBe("https://example.org/cal.ics");
  });
  it("understands every way Google hands out a calendar", () => {
    const id = "abc123@group.calendar.google.com";
    expect(normalizeCalendarUrl(id)).toBe(ICAL(id));
    expect(normalizeCalendarUrl(`https://calendar.google.com/calendar/embed?src=${encodeURIComponent(id)}&ctz=Europe%2FMadrid`)).toBe(ICAL(id));
    expect(normalizeCalendarUrl(`https://calendar.google.com/calendar/u/0?cid=${btoa(id)}`)).toBe(ICAL(id));
    const feed = "https://calendar.google.com/calendar/ical/abc%40group.calendar.google.com/private-xyz/basic.ics";
    expect(normalizeCalendarUrl(feed)).toBe(feed);
  });
  it("rejects anything that is not https-able", () => {
    for (const bad of ["", null, undefined, 5, "file:///etc/passwd", "javascript:alert(1)", "ftp://x.org/a.ics", "nonsense"]) {
      expect(normalizeCalendarUrl(bad)).toBeNull();
    }
  });
});

describe("typeCalendars", () => {
  it("lists calendars per type (string or list), dropping invalid and duplicate entries", () => {
    const cfg = { "event-types": { list: [
      { id: "A", calendar: "webcal://x.org/a.ics" },
      { id: "B", calendar: ["https://x.org/b.ics", "https://x.org/b.ics", "nope"] },
      { id: "C" },
    ] } };
    expect(typeCalendars(cfg).map((t) => [t.key, t.urls])).toEqual([["a", ["https://x.org/a.ics"]], ["b", ["https://x.org/b.ics"]]]);
  });
});

describe("icsToEvents: shape and dates", () => {
  it("gives every event of a typed calendar that type, with native-shaped fields", () => {
    const ics = wrap(`BEGIN:VEVENT\nUID:1\nDTSTART:20261105T170000Z\nSUMMARY:Catequesis 1º\nLOCATION:Ezkurra, Navarra\nDESCRIPTION:Traer libro\nEND:VEVENT`);
    const [e] = icsToEvents(ics, { type: "t-cate", config, now });
    expect(e).toMatchObject({ type: "t-cate", eventTypeTitle: "Catequesis", title: "Catequesis 1º", dates: ["2026-11-05"], times: ["18:00"], byday: [], byweek: [], exceptions: [], notes: ["Traer libro"], language: "Euskara:eu", locations: ["Ezkurra"] });
    expect(e.place.id).toBe("p2");
  });

  it("falls back to the type's defaults (images, place, notes) when the event has none", () => {
    const [e] = icsToEvents(wrap(`BEGIN:VEVENT\nUID:1\nDTSTART:20261105T170000Z\nSUMMARY:X\nEND:VEVENT`), { type: "t-cate", config, now });
    expect(e.images).toEqual(["https://img/default.jpg"]);
    expect(e.place.name).toBe("Leitza");
    expect(e.notes).toEqual(["Nota por defecto"]);
  });

  it("zero-pads dates so they sort against native events", () => {
    const ics = wrap(`BEGIN:VEVENT\nUID:1\nDTSTART:20261203T100000Z\nSUMMARY:B\nEND:VEVENT\nBEGIN:VEVENT\nUID:2\nDTSTART:20261110T100000Z\nSUMMARY:A\nEND:VEVENT`);
    const sorted = sortEvents(icsToEvents(ics, { type: "mass", config, now }));
    expect(sorted.map((e) => e.dates[0])).toEqual(["2026-11-10", "2026-12-03"]);
  });

  it("uses Madrid time for UTC, TZID and floating times, and no time for all-day events", () => {
    const ics = wrap([
      "BEGIN:VEVENT\nUID:z\nDTSTART:20261105T170000Z\nSUMMARY:Z\nEND:VEVENT", // 18:00 CET
      "BEGIN:VEVENT\nUID:s\nDTSTART:20260805T170000Z\nSUMMARY:S\nEND:VEVENT", // 19:00 CEST (past -> dropped)
      "BEGIN:VEVENT\nUID:f\nDTSTART:20261106T183000\nSUMMARY:F\nEND:VEVENT",
      "BEGIN:VEVENT\nUID:d\nDTSTART;VALUE=DATE:20261107\nSUMMARY:D\nEND:VEVENT",
      "BEGIN:VEVENT\nUID:late\nDTSTART:20261108T233000Z\nSUMMARY:Late\nEND:VEVENT", // already 9 Nov in Madrid
    ].join("\n"));
    const by = Object.fromEntries(icsToEvents(ics, { type: "mass", config, now }).map((e) => [e.title, e]));
    expect(by.Z).toMatchObject({ dates: ["2026-11-05"], times: ["18:00"] });
    expect(by.S).toBeUndefined();
    expect(by.F).toMatchObject({ dates: ["2026-11-06"], times: ["18:30"] });
    expect(by.D).toMatchObject({ dates: ["2026-11-07"], times: [] });
    expect(by.Late).toMatchObject({ dates: ["2026-11-09"], times: ["00:30"] });
  });

  it("keeps today's events and drops past ones", () => {
    const ics = wrap(`BEGIN:VEVENT\nUID:t\nDTSTART:20261024T060000Z\nSUMMARY:Today\nEND:VEVENT\nBEGIN:VEVENT\nUID:y\nDTSTART:20261023T060000Z\nSUMMARY:Yesterday\nEND:VEVENT`);
    expect(icsToEvents(ics, { type: "mass", config, now }).map((e) => e.title)).toEqual(["Today"]);
  });

  it("only cuts the title at ' - ', not at hyphens inside words", () => {
    const ics = wrap(`BEGIN:VEVENT\nUID:1\nDTSTART:20261105T170000Z\nSUMMARY:Pre-confirmación - Leitza\nEND:VEVENT`);
    expect(icsToEvents(ics, { type: "mass", config, now })[0].title).toBe("Pre-confirmación");
  });

  it("skips cancelled events and non-image attachments", () => {
    const ics = wrap(`BEGIN:VEVENT\nUID:c\nDTSTART:20261105T170000Z\nSTATUS:CANCELLED\nSUMMARY:Cancelled\nEND:VEVENT\nBEGIN:VEVENT\nUID:a\nDTSTART:20261105T170000Z\nSUMMARY:A\nATTACH;FMTTYPE=application/pdf:https://x/doc.pdf\nEND:VEVENT`);
    const out = icsToEvents(ics, { type: "mass", config, now });
    expect(out.map((e) => e.title)).toEqual(["A"]);
    expect(out[0].images).toEqual([]);
  });
});

describe("icsToEvents: recurrence", () => {
  const TZ = `BEGIN:VTIMEZONE\nTZID:Europe/Madrid\nBEGIN:STANDARD\nDTSTART:19701025T030000\nRRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU\nTZOFFSETFROM:+0200\nTZOFFSETTO:+0100\nEND:STANDARD\nBEGIN:DAYLIGHT\nDTSTART:19700329T020000\nRRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU\nTZOFFSETFROM:+0100\nTZOFFSETTO:+0200\nEND:DAYLIGHT\nEND:VTIMEZONE`;

  it("does not drop long-running daily series (old 1000-iteration cap)", () => {
    const ics = wrap(`${TZ}\nBEGIN:VEVENT\nUID:d\nDTSTART;TZID=Europe/Madrid:20180101T080000\nRRULE:FREQ=DAILY\nSUMMARY:Misa diaria\nEND:VEVENT`);
    const [e] = icsToEvents(ics, { type: "mass", config, now });
    expect(e).toMatchObject({ dates: ["2026-10-24"], times: ["08:00"] });
    expect(e.byday).toEqual(["MO,TU,WE,TH,FR", "SA", "SU"]);
  });

  it("honors every date of a multi-value EXDATE", () => {
    const ics = wrap(`${TZ}\nBEGIN:VEVENT\nUID:d\nDTSTART;TZID=Europe/Madrid:20180101T080000\nRRULE:FREQ=DAILY\nEXDATE;TZID=Europe/Madrid:20261024T080000,20261025T080000\nSUMMARY:Misa\nEND:VEVENT`);
    const [e] = icsToEvents(ics, { type: "mass", config, now });
    expect(e.dates).toEqual(["2026-10-26"]);
    expect(e.exceptions).toEqual(["2026-10-24", "2026-10-25"]);
  });

  it("splits nth weekdays into byday + byweek, keeps 'last' as -1XX", () => {
    const ics = wrap(`${TZ}\nBEGIN:VEVENT\nUID:m\nDTSTART;TZID=Europe/Madrid:20260103T190000\nRRULE:FREQ=MONTHLY;BYDAY=1SA,3SA\nSUMMARY:Monthly\nEND:VEVENT\nBEGIN:VEVENT\nUID:l\nDTSTART;TZID=Europe/Madrid:20260130T190000\nRRULE:FREQ=MONTHLY;BYDAY=-1FR\nSUMMARY:Last\nEND:VEVENT`);
    const by = Object.fromEntries(icsToEvents(ics, { type: "mass", config, now }).map((e) => [e.title, e]));
    expect(by.Monthly).toMatchObject({ byday: ["SA"], byweek: ["WEEK1", "WEEK3"], dates: ["2026-11-07"] });
    expect(by.Last).toMatchObject({ byday: ["-1FR"], byweek: [], dates: ["2026-10-30"] });
  });

  it("infers the weekday of a weekly series without BYDAY", () => {
    const ics = wrap(`BEGIN:VEVENT\nUID:w\nDTSTART:20260101T170000Z\nRRULE:FREQ=WEEKLY\nSUMMARY:Weekly\nEND:VEVENT`); // a Thursday
    expect(icsToEvents(ics, { type: "mass", config, now })[0].byday).toEqual(["TH"]);
  });

  it("a moved instance replaces the original slot instead of duplicating it", () => {
    const ics = wrap(`${TZ}\nBEGIN:VEVENT\nUID:w\nDTSTART;TZID=Europe/Madrid:20200101T180000\nRRULE:FREQ=WEEKLY;BYDAY=TH\nSUMMARY:Weekly\nEND:VEVENT\nBEGIN:VEVENT\nUID:w\nRECURRENCE-ID;TZID=Europe/Madrid:20261029T180000\nDTSTART;TZID=Europe/Madrid:20261030T190000\nSUMMARY:Weekly\nEND:VEVENT`);
    const out = icsToEvents(ics, { type: "mass", config, now });
    const series = out.find((e) => e.byday.length);
    const moved = out.find((e) => !e.byday.length);
    expect(series.dates).toEqual(["2026-11-05"]); // the 29th was moved, so the series skips it
    expect(series.exceptions).toEqual(["2026-10-29"]);
    expect(moved).toMatchObject({ dates: ["2026-10-30"], times: ["19:00"], exceptions: [] });
  });

  it("an ended series produces nothing", () => {
    const ics = wrap(`BEGIN:VEVENT\nUID:e\nDTSTART:20260101T170000Z\nRRULE:FREQ=WEEKLY;COUNT=3\nSUMMARY:Ended\nEND:VEVENT`);
    expect(icsToEvents(ics, { type: "mass", config, now })).toEqual([]);
  });
});

describe("icsToEvents: legacy type inference", () => {
  it("guesses the type from the text, else 'ics'", () => {
    const ics = wrap(`BEGIN:VEVENT\nUID:1\nDTSTART:20261105T170000Z\nSUMMARY:Misa mass de 12\nEND:VEVENT\nBEGIN:VEVENT\nUID:2\nDTSTART:20261105T170000Z\nSUMMARY:Otra cosa\nEND:VEVENT`);
    expect(icsToEvents(ics, { inferType: true, config, now }).map((e) => e.type)).toEqual(["mass", "ics"]);
  });
});

describe("nextOccurrence", () => {
  it("is exported for callers that need a single date", () => {
    expect(typeof nextOccurrence).toBe("function");
  });
});
