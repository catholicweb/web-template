import { describe, it, expect } from "vitest";
import { createNaming } from "../../docs/.vitepress/naming.js";
import { placeLinksFor } from "../../docs/.vitepress/pageBuilder.js";

const template = { protected: "Plantilla templos", sections: [{ type: "text" }] };
const places = [
  { id: "a", name: "Iglesia de San Juan" },
  { id: "b", name: "Capilla", createPage: false },
  { id: "c", name: "" },
];
const dictionary = { "English:en": { "Iglesia de San Juan": "Saint John Church" } };
const NAMING = createNaming({ languages: ["Español:es", "English:en"], dictionary });
const ctx = (list = [template]) => ({ config: { pages: { list }, info: { places } }, NAMING, dictionary });

describe("placeLinksFor", () => {
  it("links the places that get a page, keyed by their name", () => {
    expect(placeLinksFor(ctx(), "Español:es")).toEqual({ "Iglesia de San Juan": "/iglesia-de-san-juan" });
  });

  it("follows the translated page name and language prefix", () => {
    expect(placeLinksFor(ctx(), "English:en")).toEqual({ "Iglesia de San Juan": "/en/saint-john-church" });
  });

  it("skips places with createPage false and places without a name", () => {
    const links = placeLinksFor(ctx(), "Español:es");
    expect(links.Capilla).toBeUndefined();
    expect(Object.keys(links)).toHaveLength(1);
  });

  it("returns nothing without a usable town template", () => {
    expect(placeLinksFor(ctx([]), "Español:es")).toEqual({});
    expect(placeLinksFor(ctx([{ ...template, sections: [] }]), "Español:es")).toEqual({});
  });
});
