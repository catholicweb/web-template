import { describe, it, expect } from "vitest";
import { groupEvents, assembleOrder } from "../../docs/.vitepress/utils.js";

// The last grouping level keeps a `{ n, link? }` stub for EVERY event (`n` = position of the
// event among the events of its line, `link` only for events with their own page), so
// Calendar.vue can split a line into one entry per event and link each one, without
// carrying whole events in the page data.
describe("groupEvents: event page links", () => {
  const base = { byweek: [], notes: [], dates: [], byday: [] };
  const events = [
    { ...base, eventTypeTitle: "Misa", title: "Misa", byday: ["SU"], times: ["12:00"], locations: ["Iglesia"], link: "/misa-dominical/" },
    { ...base, eventTypeTitle: "Misa", title: "Misa", byday: ["SA"], times: ["19:00"], locations: ["Iglesia"] },
  ];
  const grouped = groupEvents(events, assembleOrder({}));

  it("keeps a { n, link } stub on the last level for events with a page", () => {
    expect(grouped.Misa.SU[""]["12:00"].Iglesia).toEqual([{ n: 0, link: "/misa-dominical/" }]);
  });

  it("keeps a bare { n } stub for events without a page", () => {
    expect(grouped.Misa.SA[""]["19:00"].Iglesia).toEqual([{ n: 0 }]);
  });

  it("does not copy any other event data into the grouped tree", () => {
    expect(JSON.stringify(grouped)).not.toContain("notes");
  });
});

describe("groupEvents: events sharing a line", () => {
  const base = { byweek: [], notes: [], dates: [], byday: [] };
  const misa = { ...base, eventTypeTitle: "Misa", title: "Misa", byday: ["SU"], times: ["12:00"] };
  const events = [
    { ...misa, locations: ["Iglesia"], link: "/misa/" },
    { ...misa, locations: ["Iglesia"], link: "/misa/" },
    { ...misa, locations: ["Capilla"] },
  ];
  const line = groupEvents(events, assembleOrder({})).Misa.SU[""]["12:00"];

  it("gives every event of the line its own n, even with the same extra info and link", () => {
    expect(line.Iglesia.map((stub) => stub.n)).toEqual([0, 1]);
    expect(line.Capilla).toEqual([{ n: 2 }]);
  });

  it("does not need the events to have an id", () => {
    expect(events.every((event) => event.id === undefined)).toBe(true);
    expect(Object.values(line).flat()).toHaveLength(3);
  });
});

// An ordering without an extra-info level (4 levels): the line key is the last level, so
// the line holds the stubs directly. Calendar.vue still has to draw one line per event.
describe("groupEvents: ordering without an extra-info level", () => {
  const base = { byweek: [], notes: [], dates: [], byday: [] };
  const misa = { ...base, eventTypeTitle: "Misa", title: "Misa", byday: ["SU"], locations: ["Iglesia"] };
  const events = [
    { ...misa, times: ["12:00"], link: "/misa/" },
    { ...misa, times: ["12:00"] },
  ];
  const line = groupEvents(events, ["eventTypeTitle", "byday/dates", "skip", "times"]).Misa.SU[""];

  it("leaves the stubs directly under the line key", () => {
    expect(line["12:00"]).toEqual([{ n: 0, link: "/misa/" }, { n: 1 }]);
  });
});
