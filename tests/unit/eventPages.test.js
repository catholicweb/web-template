import { describe, it, expect } from "vitest";
import fs from "node:fs";
import {
  resolvePageMode,
  planEventPages,
  eventCardsFor,
  eventPageSlug,
  typeKey,
} from "../../docs/.vitepress/eventPages.js";
import { createContext, prepare, autocomplete, substitute } from "../../docs/.vitepress/pageBuilder.js";
import { buildEvents, sortEvents } from "../../docs/.vitepress/calendar-core.js";

const types = [
  { id: "Catequesis", label: "Catequesis", defaults: { description: "Grupos de catequesis", images: ["/media/cat.jpg"], location: "p1" } },
  { id: "camp", label: "Campamentos", defaults: {} },
  { id: "mass", label: "Misas", defaults: {} },
  { id: "legacy", label: "Legado", defaults: {} },
];

const config = (extra = {}) => ({
  site: { title: "P", languages: ["Español:es"] },
  "event-types": { list: types.map((t) => ({ ...t })) },
  info: { places: [{ id: "p1", name: "San Pedro" }] },
  calendar: {
    events: {
      list: [
        { type: "catequesis", title: "Catequesis 1º", rrule: ["SA"], times: ["10:00"], location: "p1" },
        { type: "catequesis", title: "Catequesis 2º", rrule: ["SU"], times: ["11:00"], location: "p1" },
        { type: "camp", title: "Campamento verano", date: ["2099-07-20"] },
        { type: "mass", title: "Misa", rrule: ["SU"], times: ["12:00"] },
        { type: "legacy", title: "Evento viejo", date: ["2099-01-01"] },
      ],
    },
  },
  pages: { list: [{ id: "a", title: "Inicio", home: true, sections: [] }] },
  ...extra,
});

const calendarOf = (cfg) => sortEvents(buildEvents(cfg, new Date("2026-01-01")));

describe("resolvePageMode", () => {
  it("defaults to none when nothing is set", () => {
    expect(resolvePageMode({ id: "x" }, [])).toBe("none");
    expect(resolvePageMode({ id: "x" })).toBe("none");
  });

  it("infers 'event' for types listed in the legacy pageperevent array", () => {
    expect(resolvePageMode({ id: "camp" }, ["camp"])).toBe("event");
    expect(resolvePageMode({ id: "Camp" }, ["camp"])).toBe("event"); // ids compare lowercased
  });

  it("an explicit pageMode wins over the legacy array", () => {
    expect(resolvePageMode({ id: "camp", pageMode: "none" }, ["camp"])).toBe("none");
    expect(resolvePageMode({ id: "camp", pageMode: "type" }, ["camp"])).toBe("type");
    expect(resolvePageMode({ id: "camp", pageMode: "event" }, [])).toBe("event");
  });

  it("ignores invalid pageMode values", () => {
    expect(resolvePageMode({ id: "camp", pageMode: "bogus" }, ["camp"])).toBe("event");
    expect(resolvePageMode({ id: "camp", pageMode: "bogus" }, [])).toBe("none");
  });
});

describe("planEventPages", () => {
  it("plans nothing for a config without pageMode or pageperevent", () => {
    const cfg = config();
    const plan = planEventPages({ config: cfg, calendar: calendarOf(cfg) });
    expect(plan.typePages).toHaveLength(0);
    expect(plan.eventPages).toHaveLength(0);
  });

  it("legacy pageperevent keeps one page per event with unchanged slugs", () => {
    const cfg = config({ pages: { list: [], pageperevent: ["camp"] } });
    const calendar = calendarOf(cfg);
    const plan = planEventPages({ config: cfg, calendar });
    expect(plan.typePages).toHaveLength(0);
    expect(plan.eventPages.map((e) => e.slug)).toEqual(["campamento-verano-2099-07-20"]);
    const ev = calendar.find((e) => e.type === "camp");
    expect(plan.eventPages[0].slug).toBe(eventPageSlug(ev));
    expect(plan.eventLinks.get(ev)).toBe("/campamento-verano-2099-07-20/");
  });

  it("legacy ids that match no defined type are still honoured", () => {
    const cfg = config({ pages: { list: [], pageperevent: ["mass"] } });
    cfg["event-types"].list = []; // no type definitions at all
    const plan = planEventPages({ config: cfg, calendar: calendarOf(cfg) });
    expect(plan.eventPages.map((e) => e.ev.type)).toEqual(["mass"]);
  });

  it("pageMode 'type' plans ONE page for the type, with the type's data", () => {
    const cfg = config();
    cfg["event-types"].list[0].pageMode = "type";
    const plan = planEventPages({ config: cfg, calendar: calendarOf(cfg) });
    expect(plan.eventPages).toHaveLength(0);
    expect(plan.typePages).toHaveLength(1);
    const [page] = plan.typePages;
    expect(page).toMatchObject({ key: "catequesis", title: "Catequesis", slug: "catequesis" });
    expect(page.data).toMatchObject({ title: "Catequesis", type: "catequesis", description: "Grupos de catequesis", html: "Grupos de catequesis", name: "San Pedro" });
    expect(plan.typeLinks.get("catequesis")).toBe("/catequesis/");
  });

  it("an authored page with the same slug wins over a type page", () => {
    const cfg = config();
    cfg["event-types"].list[0].pageMode = "type";
    const plan = planEventPages({ config: cfg, calendar: calendarOf(cfg), takenSlugs: new Set(["catequesis"]) });
    expect(plan.typePages).toHaveLength(0);
    expect(plan.typeLinks.size).toBe(0);
  });

  it("mixes modes per type", () => {
    const cfg = config({ pages: { list: [], pageperevent: ["legacy"] } });
    cfg["event-types"].list[0].pageMode = "type";
    cfg["event-types"].list[1].pageMode = "event";
    const plan = planEventPages({ config: cfg, calendar: calendarOf(cfg) });
    expect(plan.typePages.map((p) => p.key)).toEqual(["catequesis"]);
    expect(plan.eventPages.map((p) => p.ev.type).sort()).toEqual(["camp", "legacy"]);
    expect(plan.modes.get("mass")).toBe("none");
  });
});

