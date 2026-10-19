import { describe, it, expect } from "vitest";
import { translateValue, translateObject, extractValues } from "../../docs/.vitepress/translate.js";

describe("translateValue", () => {
  it("looks up a value in the dictionary", () => {
    expect(translateValue("Hola", { Hola: "Kaixo" })).toBe("Kaixo");
  });

  it("passes through values missing from the dictionary", () => {
    expect(translateValue("Hola", {})).toBe("Hola");
  });

  it("translates multi-paragraph strings piecewise", () => {
    expect(translateValue("Hola\n\nAdiós", { Hola: "Kaixo", Adiós: "Agur" })).toBe("Kaixo\n\nAgur");
  });

  it("returns non-string values unchanged", () => {
    expect(translateValue(5, {})).toBe(5);
    expect(translateValue(["a"], { a: "b" })).toEqual(["a"]);
  });
});

describe("translateObject", () => {
  it("recursively translates FIELDS but leaves non-FIELD keys", () => {
    const result = translateObject(
      { title: "Hola", description: "Adiós", other: "no", list: [{ name: "A" }] },
      { Hola: "Kaixo", Adiós: "Agur", A: "a" }
    );
    expect(result).toEqual({
      title: "Kaixo",
      description: "Agur",
      other: "no",
      list: [{ name: "a" }],
    });
  });

  it("translates the event type title of calendar events", () => {
    const result = translateObject(
      [{ eventTypeTitle: "Misa", title: "Misa", type: "misa" }],
      { Misa: "Meza" }
    );
    expect(result).toEqual([{ eventTypeTitle: "Meza", title: "Meza", type: "misa" }]);
  });

  it("records translatable strings from FIELDS values", () => {
    expect(extractValues({ title: "Hola\n\nMundo", name: "A" })).toEqual(["Hola", "Mundo", "A"]);
  });
});

describe("extractValues", () => {
  it("splits multi-paragraph values and trims each part", () => {
    expect(extractValues({ title: "Primer\n  \nSegundo" })).toEqual(["Primer", "Segundo"]);
  });

  it("extracts the event type title so it reaches the dictionary", () => {
    expect(extractValues([{ eventTypeTitle: "Misa" }])).toEqual(["Misa"]);
  });

  it("does not extract strings nested under non-FIELD keys", () => {
    expect(extractValues({ lista: ["B", "C"] })).toEqual([]);
  });
});
