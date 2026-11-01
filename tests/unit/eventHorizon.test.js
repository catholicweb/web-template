import { describe, it, expect } from "vitest";
import { withinHorizon, eventCardsFor, EVENT_HORIZON_MONTHS } from "../../docs/.vitepress/eventPages.js";
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

  it("uses a two month window by default", () => {
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

  it("hides events starting after the window", () => {
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

describe("eventCardsFor horizon", () => {
  const now = new Date(2026, 10, 1);
  const near = { type: "concert", title: "Near", dates: ["2026-11-20"] };
  const far = { type: "concert", title: "Far", dates: ["2027-05-20"] };
  const weekly = { type: "mass", title: "Weekly", dates: [], byday: ["SU"] };

  it("drops far events when every event is shown", () => {
    const cards = eventCardsFor({ calendar: [near, far, weekly], config: {}, now });
    expect(cards).toEqual([near, weekly]);
  });

  it("drops far events matching the selected types", () => {
    const cards = eventCardsFor({ eventsToShow: ["concert"], calendar: [near, far, weekly], config: {}, now });
    expect(cards).toEqual([near]);
  });

  it("drops far events that only appear through their own page", () => {
    const config = { "event-types": { list: [{ id: "concert", createPage: true }, { id: "mass" }] } };
    const calendar = [near, far, weekly];
    const plan = { typeLinks: new Map(), eventLinks: new Map([[near, "/near/"], [far, "/far/"]]) };
    const cards = eventCardsFor({ eventsToShow: ["mass"], calendar, config, plan, now });
    expect(cards.map((c) => c.title)).toEqual(["Weekly", "Near"]);
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

  it("hides far events by default", async () => {
    const section = await run({});
    expect(section.events.map((e) => e.title)).toEqual(["Near", "Weekly"]);
  });

  it("applies on top of the complex filter", async () => {
    const section = await run({ filter: "concert" });
    expect(section.events.map((e) => e.title)).toEqual(["Near"]);
  });

  it("hides the section when only far events remain", async () => {
    const section = await run({ filter: "far" });
    expect(section.events).toEqual([]);
    expect(section.tags).toContain("hidden");
  });
});
