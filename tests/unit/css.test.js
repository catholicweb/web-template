import { describe, it, expect } from "vitest";
import { camelCase, getHue } from "../../docs/.vitepress/css.js";

describe("camelCase", () => {
  it("turns a font family into a PascalCase filename stem", () => {
    expect(camelCase("open sans")).toBe("OpenSans");
    expect(camelCase("Montserrat")).toBe("Montserrat");
    expect(camelCase("Open Sans")).toBe("OpenSans");
  });

  it("returns empty string for empty or undefined input", () => {
    expect(camelCase("")).toBe("");
    expect(camelCase(undefined)).toBe("");
    expect(camelCase(null)).toBe("");
  });
});

describe("getHue", () => {
  it("computes hue for primary colors", () => {
    expect(getHue("#ff0000")).toBeCloseTo(0); // red
    expect(getHue("#00ff00")).toBeCloseTo(120); // green
    expect(getHue("#0000ff")).toBeCloseTo(240); // blue
  });

  it("returns 0 for achromatic colors (grey/white)", () => {
    expect(getHue("#ffffff")).toBe(0);
    expect(getHue("#808080")).toBe(0);
  });

  it("returns 0 when hex is not inspectable (throws)", () => {
    expect(getHue(null)).toBe(0);
    expect(getHue(undefined)).toBe(0);
  });
});
