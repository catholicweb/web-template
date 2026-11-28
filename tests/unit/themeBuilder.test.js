import { describe, it, expect, vi } from "vitest";
import { generateThemeCSS, resolveTheme } from "../../docs/.vitepress/themeBuilder.js";
import { VIBES } from "../../docs/.vitepress/themeTokens.js";

vi.spyOn(console, "log").mockImplementation(() => {});

describe("resolveTheme", () => {
  it("keeps the legacy look with no tokens set", () => {
    const t = resolveTheme({});
    expect(t).toMatchObject({ bodySize: 1, accentChroma: 1, neutralTint: "default", pageBackground: "white", sectionRhythm: "none", buttonStyle: "solid", headingStyle: "normal", divider: "none", surfaceStyle: "flat", motionIntensity: 0 });
  });

  it("clamps numbers and rejects unknown enum values", () => {
    const t = resolveTheme({ bodySize: 9, accentChroma: -1, neutralTint: "neon", buttonStyle: "x;y" });
    expect(t.bodySize).toBe(1.6);
    expect(t.accentChroma).toBe(0.2);
    expect(t.neutralTint).toBe("default");
    expect(t.buttonStyle).toBe("solid");
  });

  it("a vibe supplies defaults, explicit values win", () => {
    const t = resolveTheme({ vibe: "readable", bodySize: 1.1, divider: "" });
    expect(t.bodySize).toBe(1.1); // explicit
    expect(t.fontPair).toBe(VIBES.readable.tokens.fontPair); // from the vibe
    expect(t.divider).toBe("line"); // empty string counts as unset
  });

  it("ignores unknown vibes", () => {
    expect(resolveTheme({ vibe: "nope" })).toEqual(resolveTheme({}));
    expect(resolveTheme({ vibe: "__proto__" })).toEqual(resolveTheme({}));
  });

  it("every vibe only uses valid token values", () => {
    for (const [id, { tokens }] of Object.entries(VIBES)) {
      const t = resolveTheme({ vibe: id });
      for (const [k, v] of Object.entries(tokens)) expect(t[k], `${id}.${k}`).toBe(v);
    }
  });
});

describe("generateThemeCSS", () => {
  const css = (theme) => generateThemeCSS(theme, true);

  it("emits the body scale and scales text sizes", () => {
    const out = css({ bodySize: 1.25 });
    expect(out).toContain("--body-scale: 1.25;");
    expect(out).toContain("--text-sm: calc(0.875rem * var(--body-scale));");
    expect(out).toContain(".prose { font-size: calc(1rem * var(--body-scale)); }");
  });

  it("scales the accent chroma", () => {
    expect(css({ accentChroma: 0.5 })).toContain("--color-accent: oklch(64% 0.1 var(--accent-hue));");
  });

  it("only overrides grays for a tinted neutral", () => {
    expect(css({})).not.toContain("--color-gray-100:");
    expect(css({ neutralTint: "warm" })).toContain("--color-gray-100: oklch(96.7% 0.01 75);");
    expect(css({ neutralTint: "pure" })).toContain("--color-slate-900: oklch(21% 0 0);");
  });

  it("emits button, rhythm and divider rules only when asked", () => {
    const plain = css({});
    expect(plain).not.toContain(":is(a, button).bg-accent");
    expect(plain).not.toContain("nth-of-type(even)");
    const styled = css({ buttonStyle: "outline", sectionRhythm: "alternate", divider: "ornament" });
    expect(styled).toContain(":is(a, button).bg-accent.text-white { background: transparent;");
    expect(styled).toContain("nth-of-type(even)");
    expect(styled).toContain("mask:");
  });

  it("applies the heading style", () => {
    expect(css({ headingStyle: "wide" })).toContain("h1, h2, h3 { text-transform: uppercase; letter-spacing: 0.14em; }");
  });

  it("motion intensity is no longer forced to 0", () => {
    const out = css({ motionIntensity: 7 });
    expect(out).toContain("animation-timeline: view()");
    expect(out).toContain("@keyframes fx-slide-in");
  });

  it("surface styles map to shadows", () => {
    expect(css({})).toContain("--shadow-md-val: none;");
    expect(css({ surfaceStyle: "hard" })).toContain("--shadow-md-val: 4px 4px 0 0");
  });
});
