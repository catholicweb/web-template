import { describe, it, expect, vi } from "vitest";
import { eventPageSlug, planEventPages } from "../../docs/.vitepress/eventPages.js";
import { buildEvents, sortEvents } from "../../docs/.vitepress/calendar-core.js";

describe("eventPageSlug", () => {
  it("is the slugified title, without the date", () => {
    expect(eventPageSlug({ title: "Campamento verano", dates: ["2099-07-20"], byday: [], byweek: [] })).toBe("campamento-verano");
  });

  it("ignores recurrence", () => {
    expect(eventPageSlug({ title: "Catequesis", dates: [], byweek: ["WEEK1"], byday: ["SA", "SU"] })).toBe("catequesis");
    expect(eventPageSlug({ title: "Misa", dates: [], rrule: ["su"], byday: ["MO"] })).toBe("misa");
  });

  it("keeps whatever the editor put in the title (e.g. a year)", () => {
    expect(eventPageSlug({ title: "Campamento verano 2099", dates: ["2099-07-20"] })).toBe("campamento-verano-2099");
  });

  it("plain events without dates or recurrence", () => {
    expect(eventPageSlug({ title: "Misa" })).toBe("misa");
    expect(eventPageSlug({})).toBe("");
  });
});

describe("events sharing a title", () => {
  const configWith = (titles, extra = {}) => ({
    "event-types": { list: [{ id: "cat", label: "Catequesis" }] },
    pages: { list: [], pageperevent: ["cat"] },
    calendar: {
      events: {
        list: [
          { type: "cat", title: titles[0], rrule: ["SA"], times: ["10:00"] },
          { type: "cat", title: titles[1], rrule: ["SU"], times: ["11:00"] },
        ],
      },
    },
    ...extra,
  });
  const plan = (cfg, takenSlugs) => planEventPages({ config: cfg, calendar: sortEvents(buildEvents(cfg, new Date("2026-01-01"))), takenSlugs });

  it("keeps the first page and warns about the rest", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { eventPages, eventLinks } = plan(configWith(["Catequesis", "Catequesis"]));
    expect(eventPages.map((p) => p.slug)).toEqual(["catequesis"]);
    expect(eventPages[0].ev.byday).toEqual(["SA"]);
    expect(eventLinks.size).toBe(1);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it("are told apart when the editor names them differently", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { eventPages } = plan(configWith(["Catequesis sábado", "Catequesis domingo"]));
    expect(eventPages.map((p) => p.slug)).toEqual(["catequesis-sabado", "catequesis-domingo"]);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("never take the slug of an authored page", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { eventPages } = plan(configWith(["Contacto", "Catequesis"]), new Set(["contacto"]));
    expect(eventPages.map((p) => p.slug)).toEqual(["catequesis"]);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it("never take the slug of a type page", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const cfg = configWith(["Catequesis", "Catequesis de adultos"]);
    cfg["event-types"].list[0].pageMode = "type";
    cfg["event-types"].list[0].pageMode = "event";
    cfg["event-types"].list.push({ id: "adultos", label: "Catequesis", pageMode: "type" });
    const { typePages, eventPages } = plan(cfg);
    expect(typePages.map((p) => p.slug)).toEqual(["catequesis"]);
    expect(eventPages.map((p) => p.slug)).toEqual(["catequesis-de-adultos"]);
    warn.mockRestore();
  });
});
