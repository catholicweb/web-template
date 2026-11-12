import { describe, it, expect } from "vitest";
import { groupEvents, assembleOrder } from "../../docs/.vitepress/utils.js";

// The last grouping level keeps a small stub per event (`link` when it has its own page,
// plus its `dates` and `byweek`), so Calendar.vue can link the line and tell when it
// happens without carrying whole events in the page data.
describe("groupEvents: event page links", () => {
  const base = { byweek: [], notes: [], dates: [], byday: [] };
  const events = [
    { ...base, eventTypeTitle: "Misa", title: "Misa", byday: ["SU"], times: ["12:00"], locations: ["Iglesia"], link: "/misa-dominical/" },
    { ...base, eventTypeTitle: "Misa", title: "Misa", byday: ["SA"], times: ["19:00"], locations: ["Iglesia"] },
  ];
  const grouped = groupEvents(events, assembleOrder({}));

  it("keeps a { link } stub on the last level for events with a page", () => {
    expect(grouped.Misa.SU[""]["12:00#1"].Iglesia).toEqual([{ link: "/misa-dominical/" }]);
  });

  it("keeps an empty stub for events with neither a page, dates nor weeks", () => {
    expect(grouped.Misa.SA[""]["19:00#1"].Iglesia).toEqual([{}]);
  });

  it("carries the dates and weeks of the month of the event", () => {
    const event = { ...base, eventTypeTitle: "Misa", title: "Misa", byday: ["SA"], byweek: ["WEEK1", "WEEK3"], dates: ["2026-12-05"], times: ["19:00"], locations: ["Iglesia"] };
    const g = groupEvents([event], assembleOrder({}));
    expect(g.Misa.SA[""]["19:00#1"].Iglesia).toEqual([{ dates: ["2026-12-05"], byweek: ["WEEK1", "WEEK3"] }]);
  });

  it("does not copy any other event data into the grouped tree", () => {
    expect(JSON.stringify(grouped)).not.toContain("notes");
  });
});
