import { describe, it, expect } from "vitest";
import { getJSONLD, getEventFAQ } from "../../docs/.vitepress/seo.js";

const config = {
  title: "Parroquia de Test", // deprecated field
  description: "desc", // deprecated field
  dev: { siteurl: "https://test.parroquia.app" },
  social: [], // deprecated field
  collaborators: [{ phone: "+34", email: "a@b.c" }], // deprecated field
  info: {
    title: "Parroquia de Test",
    description: "desc",
    social: [],
    collaborators: [{ phone: "+34", email: "a@b.c" }]
  }
};

describe("getJSONLD", () => {
  it("returns a single application/ld+json script head tag", () => {
    const head = getJSONLD({}, config, "contacto");
    expect(head).toHaveLength(1);
    expect(head[0][0]).toBe("script");
    expect(head[0][1].type).toBe("application/ld+json");
    const parsed = JSON.parse(head[0][2]);
    expect(parsed["@context"]).toBe("https://schema.org");
    expect(parsed["@graph"].some((n) => n["@type"] === "Organization")).toBe(true);
  });

  it("emits a Place node for map sections", () => {
    const fm = {
      sections: [
        {
          _block: "map",
          geo: "42.83,-1.5",
          name: "Leitza",
          street: "Calle",
          city: "Leitza",
          google: "g",
          osm: "o",
        },
      ],
    };
    const head = getJSONLD(fm, config, "map");
    const parsed = JSON.parse(head[0][2]);
    const place = parsed["@graph"].find((n) => n["@type"] === "Place");
    expect(place.name).toBe("Leitza");
    expect(place.geo.latitude).toBe(42.83);
    expect(place.geo.longitude).toBe(-1.5);
  });

  it("emits a FAQPage node when fm.faq is present", () => {
    const fm = { faq: [{ title: "Q1", text: "A1" }], info: {} };
    const head = getJSONLD(fm, config, "faq");
    const parsed = JSON.parse(head[0][2]);
    expect(parsed["@graph"].some((n) => n["@type"] === "FAQPage")).toBe(true);
  });

  it("escapes < > & to keep site data from breaking out of the script tag", () => {
    const dangerous = { dev: { siteurl: "https://x.app" }, info: { title: "<script>" } };
    const head = getJSONLD({}, dangerous, "contacto");
    expect(head[0][2]).toContain("\\u003cscript");
    expect(head[0][2]).not.toContain("<script>");
  });
});

describe("getEventFAQ", () => {
  it("returns an empty array for null/undefined/empty events", () => {
    expect(getEventFAQ(null)).toEqual([]);
    expect(getEventFAQ(undefined)).toEqual([]);
    expect(getEventFAQ([], "Español:es")).toEqual([]);
  });

  it("builds a FAQ entry for a weekly recurring event", () => {
    const events = [
      { title: "Misa", times: ["10:00"], locations: ["Iglesia"], byday: ["MO"], dates: [], byweek: [] },
    ];
    expect(getEventFAQ(events, "Español:es")).toEqual([
      { title: "¿Cuándo se celebra Misa en Iglesia?", text: "Misa en Iglesia se celebra los lunes a las 10:00." },
    ]);
  });
});
