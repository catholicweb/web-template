import { describe, it, expect } from "vitest";
import { buildICS, buildRules, parseDate, parseTime, fold } from "../../docs/.vitepress/ics.js";

const now = new Date("2026-10-11T10:00:00Z"); // a Sunday
const unfold = (s) => s.replace(/\r\n /g, "");

describe("parsers", () => {
  it("parses padded, unpadded and DD/MM/YYYY dates", () => {
    expect(parseDate("2026-03-05")).toEqual({ y: 2026, m: 3, d: 5 });
    expect(parseDate("2026-3-5")).toEqual({ y: 2026, m: 3, d: 5 });
    expect(parseDate("05/03/2026")).toEqual({ y: 2026, m: 3, d: 5 });
    expect(parseDate("nope")).toBeNull();
  });

  it("parses times and rejects garbage", () => {
    expect(parseTime("19:30")).toEqual({ h: 19, mi: 30 });
    expect(parseTime("9.30")).toEqual({ h: 9, mi: 30 });
    expect(parseTime("")).toBeNull();
    expect(parseTime("25:00")).toBeNull();
  });

  it("combines byday with byweek and keeps explicit nth prefixes", () => {
    expect(buildRules(["SU"], ["WEEK1", "WEEK3"])).toEqual([
      { n: 1, day: "SU" },
      { n: 3, day: "SU" },
    ]);
    expect(buildRules(["-1FR", "MO"], [])).toEqual([
      { n: -1, day: "FR" },
      { n: null, day: "MO" },
    ]);
  });
});

describe("buildICS", () => {
  it("emits a weekly rule starting on the next matching day, with exceptions", () => {
    const ics = unfold(
      buildICS([{ title: "Misa", type: "misa", times: ["19:30"], dates: [], byday: ["SU"], byweek: [], exceptions: ["25/12/2026"] }], { now }),
    );
    expect(ics).toContain("DTSTART;TZID=Europe/Madrid:20261011T193000");
    expect(ics).toContain("DTEND;TZID=Europe/Madrid:20261011T203000");
    expect(ics).toContain("RRULE:FREQ=WEEKLY;BYDAY=SU");
    expect(ics).toContain("EXDATE;TZID=Europe/Madrid:20261225T193000");
  });

  it("uses a monthly rule for nth-week events and one VEVENT per time", () => {
    const ics = buildICS([{ title: "Adoración", times: ["10:00", "18:00"], dates: [], byday: ["MO"], byweek: ["WEEK1"] }], { now });
    expect(ics).toContain("RRULE:FREQ=MONTHLY;BYDAY=1MO");
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
  });

  it("turns extra one-off dates into RDATE and handles all-day events", () => {
    const ics = buildICS(
      [
        { title: "Concierto", times: ["23:30"], dates: ["2026-12-24", "2026-12-31"], byday: [] },
        { title: "Fiesta", times: [], dates: ["2026-12-08"], byday: [] },
      ],
      { now },
    );
    expect(ics).toContain("RDATE;TZID=Europe/Madrid:20261231T233000");
    expect(ics).toContain("DTEND;TZID=Europe/Madrid:20261225T003000"); // crosses midnight
    expect(ics).toContain("DTSTART;VALUE=DATE:20261208");
  });

  it("skips events that cannot be placed in time and escapes text", () => {
    const ics = unfold(buildICS([{ title: "nada" }, { title: "A, B; C", dates: ["2026-12-08"], notes: ["x\ny"] }], { now }));
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(1);
    expect(ics).toContain("SUMMARY:A\\, B\\; C");
    expect(ics).toContain("DESCRIPTION:x\\ny");
  });

  it("keeps UIDs stable between builds and lines within 75 octets", () => {
    const ev = [{ title: "Ñandú ".repeat(30), times: ["19:30"], dates: [], byday: ["SU"] }];
    const a = buildICS(ev, { now });
    const b = buildICS(ev, { now: new Date("2026-10-20T10:00:00Z") });
    expect(a.match(/UID:.*/)[0]).toBe(b.match(/UID:.*/)[0]);
    for (const line of a.split("\r\n")) expect(Buffer.byteLength(line)).toBeLessThanOrEqual(75);
    expect(a.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });

  it("fold never splits a multibyte character", () => {
    const folded = fold("X:" + "ñ".repeat(100));
    expect(folded.replace(/\r\n /g, "")).toBe("X:" + "ñ".repeat(100));
  });
});
