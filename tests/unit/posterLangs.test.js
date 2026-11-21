import { describe, it, expect } from "vitest";
import { posterTexts } from "../../docs/.vitepress/posterLangs.js";

const page = (title, notes) => ({ seo: { event: { id: "e1", title, notes } } });

describe("posterTexts", () => {
  it("collects the title and first note of an event page in every language, keyed by code", () => {
    const out = posterTexts([
      ["Español:es", page("Campamento", ["<p>Hola</p>", "otra"])],
      ["Euskara:eu", page("Kanpamendua", ["Kaixo"])],
    ]);
    expect(out).toEqual({
      es: [{ title: "Campamento", description: "<p>Hola</p>" }],
      eu: [{ title: "Kanpamendua", description: "Kaixo" }],
    });
  });

  it("keeps the order of an event-type page's events and caps long descriptions", () => {
    const type = (a, b) => ({ seo: { events: [{ title: a, notes: ["x".repeat(900)] }, { title: b }] } });
    const out = posterTexts([["es", type("Misa", "Coro")], ["eu", type("Meza", "Abesbatza")]]);
    expect(out.eu.map((e) => e.title)).toEqual(["Meza", "Abesbatza"]);
    expect(out.es[0].description).toHaveLength(700);
    expect(out.es[1].description).toBe("");
  });

  it("is null for pages without events and for single-language sites", () => {
    expect(posterTexts([["es", { seo: {} }], ["eu", { seo: {} }]])).toBeNull();
    expect(posterTexts([["es", {}], ["eu", page("x")]])).toBeNull();
    expect(posterTexts([["es", page("Misa", ["a"])]])).toBeNull();
  });
});
