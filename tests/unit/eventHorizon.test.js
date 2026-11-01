import { describe, it, expect } from "vitest";
import { withinHorizon, applyEventFilter, eventCardsFor, EVENT_HORIZON_MONTHS } from "../../docs/.vitepress/eventPages.js";
import { createContext, autocomplete } from "../../docs/.vitepress/pageBuilder.js";

// Local-time ISO date (YYYY-MM-DD) `days` away from `from`.
const iso = (from, days) => {
  const d = new Date(from);
  d.setDate(d.getDate() + days);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

describe("withinHorizon", () => {
  const now = new Date(2026, 10, 1, 15, 30); // 1 Nov 2026 (limit: 1 Jan 2027)

  it("uses a two month window", () => {
    expect(EVENT_HORIZON_MONTHS).toBe(2);
  });

  it("keeps events without dates (purely recurring)", () => {
    expect(withinHorizon({ dates: [], byday: ["SA"] }, now)).toBe(true);
    expect(withinHorizon({}, now)).toBe(true);
  });

  it("keeps events starting inside the window, including the last day", () => {
    expect(withinHorizon({ dates: ["2026-11-02"] }, now)).toBe(true);
    expect(withinHorizon({ dates: ["2027-01-01"] }, now)).toBe(true);
  });

  it("rejects events starting after the window", () => {
    expect(withinHorizon({ dates: ["2027-01-02"] }, now)).toBe(false);
    expect(withinHorizon({ dates: ["2027-06-15"] }, now)).toBe(false);
  });

  it("uses the earliest date of an event with several dates", () => {
    expect(withinHorizon({ dates: ["2027-06-15", "2026-12-24"] }, now)).toBe(true);
    expect(withinHorizon({ dates: ["2027-05-01", "2027-06-15"] }, now)).toBe(false);
  });

  it("ignores unparsable dates", () => {
    expect(withinHorizon({ dates: ["not a date"] }, now)).toBe(true);
    expect(withinHorizon({ dates: ["not a date", "2027-06-15"] }, now)).toBe(false);
  });
});

describe("applyEventFilter", () => {
  const now = new Date(2026, 10, 1);
  const near = { type: "concert", title: "Near", dates: ["2026-11-20"], byday: [] };
  const far = { type: "concert", title: "Far", dates: ["2027-05-20"], byday: [] };
  const weekly = { type: "mass", title: "Weekly", dates: [], byday: ["SU"] };

  it("behaves exactly like applyComplexFilter without the term", () => {
    expect(applyEventFilter(far, "", now)).toBe(true);
    expect(applyEventFilter(far, undefined, now)).toBe(true);
    expect(applyEventFilter(far, "concert", now)).toBe(true);
    expect(applyEventFilter(far, "mass", now)).toBe(false);
  });

  it("never hides far events unless asked", () => {
    expect(applyEventFilter(far, "concert", now)).toBe(true);
    expect(applyEventFilter(far, "!mass", now)).toBe(true);
  });

  it("the bare term keeps events inside the window", () => {
    expect(applyEventFilter(near, "withinHorizon", now)).toBe(true);
    expect(applyEventFilter(weekly, "withinHorizon", now)).toBe(true);
    expect(applyEventFilter(far, "withinHorizon", now)).toBe(false);
  });

  it("is case-insensitive and ignores spaces", () => {
    expect(applyEventFilter(far, " WITHINHORIZON ", now)).toBe(false);
    expect(applyEventFilter(far, "concert & withinHorizon", now)).toBe(false);
  });

  it("combines with & and |", () => {
    expect(applyEventFilter(near, "concert&withinHorizon", now)).toBe(true);
    expect(applyEventFilter(far, "concert&withinHorizon", now)).toBe(false);
    expect(applyEventFilter(weekly, "concert&withinHorizon", now)).toBe(false);
    expect(applyEventFilter(far, "mass|concert&withinHorizon", now)).toBe(false);
    expect(applyEventFilter(weekly, "mass|concert&withinHorizon", now)).toBe(true);
  });

  it("can be negated to get only the far events", () => {
    expect(applyEventFilter(far, "!withinHorizon", now)).toBe(true);
    expect(applyEventFilter(near, "!withinHorizon", now)).toBe(false);
    expect(applyEventFilter(far, "concert&!withinHorizon", now)).toBe(true);
  });
});

describe("eventCardsFor horizon (opt-in)", () => {
  const now = new Date(2026, 10, 1);
  const near = { type: "concert", title: "Near", dates: ["2026-11-20"] };
  const far = { type: "concert", title: "Far", dates: ["2027-05-20"] };
  const weekly = { type: "mass", title: "Weekly", dates: [], byday: ["SU"] };
  const calendar = [near, far, weekly];

  it("shows far events when the horizon is not asked for", () => {
    expect(eventCardsFor({ calendar, config: {}, now })).toEqual([near, far, weekly]);
    expect(eventCardsFor({ eventsToShow: ["concert"], calendar, config: {}, now })).toEqual([near, far]);
  });

  it("withinHorizon alone narrows every event", () => {
    expect(eventCardsFor({ eventsToShow: ["withinHorizon"], calendar, config: {}, now })).toEqual([near, weekly]);
  });

  it("withinHorizon narrows the selected types (it is a modifier, not an extra type)", () => {
    expect(eventCardsFor({ eventsToShow: ["concert", "withinHorizon"], calendar, config: {}, now })).toEqual([near]);
    expect(eventCardsFor({ eventsToShow: ["withinhorizon", "concert", "mass"], calendar, config: {}, now })).toEqual([near, weekly]);
  });

  it("also applies to the cards of events that have their own page, only when asked", () => {
    const config = { "event-types": { list: [{ id: "concert", createPage: true }, { id: "mass" }] } };
    const plan = { typeLinks: new Map(), eventLinks: new Map([[near, "/near/"], [far, "/far/"]]) };
    const titles = (eventsToShow) => eventCardsFor({ eventsToShow, calendar, config, plan, now }).map((c) => c.title);
    expect(titles(["mass"])).toEqual(["Weekly", "Near", "Far"]);
    expect(titles(["mass", "withinHorizon"])).toEqual(["Weekly", "Near"]);
  });
});

describe("autocomplete calendar section", () => {
  const today = new Date();
  const near = { type: "concert", title: "Near", dates: [iso(today, 10)], byday: [], byweek: [] };
  const far = { type: "concert", title: "Far", dates: [iso(today, 200)], byday: [], byweek: [] };
  const weekly = { type: "mass", title: "Weekly", dates: [], byday: ["SU"], byweek: [] };

  const run = async (section) => {
    const ctx = createContext({ config: {}, calendar: [near, far, weekly], deps: { getPreview: async () => ({}), getAddress: async () => ({}) } });
    const fm = { title: "Page", sections: [{ _block: "calendar", ...section }] };
    await autocomplete(fm, [], ctx);
    return fm.sections[0];
  };
  const titles = (s) => s.events.map((e) => e.title);

  it("shows far events by default (no horizon)", async () => {
    expect(titles(await run({}))).toEqual(["Near", "Far", "Weekly"]);
    expect(titles(await run({ filter: "concert" }))).toEqual(["Near", "Far"]);
  });

  it("hides far events when the filter has withinHorizon", async () => {
    expect(titles(await run({ filter: "withinHorizon" }))).toEqual(["Near", "Weekly"]);
    expect(titles(await run({ filter: "concert&withinHorizon" }))).toEqual(["Near"]);
  });

  it("hides the section when only far events remain", async () => {
    const section = await run({ filter: "far&withinHorizon" });
    expect(section.events).toEqual([]);
    expect(section.tags).toContain("hidden");
  });
});
