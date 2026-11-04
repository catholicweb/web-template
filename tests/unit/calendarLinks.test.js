import { describe, it, expect } from "vitest";
import { groupEvents, assembleOrder } from "../../docs/.vitepress/utils.js";

// The last grouping level keeps a `{ link }` stub for events that have their own page,
// so Calendar.vue can link the line without carrying whole events in the page data.
describe("groupEvents: event page links", () => {
  const base = { byweek: [], notes: [], dates: [], byday: [] };
  const events = [
    { ...base, eventTypeTitle: "Misa", title: "Misa", byday: ["SU"], times: ["12:00"], locations: ["Iglesia"], link: "/misa-dominical/" },
    { ...base, eventTypeTitle: "Misa", title: "Misa", byday: ["SA"], times: ["19:00"], locations: ["Iglesia"] },
  ];
  const grouped = groupEvents(events, assembleOrder({}));

  it("keeps a { link } stub on the last level for events with a page", () => {
    expect(grouped.Misa.SU[""]["12:00"].Iglesia).toEqual([{ link: "/misa-dominical/" }]);
  });

  it("leaves the last level empty for events without a page", () => {
    expect(grouped.Misa.SA[""]["19:00"].Iglesia).toEqual([]);
  });

  it("does not copy any other event data into the grouped tree", () => {
    expect(JSON.stringify(grouped)).not.toContain("notes");
  });
});

// Events that only differ in the last level (same type, day and time, different place)
// are different events: each one gets its own line instead of being merged into one.
describe("groupEvents { lines: true }: one line per event", () => {
  const base = { byweek: [], notes: [], dates: [], byday: ["TU"], eventTypeTitle: "Catequesis", title: "Catequesis", times: ["17:00"] };
  const events = [
    { ...base, locations: ["Lugar A"], link: "/catequesis-a/" },
    { ...base, locations: ["Lugar B"] },
  ];
  const grouped = groupEvents(events, assembleOrder({}), { lines: true });

  it("keeps two places at the same time on separate lines", () => {
    expect(grouped.Catequesis.TU[""]["17:00"]).toEqual([
      { extras: ["Lugar A"], links: ["/catequesis-a/"] },
      { extras: ["Lugar B"], links: [] },
    ]);
  });

  it("keeps each extra with its own event when titles differ too", () => {
    const two = [
      { ...base, title: "Niños", locations: ["Lugar A"] },
      { ...base, title: "Jóvenes", locations: ["Lugar B"] },
    ];
    const lines = groupEvents(two, assembleOrder({}), { lines: true }).Catequesis.TU[""]["17:00"];
    expect(lines.map((l) => l.extras)).toEqual([["Niños", "Lugar A"], ["Jóvenes", "Lugar B"]]);
  });

  it("still merges events with identical extra info, joining their links", () => {
    const dup = [
      { ...base, locations: ["Lugar A"], link: "/a/" },
      { ...base, locations: ["Lugar A"], link: "/b/" },
    ];
    expect(groupEvents(dup, assembleOrder({}), { lines: true }).Catequesis.TU[""]["17:00"]).toEqual([{ extras: ["Lugar A"], links: ["/a/", "/b/"] }]);
  });

  it("an event in several places stays one line", () => {
    const multi = [{ ...base, locations: ["Lugar A", "Lugar B"] }];
    expect(groupEvents(multi, assembleOrder({}), { lines: true }).Catequesis.TU[""]["17:00"]).toEqual([{ extras: ["Lugar A", "Lugar B"], links: [] }]);
  });

  it("without the option the last level keeps its keyed shape (faq.js relies on it)", () => {
    expect(Object.keys(groupEvents(events, assembleOrder({})).Catequesis.TU[""]["17:00"])).toEqual(["Lugar A", "Lugar B"]);
  });
});
