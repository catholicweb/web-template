import { describe, it, expect } from "vitest";
import { parseJSON, normalizeConfig, siteOrigin } from "../../docs/.vitepress/fetch.js";

const DATA = "https://data.parroquia.app";

describe("parseJSON", () => {
  it("parses well-formed JSON", () => {
    expect(parseJSON('{"title":"X"}')).toEqual({ title: "X" });
  });

  it("tolerates trailing commas before } and ]", () => {
    const text = '{"title":"X","theme":{"accent":"#fff",},"pages":["a","b",]}';
    expect(parseJSON(text)).toEqual({
      title: "X",
      theme: { accent: "#fff" },
      pages: ["a", "b"],
    });
  });

  it("returns the fallback on malformed JSON", () => {
    expect(parseJSON("{not json", { ok: false })).toEqual({ ok: false });
    expect(parseJSON("", "fallback")).toBe("fallback");
  });
});

describe("normalizeConfig", () => {
  it("passes flat top-level fields through untouched", () => {
    const raw = {
      title: "Parroquia",
      description: "desc",
      languages: ["Español:es"],
      theme: { accentColor: "#111" },
      social: ["https://x.com"],
      nav: [{ title: "M", links: [0] }],
    };
    const out = normalizeConfig(raw);
    expect(out.title).toBe("Parroquia");
    expect(out.description).toBe("desc");
    expect(out.languages).toEqual(["Español:es"]);
    expect(out.theme).toEqual({ accentColor: "#111" });
    expect(out.social).toEqual(["https://x.com"]);
    expect(out.nav).toEqual([{ title: "M", links: [0] }]);
    // media base defaults to the data host + slug (empty here)
    expect(out._media.base).toBe(`${DATA}/`);
  });

  it("falls back to the nested site.* / pages.* schema", () => {
    const raw = {
      site: { title: "Nested", description: "nd", theme: { accentColor: "#222" } },
      pages: { languages: ["Euskara:eu"] },
    };
    const out = normalizeConfig(raw);
    expect(out.title).toBe("Nested");
    expect(out.description).toBe("nd");
    expect(out.theme).toEqual({ accentColor: "#222" });
    expect(out.languages).toEqual(["Euskara:eu"]);
  });

  it("applies default fallbacks for missing keys", () => {
    const out = normalizeConfig({});
    expect(out.title).toBeUndefined();
    expect(out.theme).toEqual({});
    expect(out.nav).toEqual([]);
    expect(out.dev).toEqual({});
    expect(out._media.base).toBe(`${DATA}/`);
  });

  it("derives media base from _media.slug when present", () => {
    const out = normalizeConfig({ _media: { slug: "47herri" } });
    expect(out._media.base).toBe(`${DATA}/47herri`);
  });
});

describe("siteOrigin", () => {
  it("builds the parroquia.app origin from the slug", () => {
    expect(siteOrigin({}, "47herri")).toBe("https://47herri.parroquia.app");
    expect(siteOrigin({}, "test")).toBe("https://test.parroquia.app");
  });

  it("ignores config.dev.siteurl (host is pinned to parroquia.app)", () => {
    // Early return in siteOrigin restricts the host; siteurl is intentionally
    // not consulted (SSRF hardening, see fetch.js SECURITY NOTE).
    expect(siteOrigin({ dev: { siteurl: "https://evil.example.com" } }, "foo")).toBe(
      "https://foo.parroquia.app"
    );
  });
});
