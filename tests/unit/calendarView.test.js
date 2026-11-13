import { describe, it, expect } from "vitest";
import { rowKind, lineStatus, tableView, horizonLimit, toISODay, buildDay } from "../../docs/.vitepress/calendar-view.js";
import { groupEvents, assembleOrder } from "../../docs/.vitepress/utils.js";
import { calendarLabels } from "../../docs/.vitepress/calendarLabels.js";

// 2026-11-12 is a Thursday, the 2nd Thursday of the month.
const TODAY = "2026-11-12";
const status = (rowKey, stubs, today = TODAY, months = 0) => lineStatus(rowKey, stubs, today, months);

describe("rowKind", () => {
  it("tells dates, weekdays and anything else apart", () => {
    expect(rowKind("2026-12-24")).toEqual({ type: "date", iso: "2026-12-24" });
    expect(rowKind("SA#2")).toEqual({ type: "days", days: ["SA"] });
    expect(rowKind("MO,TU,WE,TH,FR")).toEqual({ type: "days", days: ["MO", "TU", "WE", "TH", "FR"] });
    expect(rowKind("Misa")).toEqual({ type: "other" });
    expect(rowKind("")).toEqual({ type: "other" });
  });
});

describe("today", () => {
  it("marks the dated row of today, and only that one", () => {
    expect(status("2026-11-12", [{}]).today).toBe(true);
    expect(status("2026-11-13", [{}]).today).toBe(false);
  });

  it("marks a weekly line on its weekday, and weekday groups that contain it", () => {
    expect(status("TH", [{}]).today).toBe(true);
    expect(status("MO,TU,WE,TH,FR", [{}]).today).toBe(true);
    expect(status("SA", [{}]).today).toBe(false);
  });

  it("marks a week-restricted line only on that week of the month", () => {
    expect(status("TH", [{ byweek: ["WEEK2"] }]).today).toBe(true);
    expect(status("TH", [{ byweek: ["WEEK1", "WEEK3"] }]).today).toBe(false);
  });

  it("does not mark a recurring line before its first date", () => {
    expect(status("TH", [{ dates: ["2026-11-19"] }]).today).toBe(false);
    expect(status("TH", [{ dates: ["2026-11-05"] }]).today).toBe(true);
  });

  it("ignores rows it does not understand", () => {
    expect(status("Misa", [{}])).toEqual({ today: false, muted: false, far: false });
  });
});

describe("week of the month (muted)", () => {
  it("does not mute lines without weeks, or dated rows", () => {
    expect(status("SA", [{}]).muted).toBe(false);
    expect(status("2026-12-05", [{ byweek: ["WEEK1"] }]).muted).toBe(false);
  });

  it("mutes a week-restricted line that does not happen in the next 7 days", () => {
    // Saturdays in the next 7 days: 14 Nov = 2nd Saturday
    expect(status("SA", [{ byweek: ["WEEK1"] }]).muted).toBe(true);
    expect(status("SA", [{ byweek: ["WEEK2"] }]).muted).toBe(false);
    expect(status("SA", [{ byweek: ["WEEK1", "WEEK2"] }]).muted).toBe(false);
  });

  it("works across the end of the month (the next Saturday is the 1st)", () => {
    // Wed 30 Dec 2026: 5th week of the month, but Saturday 2 Jan is the 1st Saturday
    expect(status("SA", [{ byweek: ["WEEK1"] }], "2026-12-30").muted).toBe(false);
    expect(status("SA", [{ byweek: ["WEEK5"] }], "2026-12-30").muted).toBe(true);
  });

  it("a line is limited only when all its events are", () => {
    expect(status("SA", [{ byweek: ["WEEK1"] }, {}]).muted).toBe(false);
  });

  it("never mutes the line of today", () => {
    expect(status("TH", [{ byweek: ["WEEK2"] }])).toMatchObject({ today: true, muted: false });
  });
});

describe("far (horizon)", () => {
  it("is off without months", () => {
    expect(status("2027-06-01", [{}], TODAY, 0).far).toBe(false);
  });

  it("uses the date of a dated row", () => {
    expect(horizonLimit(TODAY, 2)).toBe("2027-01-12");
    expect(status("2027-01-12", [{}], TODAY, 2).far).toBe(false);
    expect(status("2027-01-13", [{}], TODAY, 2).far).toBe(true);
  });

  it("uses the first date of the events of a recurring line", () => {
    expect(status("SU", [{ dates: ["2027-05-01"] }], TODAY, 2).far).toBe(true);
    expect(status("SU", [{ dates: ["2026-12-01"] }], TODAY, 2).far).toBe(false);
    expect(status("SU", [{}], TODAY, 2).far).toBe(false);
    expect(status("SU", [{ dates: ["2027-05-01"] }, {}], TODAY, 2).far).toBe(false);
  });
});

describe("tableView", () => {
  const base = { byweek: [], notes: [], byday: [], locations: ["Iglesia"], times: ["20:00"], eventTypeTitle: "Charlas", title: "Charla" };
  const events = [
    { ...base, dates: ["2026-11-12"] },
    { ...base, dates: ["2026-12-05"] },
    { ...base, dates: ["2027-05-20"] },
    { ...base, dates: ["2027-06-20"] },
  ];
  const tree = groupEvents(events, assembleOrder({}));

  it("collapses far rows and counts what the button would reveal", () => {
    const view = tableView(tree.Charlas, TODAY, 2);
    expect(view.rows.map((r) => r.far)).toEqual([false, false, true, true]);
    expect(view.hidden).toBe(2);
    expect(view.visible).toBe(2);
    expect(view.rows.map((r) => r.stripe)).toEqual([0, 1, -1, -1]);
    expect(view.rows[0].today).toBe(true);
  });

  it("collapses nothing without a horizon", () => {
    const view = tableView(tree.Charlas, TODAY, 0);
    expect(view.hidden).toBe(0);
    expect(view.visible).toBe(4);
  });

  it("a table with only far events has nothing visible", () => {
    const only = groupEvents(events.slice(2), assembleOrder({}));
    const view = tableView(only.Charlas, TODAY, 2);
    expect(view.visible).toBe(0);
    expect(view.hidden).toBe(2);
  });

  it("recurring events with a week: highlighted and muted through the whole tree", () => {
    const mass = (byweek) => ({ ...base, eventTypeTitle: "Misa", title: "Misa", byday: ["TH"], byweek, dates: [] });
    const t = groupEvents([mass(["WEEK2"]), mass(["WEEK1"])], assembleOrder({}));
    const view = tableView(t.Misa, TODAY, 0);
    const lines = Object.values(view.rows[0].lines[""]);
    expect(lines.map((l) => [l.today, l.muted])).toEqual([[true, false], [false, true]]);
  });
});

describe("dates and labels", () => {
  it("formats local days", () => {
    expect(toISODay(new Date(2026, 0, 5))).toBe("2026-01-05");
    expect(buildDay(new Date("2026-11-12T12:00:00Z"))).toBe("2026-11-12");
  });

  it("falls back to English", () => {
    expect(calendarLabels("Español:es").more(3)).toBe("Mostrar 3 más");
    expect(calendarLabels("Euskara:eu").less).toBe("Erakutsi gutxiago");
    expect(calendarLabels("Klingon:tlh").more(2)).toBe("Show 2 more");
    expect(calendarLabels(undefined).today).toBe("Today");
  });
});