describe("eventCardsFor", () => {
  const setup = (mutate) => {
    const cfg = config();
    mutate?.(cfg);
    const calendar = calendarOf(cfg);
    const plan = planEventPages({ config: cfg, calendar });
    return { cfg, calendar, plan };
  };

  it("without eventsToShow keeps showing every event, like before", () => {
    const { cfg, calendar, plan } = setup((c) => (c["event-types"].list[0].pageMode = "type"));
    const cards = eventCardsFor({ eventsToShow: undefined, calendar, config: cfg, plan });
    expect(cards).toEqual(calendar);
  });

  it("selected types still give one card per event", () => {
    const { cfg, calendar, plan } = setup();
    const cards = eventCardsFor({ eventsToShow: ["catequesis"], calendar, config: cfg, plan });
    expect(cards.map((c) => c.title)).toEqual(["Catequesis 1º", "Catequesis 2º"]);
  });

  it("adds ONE card for a pageMode 'type' type that is not selected", () => {
    const { cfg, calendar, plan } = setup((c) => (c["event-types"].list[0].pageMode = "type"));
    const cards = eventCardsFor({ eventsToShow: ["camp"], calendar, config: cfg, plan });
    expect(cards.map((c) => c.title)).toEqual(["Campamento verano", "Catequesis"]);
    expect(cards[1]).toMatchObject({ typeCard: true, link: "/catequesis/", images: ["/media/cat.jpg"] });
  });

  it("adds per-event cards for an explicit pageMode 'event' type, linked to their pages", () => {
    const { cfg, calendar, plan } = setup((c) => (c["event-types"].list[1].pageMode = "event"));
    const cards = eventCardsFor({ eventsToShow: ["catequesis"], calendar, config: cfg, plan });
    expect(cards.map((c) => c.title)).toEqual(["Catequesis 1º", "Catequesis 2º", "Campamento verano"]);
    expect(cards[2].link).toBe("/campamento-verano-2099-07-20/");
  });

  it("does not add cards for types whose mode is only inferred from the legacy array", () => {
    const { cfg, calendar, plan } = setup((c) => (c.pages.pageperevent = ["camp"]));
    const cards = eventCardsFor({ eventsToShow: ["catequesis"], calendar, config: cfg, plan });
    expect(cards.map((c) => c.title)).toEqual(["Catequesis 1º", "Catequesis 2º"]);
  });

  it("adds nothing for types without a page", () => {
    const { cfg, calendar, plan } = setup((c) => (c["event-types"].list[2].pageMode = "none"));
    const cards = eventCardsFor({ eventsToShow: ["camp"], calendar, config: cfg, plan });
    expect(cards.map((c) => c.title)).toEqual(["Campamento verano"]);
  });

  it("does not link to a type page that was not generated (empty plan)", () => {
    const { cfg, calendar } = setup((c) => (c["event-types"].list[0].pageMode = "type"));
    const empty = planEventPages({ config: {}, calendar: [] });
    const cards = eventCardsFor({ eventsToShow: ["camp"], calendar, config: cfg, plan: empty });
    expect(cards.map((c) => c.title)).toEqual(["Campamento verano"]);
  });
});

describe("autocomplete wiring", () => {
  it("eventCards sections get the page-mode cards", async () => {
    const cfg = config();
    cfg["event-types"].list[0].pageMode = "type";
    const ctx = createContext({ config: cfg, calendar: calendarOf(cfg), dictionary: { "Español:es": {} } });
    const data = prepare({ title: "Grupos", sections: [{ _block: "eventCards", eventsToShow: ["camp"] }] });
    await autocomplete(data, ctx.pages, ctx);
    expect(data.sections[0].events.map((e) => e.title)).toEqual(["Campamento verano", "Catequesis"]);
    expect(data.sections[0].tags).not.toContain("hidden");
  });

  it("a type page template can filter the events of its type via {type}", () => {
    const cfg = config();
    cfg["event-types"].list[0].pageMode = "type";
    const calendar = calendarOf(cfg);
    const [page] = planEventPages({ config: cfg, calendar }).typePages;
    const template = { title: "{title}", sections: [{ _block: "calendar", filter: '"type":"{type}"', title: "{title}" }] };
    const out = substitute(template, page.data);
    expect(out.sections[0].filter).toBe('"type":"catequesis"');
    expect(out.sections[0].title).toBe("Catequesis");
  });
});

describe("eventPages.js", () => {
  it("has no node-only imports (it is shared with the browser preview)", () => {
    const src = fs.readFileSync("docs/.vitepress/eventPages.js", "utf8");
    const imports = [...src.matchAll(/^\s*import[^"']*["']([^"']+)["']/gm)].map((m) => m[1]);
    for (const spec of imports) expect(spec).not.toMatch(/^node:|^fs$|^path$|node_utils|gray-matter/);
  });

  it("typeKey lowercases ids", () => {
    expect(typeKey({ id: " Catequesis " })).toBe("catequesis");
  });
});
