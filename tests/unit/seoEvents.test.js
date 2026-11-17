import { describe, it, expect } from "vitest";
import { getJSONLD, toIsoWithOffset, parseGeo } from "../../docs/.vitepress/seo.js";
import { descriptionFromSections, addMeta } from "../../docs/.vitepress/pageBuilder.js";

const config = {
  dev: { siteurl: "https://test.parroquia.app" },
  info: { title: "Parroquia", description: "desc", places: [{ id: "p1", name: "Leitza", geo: "42.9,-1.9", address: "Calle 1, Leitza" }] },
};
const graph = (fm, path) => JSON.parse(getJSONLD(fm, config, path)[0][2])["@graph"];

describe("toIsoWithOffset", () => {
  it("uses the Madrid offset (summer / winter / all-day)", () => {
    expect(toIsoWithOffset("2027-07-20", "10:00")).toBe("2027-07-20T10:00:00+02:00");
    expect(toIsoWithOffset("2027-01-10", "9:30")).toBe("2027-01-10T09:30:00+01:00");
    expect(toIsoWithOffset("2027-07-20", null)).toBe("2027-07-20");
  });
  it("parseGeo rejects junk", () => {
    expect(parseGeo("42.8, -1.5")).toEqual({ latitude: 42.8, longitude: -1.5 });
    expect(parseGeo("")).toBeNull();
    expect(parseGeo("42")).toBeNull();
  });
});

describe("event page JSON-LD", () => {
  const ev = { title: "Campamento", type: "camp", dates: ["2027-07-20"], times: ["10:00"], byday: [], byweek: [], notes: ["Nota"], images: ["https://x/i.webp"], locations: ["Leitza"], place: { name: "Leitza", geo: "42.9,-1.9", address: "Calle 1, Leitza" } };
  it("emits a full Event with inline location, offset, page url and main entity", () => {
    const g = graph({ title: "Campamento", description: "Texto", lang: "Español:es", seo: { event: ev } }, "campamento-2027-07-20");
    const e = g.find((n) => n["@type"] === "Event");
    expect(e.startDate).toBe("2027-07-20T10:00:00+02:00");
    expect(e.url).toBe("https://test.parroquia.app/campamento-2027-07-20");
    expect(e.description).toBe("Texto");
    expect(e.eventAttendanceMode).toContain("Offline");
    expect(e.location[0]).toMatchObject({ "@type": "Place", name: "Leitza", geo: { latitude: 42.9, longitude: -1.9 } });
    expect(e.location[0].address.streetAddress).toBe("Calle 1, Leitza");
    const page = g.find((n) => n["@type"] === "WebPage");
    expect(page.mainEntity).toEqual({ "@id": e["@id"] });
    expect(page.inLanguage).toBe("es");
  });
  it("recurring event gets a Schedule and upcoming occurrences", () => {
    const g = graph({ seo: { event: { ...ev, dates: [], byday: ["SA"], type: "mass" } } }, "misa");
    expect(g.some((n) => n["@type"] === "Schedule")).toBe(true);
    expect(g.filter((n) => n["@type"] === "Event").length).toBeGreaterThan(3);
  });
});

describe("place page JSON-LD", () => {
  it("emits a church with geo even without a map block, and de-dupes the map block", () => {
    const fm = { title: "Leitza", seo: { place: { name: "Leitza", geo: "42.9,-1.9", address: "Calle 1" } }, sections: [{ _block: "map", geo: "42.9,-1.9", name: "Leitza" }] };
    const g = graph(fm, "leitza");
    const church = g.find((n) => n["@type"] === "CatholicChurch");
    expect(church.geo).toMatchObject({ latitude: 42.9, longitude: -1.9 });
    expect(g.filter((n) => n["@type"] === "Place")).toHaveLength(0);
  });
});

describe("home", () => {
  it("emits the full Organization and WebSite", () => {
    const g = graph({}, "");
    expect(g.find((n) => n["@type"] === "Organization").logo).toContain("icon-512.png");
    expect(g.some((n) => n["@type"] === "WebSite")).toBe(true);
  });
});

describe("descriptionFromSections", () => {
  it("uses the start of the first text block, stripped of markdown", () => {
    const d = descriptionFromSections([{ type: "map" }, { html: "**Hola** [mundo](http://x) " + "palabra ".repeat(40) }]);
    expect(d.startsWith("Hola mundo palabra")).toBe(true);
    expect(d.length).toBeLessThanOrEqual(160);
    expect(d.endsWith("…")).toBe(true);
  });
  it("skips hidden blocks and returns '' when there is no text", () => {
    expect(descriptionFromSections([{ html: "x", tags: ["hidden"] }, { type: "map" }])).toBe("");
  });
});

describe("addMeta", () => {
  it("adds canonical, og:url and both hreflang entries for the first language", () => {
    const fm = { title: "T", lang: "Español:es", equiv: [{ lang: "Español:es", href: "/foo" }, { lang: "Euskara:eu", href: "/eu/foo" }] };
    addMeta(fm, { CFG: { siteurl: "https://s.app/", title: "S" }, resolveMedia: (u) => u });
    expect(fm.head).toContainEqual(["link", { rel: "canonical", href: "https://s.app/foo" }]);
    expect(fm.head.filter((h) => h[1].hreflang).map((h) => h[1].hreflang)).toEqual(["x-default", "es", "eu"]);
  });
});
