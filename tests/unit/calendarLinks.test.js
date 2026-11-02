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
