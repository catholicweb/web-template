import { describe, it, expect } from "vitest";
import { planEventPages, eventCardsFor } from "../../docs/.vitepress/eventPages.js";
import { buildEvents } from "../../docs/.vitepress/calendar-core.js";

describe("createPage switches (group + event)", () => {
  const cfg = (extra = {}) => ({
    "event-types": { list: [{ id: "cat", label: "Catequesis", ...extra }] },
  });
  const ev = (o = {}) => ({ type: "cat", title: "Sesión", dates: ["2027-01-10"], ...o });

  it("group createPage:true makes ONE group page, and no event pages", () => {
    const calendar = [ev(), ev({ title: "Otra" })];
    const plan = planEventPages({ config: cfg({ createPage: true }), calendar });
    expect(plan.modes.get("cat")).toBe("type");
    expect(plan.typePages).toHaveLength(1);
    expect(plan.eventPages).toHaveLength(0);
  });

  it("group createPage:false (the editor default) creates nothing", () => {
    const plan = planEventPages({ config: cfg({ createPage: false }), calendar: [ev()] });
    expect(plan.typePages).toHaveLength(0);
    expect(plan.eventPages).toHaveLength(0);
  });

  it("an event with createPage:true gets its own page, even without a group page", () => {
    const calendar = [ev({ createPage: true }), ev({ title: "Otra" })];
    const plan = planEventPages({ config: cfg({ createPage: false }), calendar });
    expect(plan.eventPages.map((p) => p.ev.title)).toEqual(["Sesión"]);
    expect(plan.eventLinks.get(calendar[0])).toMatch(/^\/.+\/$/);
  });

  it("legacy pageMode still wins and 'event' mode can be opted out per event", () => {
    const calendar = [ev(), ev({ title: "Otra", createPage: false })];
    const plan = planEventPages({ config: cfg({ pageMode: "event", createPage: false }), calendar });
    expect(plan.modes.get("cat")).toBe("event");
    expect(plan.eventPages.map((p) => p.ev.title)).toEqual(["Sesión"]);
  });

  it("eventCards add the group card and the cards of events with their own page", () => {
    const calendar = [ev({ createPage: true }), ev({ title: "Otra" })];
    const config = {
      "event-types": { list: [{ id: "cat", label: "Catequesis", createPage: true }, { id: "misa", label: "Misa" }] },
    };
    const plan = planEventPages({ config, calendar });
    const cards = eventCardsFor({ eventsToShow: ["misa"], calendar, config, plan });
    expect(cards.filter((c) => c.typeCard)).toHaveLength(1);
    expect(cards.filter((c) => !c.typeCard && c.link)).toHaveLength(1);
  });
});

describe("buildEvents createPage", () => {
  it("carries the event's own switch, else the type's default, else undefined", () => {
    const config = {
      "event-types": { list: [{ id: "a", defaults: { createPage: true } }, { id: "b", defaults: {} }] },
      calendar: { events: { list: [
        { type: "a", title: "x" },
        { type: "a", title: "y", createPage: false },
        { type: "b", title: "z" },
      ] } },
    };
    expect(buildEvents(config).map((e) => e.createPage)).toEqual([true, false, undefined]);
  });
});
