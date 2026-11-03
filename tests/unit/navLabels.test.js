import { describe, it, expect } from "vitest";
import { NAV_LABELS, translateNavLabel, navComparator } from "../../docs/.vitepress/navLabels.js";

describe("translateNavLabel", () => {
  it("translates the main menus for es/en/eu/fr", () => {
    expect(translateNavLabel("Parroquias", "Español:es")).toBe("Parroquias");
    expect(translateNavLabel("Parroquias", "English:en")).toBe("Parishes");
    expect(translateNavLabel("Parroquias", "Euskara:eu")).toBe("Parrokiak");
    expect(translateNavLabel("Parroquias", "Français:fr")).toBe("Paroisses");
    expect(translateNavLabel("Actividades", "Euskara:eu")).toBe("Jarduerak");
    expect(translateNavLabel("Portada", "English:en")).toBe("Home");
  });

  it("accepts a bare code and ignores case/whitespace", () => {
    expect(translateNavLabel("  parroquias ", "en")).toBe("Parishes");
  });

  it("returns undefined for unknown labels or languages", () => {
    expect(translateNavLabel("Otra cosa", "English:en")).toBeUndefined();
    expect(translateNavLabel("Parroquias", "Română:ro")).toBeUndefined();
  });

  it("has every language for every label", () => {
    const langs = Object.keys(NAV_LABELS.portada);
    for (const label of Object.values(NAV_LABELS)) expect(Object.keys(label)).toEqual(langs);
    for (const code of ["es", "en", "eu", "fr"]) expect(langs).toContain(code);
  });
});

describe("navComparator", () => {
  const sorted = (lang, texts) => texts.map((text) => ({ text, link: "/" + text })).sort(navComparator(lang)).map((i) => i.text);

  it("ignores case and accents", () => {
    expect(sorted("Español:es", ["zeta", "Álamo", "beta", "Alfa"])).toEqual(["Álamo", "Alfa", "beta", "zeta"]);
  });

  it("sorts numbers by value", () => {
    expect(sorted("English:en", ["Tema 10", "Tema 2", "Tema 1"])).toEqual(["Tema 1", "Tema 2", "Tema 10"]);
  });

  it("uses the language's own alphabet (Spanish ñ after n)", () => {
    expect(sorted("Español:es", ["Ñoño", "Oso", "Nube"])).toEqual(["Nube", "Ñoño", "Oso"]);
  });

  it("sorts Basque and French titles", () => {
    expect(sorted("Euskara:eu", ["Zubieta", "Arruitz", "Leitza"])).toEqual(["Arruitz", "Leitza", "Zubieta"]);
    expect(sorted("Français:fr", ["Été", "Zèbre", "Eglise"])).toEqual(["Eglise", "Été", "Zèbre"]);
  });

  it("does not throw on odd input", () => {
    expect(() => sorted("xx", ["b", "a"])).not.toThrow();
    expect(navComparator("Foo:!!bad")({}, {})).toBe(0);
  });
});
